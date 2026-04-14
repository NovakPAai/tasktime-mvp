/**
 * Unit-тесты для Workflow Engine
 * Тестируем чистые функции и сервисный слой с vi.mock — без реальной БД и Redis.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../src/prisma/client.js', () => ({
  prisma: {
    workflowSchemeProject: { findUnique: vi.fn() },
    workflowSchemeItem: { findMany: vi.fn(), count: vi.fn() },
    workflow: { findFirst: vi.fn(), findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), create: vi.fn() },
    workflowStep: { create: vi.fn() },
    workflowTransition: { create: vi.fn() },
    issue: { findMany: vi.fn() },
    issueCustomFieldValue: { findMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock('../src/shared/redis.js', () => ({
  getCachedJson: vi.fn(),
  setCachedJson: vi.fn(),
  deleteCachedByPattern: vi.fn(),
}));

vi.mock('../src/modules/issue-custom-fields/issue-custom-fields.service.js', () => ({
  getApplicableFields: vi.fn(),
}));

// ─── Imports after mocks ──────────────────────────────────────────────────────

import { prisma } from '../src/prisma/client.js';
import { getCachedJson, setCachedJson, deleteCachedByPattern } from '../src/shared/redis.js';
import { getApplicableFields } from '../src/modules/issue-custom-fields/issue-custom-fields.service.js';
import { evaluateConditions } from '../src/modules/workflow-engine/conditions/index.js';
import { validateAllSubtasksDone } from '../src/modules/workflow-engine/validators/subtasks-done.validator.js';
import { validateRequiredFields } from '../src/modules/workflow-engine/validators/required-fields.validator.js';
import {
  resolveWorkflowForIssue,
  invalidateWorkflowCache,
  invalidateWorkflowCacheByWorkflowId,
} from '../src/modules/workflow-engine/workflow-engine.service.js';
import { validateWorkflow, ensureWorkflowEditable } from '../src/modules/workflows/workflows.service.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const mockPrisma = prisma as unknown as {
  workflowSchemeProject: { findUnique: ReturnType<typeof vi.fn> };
  workflowSchemeItem: { findMany: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn> };
  workflow: {
    findFirst: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    findUniqueOrThrow: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  workflowStep: { create: ReturnType<typeof vi.fn> };
  workflowTransition: { create: ReturnType<typeof vi.fn> };
  issue: { findMany: ReturnType<typeof vi.fn> };
  issueCustomFieldValue: { findMany: ReturnType<typeof vi.fn> };
  $transaction: ReturnType<typeof vi.fn>;
};

const mockGetCachedJson = getCachedJson as ReturnType<typeof vi.fn>;
const mockSetCachedJson = setCachedJson as ReturnType<typeof vi.fn>;
const mockDeleteCachedByPattern = deleteCachedByPattern as ReturnType<typeof vi.fn>;
const mockGetApplicableFields = getApplicableFields as ReturnType<typeof vi.fn>;

function makeWorkflow(overrides: object = {}) {
  return {
    id: 'wf-1',
    name: 'Default',
    isDefault: true,
    isSystem: false,
    steps: [],
    transitions: [],
    ...overrides,
  };
}

function makeStatus(overrides: object = {}) {
  return { id: 'st-1', name: 'Open', category: 'TODO', color: '#2196F3', systemKey: 'OPEN', ...overrides };
}

function makeStep(overrides: object = {}) {
  return { id: 'step-1', workflowId: 'wf-1', statusId: 'st-1', isInitial: false, orderIndex: 0, status: makeStatus(), ...overrides };
}

function makeTransition(overrides: object = {}) {
  return { id: 'tr-1', workflowId: 'wf-1', name: 'To Done', fromStatusId: 'st-1', toStatusId: 'st-done', isGlobal: false, orderIndex: 0, ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ══════════════════════════════════════════════════════════════════════════════
// 1. Redis-кэш — resolveWorkflowForIssue
// ══════════════════════════════════════════════════════════════════════════════

describe('resolveWorkflowForIssue — Redis cache', () => {
  const issue = { projectId: 'proj-1', issueTypeConfigId: null };

  it('cache hit: не делает Prisma-запросов, возвращает закэшированный результат', async () => {
    const cached = makeWorkflow({ id: 'cached-wf' });
    mockGetCachedJson.mockResolvedValueOnce(cached);

    const result = await resolveWorkflowForIssue(issue);

    expect(result).toEqual(cached);
    expect(mockPrisma.workflowSchemeProject.findUnique).not.toHaveBeenCalled();
    expect(mockSetCachedJson).not.toHaveBeenCalled();
  });

  it('cache miss: делает DB-запрос, сохраняет в Redis с TTL=300', async () => {
    mockGetCachedJson.mockResolvedValueOnce(null);
    mockPrisma.workflowSchemeProject.findUnique.mockResolvedValueOnce(null);
    const wf = makeWorkflow();
    mockPrisma.workflow.findFirst.mockResolvedValueOnce({ id: wf.id });
    // loadWorkflowFull uses findUniqueOrThrow — mock it
    // findUniqueOrThrow override:
    const originalPrisma = prisma as unknown as { workflow: { findUniqueOrThrow: ReturnType<typeof vi.fn> } };
    originalPrisma.workflow.findUniqueOrThrow.mockResolvedValueOnce(wf);

    await resolveWorkflowForIssue(issue);

    expect(mockSetCachedJson).toHaveBeenCalledWith(
      `wf:proj-1:default`,
      expect.objectContaining({ id: wf.id }),
      300,
    );
  });

  it('Redis недоступен (null): fallback на DB без ошибки', async () => {
    mockGetCachedJson.mockResolvedValueOnce(null);
    mockSetCachedJson.mockResolvedValueOnce(undefined);
    mockPrisma.workflowSchemeProject.findUnique.mockResolvedValueOnce(null);
    const wf = makeWorkflow();
    mockPrisma.workflow.findFirst.mockResolvedValueOnce({ id: wf.id });
    const orig = prisma as unknown as { workflow: { findUniqueOrThrow: ReturnType<typeof vi.fn> } };
    orig.workflow.findUniqueOrThrow.mockResolvedValueOnce(wf);

    // Should not throw even if setCachedJson is called with null client
    await expect(resolveWorkflowForIssue(issue)).resolves.toBeDefined();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 2. invalidateWorkflowCache
// ══════════════════════════════════════════════════════════════════════════════

describe('invalidateWorkflowCache', () => {
  it('вызывает deleteCachedByPattern с правильным шаблоном', async () => {
    await invalidateWorkflowCache('proj-42');
    expect(mockDeleteCachedByPattern).toHaveBeenCalledWith('wf:proj-42:*');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 3. invalidateWorkflowCacheByWorkflowId
// ══════════════════════════════════════════════════════════════════════════════

describe('invalidateWorkflowCacheByWorkflowId', () => {
  it('находит projectIds через scheme и инвалидирует каждый', async () => {
    mockPrisma.workflowSchemeItem.findMany.mockResolvedValueOnce([
      { scheme: { projects: [{ projectId: 'p1' }, { projectId: 'p2' }] } },
    ]);

    await invalidateWorkflowCacheByWorkflowId('wf-99');

    expect(mockDeleteCachedByPattern).toHaveBeenCalledWith('wf:p1:*');
    expect(mockDeleteCachedByPattern).toHaveBeenCalledWith('wf:p2:*');
  });

  it('если ключей нет — не вызывает deleteCachedByPattern', async () => {
    mockPrisma.workflowSchemeItem.findMany.mockResolvedValueOnce([]);
    await invalidateWorkflowCacheByWorkflowId('wf-empty');
    expect(mockDeleteCachedByPattern).not.toHaveBeenCalled();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 4. validateWorkflow — graph validation
// ══════════════════════════════════════════════════════════════════════════════

describe('validateWorkflow', () => {
  function makeWorkflowWithStepsAndTransitions(steps: object[], transitions: object[]) {
    const wf = {
      id: 'wf-test',
      name: 'Test',
      isDefault: false,
      isSystem: false,
      steps,
      transitions,
    };
    const orig = prisma as unknown as { workflow: { findUnique: ReturnType<typeof vi.fn> } };
    orig.workflow.findUnique.mockResolvedValueOnce(wf);
    return wf;
  }

  it('NO_INITIAL_STATUS: нет шага с isInitial=true → isValid=false', async () => {
    const stOpen = makeStatus({ id: 'st-open', category: 'TODO' });
    makeWorkflowWithStepsAndTransitions(
      [makeStep({ statusId: 'st-open', isInitial: false, status: stOpen })],
      [],
    );

    const report = await validateWorkflow('wf-test');
    expect(report.isValid).toBe(false);
    expect(report.errors.some((e) => e.type === 'NO_INITIAL_STATUS')).toBe(true);
  });

  it('NO_DONE_STATUS: нет шага со статусом category=DONE → isValid=false', async () => {
    const stOpen = makeStatus({ id: 'st-open', category: 'TODO' });
    makeWorkflowWithStepsAndTransitions(
      [makeStep({ statusId: 'st-open', isInitial: true, status: stOpen })],
      [],
    );

    const report = await validateWorkflow('wf-test');
    expect(report.isValid).toBe(false);
    expect(report.errors.some((e) => e.type === 'NO_DONE_STATUS')).toBe(true);
  });

  it('DEAD_END_STATUS: шаг без исходящих transitions и не DONE → warning', async () => {
    const stDone = makeStatus({ id: 'st-done', category: 'DONE', systemKey: 'DONE' });
    const stOpen = makeStatus({ id: 'st-open', category: 'TODO' });
    const stMid = makeStatus({ id: 'st-mid', category: 'IN_PROGRESS', name: 'Mid' });
    makeWorkflowWithStepsAndTransitions(
      [
        makeStep({ id: 'step-1', statusId: 'st-open', isInitial: true, status: stOpen }),
        makeStep({ id: 'step-2', statusId: 'st-mid', isInitial: false, status: stMid }),
        makeStep({ id: 'step-3', statusId: 'st-done', isInitial: false, status: stDone }),
      ],
      [makeTransition({ fromStatusId: 'st-open', toStatusId: 'st-done' })],
      // st-mid has no outgoing — DEAD_END
    );

    const report = await validateWorkflow('wf-test');
    expect(report.warnings.some((w) => w.type === 'DEAD_END_STATUS' && w.statusId === 'st-mid')).toBe(true);
  });

  it('UNREACHABLE_STATUS: недостижимый из isInitial через BFS → warning', async () => {
    const stOpen = makeStatus({ id: 'st-open', category: 'TODO' });
    const stDone = makeStatus({ id: 'st-done', category: 'DONE', systemKey: 'DONE' });
    const stOrphan = makeStatus({ id: 'st-orphan', category: 'IN_PROGRESS', name: 'Orphan' });
    makeWorkflowWithStepsAndTransitions(
      [
        makeStep({ statusId: 'st-open', isInitial: true, status: stOpen }),
        makeStep({ statusId: 'st-done', isInitial: false, status: stDone }),
        makeStep({ statusId: 'st-orphan', isInitial: false, status: stOrphan }),
      ],
      [makeTransition({ fromStatusId: 'st-open', toStatusId: 'st-done' })],
      // st-orphan not reachable
    );

    const report = await validateWorkflow('wf-test');
    expect(report.warnings.some((w) => w.type === 'UNREACHABLE_STATUS' && w.statusId === 'st-orphan')).toBe(true);
  });

  it('UNUSED_STATUS: шаг не фигурирует ни в одном transition → warning', async () => {
    const stOpen = makeStatus({ id: 'st-open', category: 'TODO' });
    const stDone = makeStatus({ id: 'st-done', category: 'DONE' });
    const stUnused = makeStatus({ id: 'st-unused', category: 'TODO', name: 'Unused' });
    makeWorkflowWithStepsAndTransitions(
      [
        makeStep({ statusId: 'st-open', isInitial: true, status: stOpen }),
        makeStep({ statusId: 'st-done', isInitial: false, status: stDone }),
        makeStep({ statusId: 'st-unused', isInitial: false, status: stUnused }),
      ],
      [makeTransition({ fromStatusId: 'st-open', toStatusId: 'st-done' })],
    );

    const report = await validateWorkflow('wf-test');
    expect(report.warnings.some((w) => w.type === 'UNUSED_STATUS' && w.statusId === 'st-unused')).toBe(true);
  });

  it('корректный граф → isValid=true, errors=[], warnings=[]', async () => {
    const stOpen = makeStatus({ id: 'st-open', category: 'TODO' });
    const stDone = makeStatus({ id: 'st-done', category: 'DONE' });
    makeWorkflowWithStepsAndTransitions(
      [
        makeStep({ statusId: 'st-open', isInitial: true, status: stOpen }),
        makeStep({ statusId: 'st-done', isInitial: false, status: stDone }),
      ],
      [makeTransition({ fromStatusId: 'st-open', toStatusId: 'st-done' })],
    );

    const report = await validateWorkflow('wf-test');
    expect(report.isValid).toBe(true);
    expect(report.errors).toHaveLength(0);
    expect(report.warnings).toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 5. ensureWorkflowEditable — Copy-on-Write
// ══════════════════════════════════════════════════════════════════════════════

describe('ensureWorkflowEditable', () => {
  it('usageCount=0 → возвращает {id, isDraft: false}, не создаёт копию', async () => {
    mockPrisma.workflowSchemeItem.count.mockResolvedValueOnce(0);

    const result = await ensureWorkflowEditable('wf-free');
    expect(result).toEqual({ id: 'wf-free', isDraft: false });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('usageCount>0 → создаёт draft через $transaction, возвращает {id: draftId, isDraft: true}', async () => {
    mockPrisma.workflowSchemeItem.count.mockResolvedValueOnce(2);
    const sourceWf = {
      id: 'wf-active',
      name: 'Active Flow',
      description: null,
      isDefault: false,
      isSystem: false,
      steps: [{ id: 's1', statusId: 'st-1', isInitial: true, orderIndex: 0 }],
      transitions: [{ id: 't1', fromStatusId: 'st-1', toStatusId: 'st-2', isGlobal: false, orderIndex: 0, name: 'Go', conditions: null, validators: null, postFunctions: null, screenId: null }],
    };
    const draftWf = { id: 'wf-draft-123' };

    mockPrisma.workflow.findUniqueOrThrow.mockResolvedValueOnce(sourceWf);
    mockPrisma.$transaction.mockImplementationOnce(async (cb: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        workflow: { create: vi.fn().mockResolvedValue(draftWf) },
        workflowStep: { create: vi.fn().mockResolvedValue({}) },
        workflowTransition: { create: vi.fn().mockResolvedValue({}) },
      };
      return cb(tx);
    });

    const result = await ensureWorkflowEditable('wf-active');
    expect(result.isDraft).toBe(true);
    expect(result.id).toBe('wf-draft-123');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 6. evaluateConditions — conditions/index.ts
// ══════════════════════════════════════════════════════════════════════════════

describe('evaluateConditions', () => {
  const ctx = {
    actorId: 'user-1',
    actorRoles: ['USER'] as const,
    issue: { assigneeId: 'user-1', creatorId: 'user-2' },
  };

  it('USER_HAS_GLOBAL_ROLE: соответствует → true', () => {
    expect(evaluateConditions([{ type: 'USER_HAS_GLOBAL_ROLE', roles: ['USER', 'ADMIN'] }], ctx)).toBe(true);
  });

  it('USER_HAS_GLOBAL_ROLE: не соответствует → false', () => {
    expect(evaluateConditions([{ type: 'USER_HAS_GLOBAL_ROLE', roles: ['ADMIN'] }], ctx)).toBe(false);
  });

  it('USER_IS_ASSIGNEE: актор = assignee → true', () => {
    expect(evaluateConditions([{ type: 'USER_IS_ASSIGNEE' }], ctx)).toBe(true);
  });

  it('USER_IS_ASSIGNEE: актор ≠ assignee → false', () => {
    const ctx2 = { ...ctx, actorId: 'other-user' };
    expect(evaluateConditions([{ type: 'USER_IS_ASSIGNEE' }], ctx2)).toBe(false);
  });

  it('USER_IS_REPORTER: актор = creator → true', () => {
    const ctx3 = { ...ctx, actorId: 'user-2' };
    expect(evaluateConditions([{ type: 'USER_IS_REPORTER' }], ctx3)).toBe(true);
  });

  it('ANY_OF: хотя бы одно условие истинно → true', () => {
    expect(evaluateConditions([{
      type: 'ANY_OF',
      conditions: [
        { type: 'USER_HAS_GLOBAL_ROLE', roles: ['ADMIN'] }, // false
        { type: 'USER_IS_ASSIGNEE' }, // true
      ],
    }], ctx)).toBe(true);
  });

  it('ANY_OF: все условия ложны → false', () => {
    expect(evaluateConditions([{
      type: 'ANY_OF',
      conditions: [
        { type: 'USER_HAS_GLOBAL_ROLE', roles: ['ADMIN'] },
        { type: 'USER_IS_REPORTER' }, // actorId=user-1, creatorId=user-2 → false
      ],
    }], ctx)).toBe(false);
  });

  it('ALL_OF: все условия истинны → true', () => {
    expect(evaluateConditions([{
      type: 'ALL_OF',
      conditions: [
        { type: 'USER_HAS_GLOBAL_ROLE', roles: ['USER'] },
        { type: 'USER_IS_ASSIGNEE' },
      ],
    }], ctx)).toBe(true);
  });

  it('ALL_OF: хотя бы одно ложно → false', () => {
    expect(evaluateConditions([{
      type: 'ALL_OF',
      conditions: [
        { type: 'USER_HAS_GLOBAL_ROLE', roles: ['USER'] },
        { type: 'USER_HAS_GLOBAL_ROLE', roles: ['ADMIN'] },
      ],
    }], ctx)).toBe(false);
  });

  it('вложенность 3+ уровней: ANY_OF внутри ALL_OF', () => {
    const result = evaluateConditions([{
      type: 'ALL_OF',
      conditions: [
        { type: 'USER_IS_ASSIGNEE' },
        {
          type: 'ANY_OF',
          conditions: [
            { type: 'USER_HAS_GLOBAL_ROLE', roles: ['ADMIN'] }, // false
            { type: 'USER_HAS_GLOBAL_ROLE', roles: ['USER'] },  // true
          ],
        },
      ],
    }], ctx);
    expect(result).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 7. validateAllSubtasksDone — validators/subtasks-done.validator.ts
// ══════════════════════════════════════════════════════════════════════════════

describe('validateAllSubtasksDone', () => {
  it('все подзадачи выполнены (workflowStatus.category=DONE) → не бросает ошибку', async () => {
    mockPrisma.issue.findMany.mockResolvedValueOnce([
      { id: 'child-1', status: 'DONE', workflowStatus: { category: 'DONE' } },
    ]);

    await expect(validateAllSubtasksDone('parent-1')).resolves.toBeUndefined();
  });

  it('нет подзадач → не бросает ошибку', async () => {
    mockPrisma.issue.findMany.mockResolvedValueOnce([]);
    await expect(validateAllSubtasksDone('parent-1')).resolves.toBeUndefined();
  });

  it('есть незакрытые подзадачи → бросает AppError 422 с деталями', async () => {
    mockPrisma.issue.findMany.mockResolvedValueOnce([
      { id: 'child-1', status: 'IN_PROGRESS', workflowStatus: { category: 'IN_PROGRESS' } },
      { id: 'child-2', status: 'DONE', workflowStatus: { category: 'DONE' } },
    ]);

    await expect(validateAllSubtasksDone('parent-1')).rejects.toMatchObject({
      statusCode: 422,
      code: 'VALIDATOR_FAILED',
    });
  });

  it('workflowStatus отсутствует — fallback по legacy status', async () => {
    mockPrisma.issue.findMany.mockResolvedValueOnce([
      { id: 'child-1', status: 'IN_PROGRESS', workflowStatus: null },
    ]);

    await expect(validateAllSubtasksDone('parent-1')).rejects.toMatchObject({
      statusCode: 422,
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 8. validateRequiredFields — validators/required-fields.validator.ts
// ══════════════════════════════════════════════════════════════════════════════

describe('validateRequiredFields', () => {
  const rule = { type: 'REQUIRED_FIELDS' as const, fieldIds: undefined };

  it('все обязательные поля заполнены → не бросает ошибку', async () => {
    mockGetApplicableFields.mockResolvedValueOnce([
      { customFieldId: 'cf-1', name: 'Priority', fieldType: 'TEXT', isRequired: true },
    ]);
    mockPrisma.issueCustomFieldValue.findMany.mockResolvedValueOnce([
      { customFieldId: 'cf-1', value: 'HIGH' },
    ]);

    await expect(validateRequiredFields('issue-1', rule)).resolves.toBeUndefined();
  });

  it('незаполненное обязательное поле → бросает AppError 422 с fieldIds', async () => {
    mockGetApplicableFields.mockResolvedValueOnce([
      { customFieldId: 'cf-2', name: 'Resolution', fieldType: 'TEXT', isRequired: true },
    ]);
    mockPrisma.issueCustomFieldValue.findMany.mockResolvedValueOnce([]);

    await expect(validateRequiredFields('issue-1', rule)).rejects.toMatchObject({
      statusCode: 422,
      code: 'VALIDATOR_FAILED',
    });
  });

  it('пустая строка считается незаполненной', async () => {
    mockGetApplicableFields.mockResolvedValueOnce([
      { customFieldId: 'cf-3', name: 'Notes', fieldType: 'TEXT', isRequired: true },
    ]);
    mockPrisma.issueCustomFieldValue.findMany.mockResolvedValueOnce([
      { customFieldId: 'cf-3', value: '' },
    ]);

    await expect(validateRequiredFields('issue-1', rule)).rejects.toMatchObject({ statusCode: 422 });
  });

  it('нет обязательных полей → не бросает ошибку', async () => {
    mockGetApplicableFields.mockResolvedValueOnce([
      { customFieldId: 'cf-4', name: 'Optional', fieldType: 'TEXT', isRequired: false },
    ]);
    mockPrisma.issueCustomFieldValue.findMany.mockResolvedValueOnce([]);

    await expect(validateRequiredFields('issue-1', rule)).resolves.toBeUndefined();
  });
});
