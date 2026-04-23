/**
 * TTBULK-1 PR-4 — unit-тест TransitionExecutor.preflight (execute — thin
 * passthrough к `executeTransition` и покрыт workflow-engine'овыми тестами).
 *
 * Матрица preflight:
 *   • NO_ACCESS — actor не SUPER/ADMIN и нет UserProjectRole для проекта issue.
 *   • NO_TRANSITION — transitionId отсутствует в getAvailableTransitions.
 *   • ALREADY_IN_TARGET_STATE — workflowStatusId совпадает с toStatus.id.
 *   • WORKFLOW_REQUIRED_FIELDS → CONFLICT с requiredFields (если не переданы
 *     fieldOverrides).
 *   • WORKFLOW_REQUIRED_FIELDS удовлетворены через fieldOverrides → ELIGIBLE.
 *   • ELIGIBLE + preview diff (fromStatusId → toStatusId).
 *   • SUPER_ADMIN bypass — пропускает RBAC.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockPrisma, mockWorkflow } = vi.hoisted(() => {
  const mockPrisma = {
    userProjectRole: { findFirst: vi.fn() },
  };
  const mockWorkflow = {
    executeTransition: vi.fn(),
    getAvailableTransitions: vi.fn(),
  };
  return { mockPrisma, mockWorkflow };
});

vi.mock('../src/prisma/client.js', () => ({ prisma: mockPrisma }));
vi.mock('../src/modules/workflow-engine/workflow-engine.service.js', () => mockWorkflow);
vi.mock('../src/shared/auth/roles.js', () => ({
  hasAnySystemRole: (roles: string[], required: string[]) => roles.some((r) => required.includes(r)),
}));

const { transitionExecutor } = await import(
  '../src/modules/bulk-operations/executors/transition.executor.js'
);

const baseIssue = {
  id: 'i1',
  number: 1,
  title: 'Test',
  projectId: 'p1',
  workflowStatusId: 'status-1',
  project: { id: 'p1', key: 'TT' },
};
const payload = { type: 'TRANSITION' as const, transitionId: 't-to-done' };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('transitionExecutor.preflight', () => {
  it('NO_ACCESS — юзер без SUPER/ADMIN и без UserProjectRole', async () => {
    mockPrisma.userProjectRole.findFirst.mockResolvedValue(null);
    const res = await transitionExecutor.preflight(
      baseIssue as never,
      payload,
      { userId: 'u1', systemRoles: ['BULK_OPERATOR'] },
    );
    expect(res).toMatchObject({ kind: 'SKIPPED', reasonCode: 'NO_ACCESS' });
    expect(mockWorkflow.getAvailableTransitions).not.toHaveBeenCalled();
  });

  it('SUPER_ADMIN bypass — не проверяет UserProjectRole', async () => {
    mockWorkflow.getAvailableTransitions.mockResolvedValue({
      transitions: [{ id: 't-to-done', toStatus: { id: 'status-2', name: 'Done' }, requiresScreen: false }],
    });
    const res = await transitionExecutor.preflight(
      baseIssue as never,
      payload,
      { userId: 'u1', systemRoles: ['SUPER_ADMIN'] },
    );
    expect(res.kind).toBe('ELIGIBLE');
    expect(mockPrisma.userProjectRole.findFirst).not.toHaveBeenCalled();
  });

  it('NO_TRANSITION — transitionId отсутствует в доступных', async () => {
    mockPrisma.userProjectRole.findFirst.mockResolvedValue({ userId: 'u1' });
    mockWorkflow.getAvailableTransitions.mockResolvedValue({ transitions: [] });
    const res = await transitionExecutor.preflight(
      baseIssue as never,
      payload,
      { userId: 'u1', systemRoles: ['BULK_OPERATOR'] },
    );
    expect(res).toMatchObject({ kind: 'SKIPPED', reasonCode: 'NO_TRANSITION' });
  });

  it('ALREADY_IN_TARGET_STATE — workflowStatusId совпадает с toStatus', async () => {
    mockPrisma.userProjectRole.findFirst.mockResolvedValue({ userId: 'u1' });
    mockWorkflow.getAvailableTransitions.mockResolvedValue({
      transitions: [
        { id: 't-to-done', toStatus: { id: 'status-1', name: 'Done' }, requiresScreen: false },
      ],
    });
    const res = await transitionExecutor.preflight(
      baseIssue as never,
      payload,
      { userId: 'u1', systemRoles: ['BULK_OPERATOR'] },
    );
    expect(res).toMatchObject({ kind: 'SKIPPED', reasonCode: 'ALREADY_IN_TARGET_STATE' });
  });

  it('CONFLICT WORKFLOW_REQUIRED_FIELDS — screen с required field без override', async () => {
    mockPrisma.userProjectRole.findFirst.mockResolvedValue({ userId: 'u1' });
    mockWorkflow.getAvailableTransitions.mockResolvedValue({
      transitions: [
        {
          id: 't-to-done',
          toStatus: { id: 'status-2', name: 'Done' },
          requiresScreen: true,
          screenFields: [{ name: 'Resolution', isRequired: true }],
        },
      ],
    });
    const res = await transitionExecutor.preflight(
      baseIssue as never,
      payload,
      { userId: 'u1', systemRoles: ['BULK_OPERATOR'] },
    );
    expect(res).toMatchObject({
      kind: 'CONFLICT',
      code: 'WORKFLOW_REQUIRED_FIELDS',
      requiredFields: ['Resolution'],
    });
  });

  it('required field удовлетворён через fieldOverrides → ELIGIBLE', async () => {
    mockPrisma.userProjectRole.findFirst.mockResolvedValue({ userId: 'u1' });
    mockWorkflow.getAvailableTransitions.mockResolvedValue({
      transitions: [
        {
          id: 't-to-done',
          toStatus: { id: 'status-2', name: 'Done' },
          requiresScreen: true,
          screenFields: [{ name: 'Resolution', isRequired: true }],
        },
      ],
    });
    const res = await transitionExecutor.preflight(
      baseIssue as never,
      { ...payload, fieldOverrides: { Resolution: 'Fixed' } },
      { userId: 'u1', systemRoles: ['BULK_OPERATOR'] },
    );
    expect(res.kind).toBe('ELIGIBLE');
  });

  it('ELIGIBLE включает preview с fromStatusId/toStatusId', async () => {
    mockPrisma.userProjectRole.findFirst.mockResolvedValue({ userId: 'u1' });
    mockWorkflow.getAvailableTransitions.mockResolvedValue({
      transitions: [
        { id: 't-to-done', toStatus: { id: 'status-2', name: 'Done' }, requiresScreen: false },
      ],
    });
    const res = await transitionExecutor.preflight(
      baseIssue as never,
      payload,
      { userId: 'u1', systemRoles: ['BULK_OPERATOR'] },
    );
    expect(res).toMatchObject({
      kind: 'ELIGIBLE',
      preview: { fromStatusId: 'status-1', toStatusId: 'status-2', toStatusName: 'Done' },
    });
  });
});

describe('transitionExecutor.execute', () => {
  it('проксирует в executeTransition', async () => {
    mockWorkflow.executeTransition.mockResolvedValue({});
    await transitionExecutor.execute(
      baseIssue as never,
      payload,
      { userId: 'u1', systemRoles: ['BULK_OPERATOR'] },
    );
    expect(mockWorkflow.executeTransition).toHaveBeenCalledWith(
      'i1',
      't-to-done',
      'u1',
      ['BULK_OPERATOR'],
      undefined,
    );
  });
});
