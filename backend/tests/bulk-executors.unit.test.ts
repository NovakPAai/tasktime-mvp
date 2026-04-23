/**
 * TTBULK-1 PR-5 — unit-тесты 6 executor'ов (ASSIGN/EDIT_FIELD/EDIT_CUSTOM_FIELD/
 * MOVE_TO_SPRINT/ADD_COMMENT/DELETE).
 *
 * Для каждого executor'а — preflight-матрица (NO_ACCESS / type-specific skip /
 * ELIGIBLE) + execute-passthrough (вызов service'а). SUPER_ADMIN bypass — спот-тест
 * на одном executor'е (паттерн повторяется), т.к. actorHasProjectAccess — shared
 * helper (дублирование намеренное, см. pre-push review PR-3 по extraction).
 *
 * Pure-unit: моки на prisma + service-функции + context.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockPrisma, mockServices, mockContext } = vi.hoisted(() => {
  const mockPrisma = {
    userProjectRole: { findFirst: vi.fn() },
    sprint: { findUnique: vi.fn() },
    auditLog: { create: vi.fn() },
    issue: { findUniqueOrThrow: vi.fn() },
  };
  const mockServices = {
    assignIssue: vi.fn(),
    updateIssue: vi.fn(),
    deleteIssue: vi.fn(),
    createComment: vi.fn(),
    moveIssuesToSprint: vi.fn(),
    upsertIssueCustomFields: vi.fn(),
    getApplicableFields: vi.fn(),
    getEffectiveProjectPermissions: vi.fn(),
  };
  const mockContext = {
    getCurrentBulkOperationId: vi.fn().mockReturnValue(undefined),
  };
  return { mockPrisma, mockServices, mockContext };
});

vi.mock('../src/prisma/client.js', () => ({ prisma: mockPrisma }));
vi.mock('../src/shared/auth/roles.js', () => ({
  hasAnySystemRole: (roles: string[], required: string[]) => roles.some((r) => required.includes(r)),
}));
vi.mock('../src/shared/bulk-operation-context.js', () => mockContext);
// executors/shared.ts — реальный prisma-helper, mock'им напрямую чтобы тесты
// не завязывались на userProjectRole.findFirst в нём.
vi.mock('../src/modules/bulk-operations/executors/shared.js', () => ({
  actorHasProjectAccess: async (actor: { systemRoles: string[]; userId: string }, projectId: string) => {
    if (actor.systemRoles.includes('SUPER_ADMIN')) return true;
    // Для тестов используем тот же mock prisma.userProjectRole.findFirst.
    const m = await mockPrisma.userProjectRole.findFirst({ where: { userId: actor.userId, projectId }, select: { userId: true } });
    return m !== null;
  },
}));
vi.mock('../src/modules/issues/issues.service.js', () => ({
  assignIssue: mockServices.assignIssue,
  updateIssue: mockServices.updateIssue,
  deleteIssue: mockServices.deleteIssue,
}));
vi.mock('../src/modules/comments/comments.service.js', () => ({
  createComment: mockServices.createComment,
}));
vi.mock('../src/modules/sprints/sprints.service.js', () => ({
  moveIssuesToSprint: mockServices.moveIssuesToSprint,
}));
vi.mock('../src/modules/issue-custom-fields/issue-custom-fields.service.js', () => ({
  upsertIssueCustomFields: mockServices.upsertIssueCustomFields,
  getApplicableFields: mockServices.getApplicableFields,
}));
vi.mock('../src/shared/middleware/rbac.js', () => ({
  getEffectiveProjectPermissions: mockServices.getEffectiveProjectPermissions,
}));

const { assignExecutor } = await import('../src/modules/bulk-operations/executors/assign.executor.js');
const { editFieldExecutor } = await import('../src/modules/bulk-operations/executors/edit-field.executor.js');
const { editCustomFieldExecutor } = await import('../src/modules/bulk-operations/executors/edit-custom-field.executor.js');
const { moveToSprintExecutor } = await import('../src/modules/bulk-operations/executors/move-to-sprint.executor.js');
const { addCommentExecutor } = await import('../src/modules/bulk-operations/executors/add-comment.executor.js');
const { deleteExecutor } = await import('../src/modules/bulk-operations/executors/delete.executor.js');

const baseIssue = {
  id: 'i1',
  number: 1,
  title: 'Test',
  description: 'Initial desc',
  projectId: 'p1',
  priority: 'MEDIUM',
  dueDate: null,
  assigneeId: null,
  sprintId: null,
  workflowStatusId: 'status-1',
  project: { id: 'p1', key: 'TT' },
};
const memberActor = { userId: 'u1', systemRoles: ['BULK_OPERATOR'] };
const superAdmin = { userId: 'u-admin', systemRoles: ['SUPER_ADMIN'] };

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.auditLog.create.mockResolvedValue({});
});

// ────── AssignExecutor ───────────────────────────────────────────────────────

describe('assignExecutor', () => {
  it('NO_ACCESS если нет project membership', async () => {
    mockPrisma.userProjectRole.findFirst.mockResolvedValue(null);
    const r = await assignExecutor.preflight(baseIssue as never, { type: 'ASSIGN', assigneeId: 'u2' }, memberActor);
    expect(r).toMatchObject({ kind: 'SKIPPED', reasonCode: 'NO_ACCESS' });
  });

  it('SUPER_ADMIN bypass', async () => {
    const r = await assignExecutor.preflight(baseIssue as never, { type: 'ASSIGN', assigneeId: 'u2' }, superAdmin);
    expect(r.kind).toBe('ELIGIBLE');
    expect(mockPrisma.userProjectRole.findFirst).not.toHaveBeenCalled();
  });

  it('ALREADY_IN_TARGET_STATE (assigneeId уже равен)', async () => {
    mockPrisma.userProjectRole.findFirst.mockResolvedValue({ userId: 'u1' });
    const r = await assignExecutor.preflight({ ...baseIssue, assigneeId: 'u2' } as never, { type: 'ASSIGN', assigneeId: 'u2' }, memberActor);
    expect(r).toMatchObject({ kind: 'SKIPPED', reasonCode: 'ALREADY_IN_TARGET_STATE' });
  });

  it('execute вызывает assignIssue + audit', async () => {
    await assignExecutor.execute(baseIssue as never, { type: 'ASSIGN', assigneeId: 'u2' }, memberActor);
    expect(mockServices.assignIssue).toHaveBeenCalledWith('i1', { assigneeId: 'u2' });
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'issue.assigned' }) }),
    );
  });
});

// ────── EditFieldExecutor ───────────────────────────────────────────────────

describe('editFieldExecutor', () => {
  beforeEach(() => mockPrisma.userProjectRole.findFirst.mockResolvedValue({ userId: 'u1' }));

  it('priority невалидное значение → TYPE_MISMATCH', async () => {
    const r = await editFieldExecutor.preflight(baseIssue as never, { type: 'EDIT_FIELD', field: 'priority', value: 'SUPER_HIGH' }, memberActor);
    expect(r).toMatchObject({ kind: 'SKIPPED', reasonCode: 'TYPE_MISMATCH' });
  });

  it('priority совпадает с текущим → ALREADY_IN_TARGET_STATE', async () => {
    const r = await editFieldExecutor.preflight(baseIssue as never, { type: 'EDIT_FIELD', field: 'priority', value: 'MEDIUM' }, memberActor);
    expect(r).toMatchObject({ kind: 'SKIPPED', reasonCode: 'ALREADY_IN_TARGET_STATE' });
  });

  it('priority валидное → ELIGIBLE', async () => {
    const r = await editFieldExecutor.preflight(baseIssue as never, { type: 'EDIT_FIELD', field: 'priority', value: 'HIGH' }, memberActor);
    expect(r.kind).toBe('ELIGIBLE');
  });

  it('labels.add → INVALID_FIELD_SCHEMA (not supported)', async () => {
    const r = await editFieldExecutor.preflight(baseIssue as never, { type: 'EDIT_FIELD', field: 'labels.add', value: ['x'] }, memberActor);
    expect(r).toMatchObject({ kind: 'SKIPPED', reasonCode: 'INVALID_FIELD_SCHEMA' });
  });

  it('description.append пустая строка → TYPE_MISMATCH', async () => {
    const r = await editFieldExecutor.preflight(baseIssue as never, { type: 'EDIT_FIELD', field: 'description.append', value: '' }, memberActor);
    expect(r).toMatchObject({ kind: 'SKIPPED', reasonCode: 'TYPE_MISMATCH' });
  });

  it('execute description.append делает re-read fresh description перед append (race-guard)', async () => {
    // fresh description изменился между preflight и execute — concurrent editor
    // добавил строку. Append должен работать поверх fresh, не preflight-snapshot.
    mockPrisma.issue.findUniqueOrThrow.mockResolvedValue({ description: 'Updated by other user' });
    await editFieldExecutor.execute(baseIssue as never, { type: 'EDIT_FIELD', field: 'description.append', value: 'MORE' }, memberActor);
    expect(mockPrisma.issue.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: 'i1' },
      select: { description: true },
    });
    expect(mockServices.updateIssue).toHaveBeenCalledWith('i1', { description: 'Updated by other user\n\nMORE' });
  });

  it('execute description.append в пустой description — без разделителя', async () => {
    mockPrisma.issue.findUniqueOrThrow.mockResolvedValue({ description: null });
    await editFieldExecutor.execute({ ...baseIssue, description: null } as never, { type: 'EDIT_FIELD', field: 'description.append', value: 'FIRST' }, memberActor);
    expect(mockServices.updateIssue).toHaveBeenCalledWith('i1', { description: 'FIRST' });
  });
});

// ────── EditCustomFieldExecutor ─────────────────────────────────────────────

describe('editCustomFieldExecutor', () => {
  beforeEach(() => mockPrisma.userProjectRole.findFirst.mockResolvedValue({ userId: 'u1' }));

  it('INVALID_FIELD_SCHEMA если CF не применим к issue', async () => {
    mockServices.getApplicableFields.mockResolvedValue([{ customFieldId: 'cf-other' }]);
    const r = await editCustomFieldExecutor.preflight(
      baseIssue as never,
      { type: 'EDIT_CUSTOM_FIELD', customFieldId: 'cf-missing', value: 'x' },
      memberActor,
    );
    expect(r).toMatchObject({ kind: 'SKIPPED', reasonCode: 'INVALID_FIELD_SCHEMA' });
  });

  it('ELIGIBLE если CF применим', async () => {
    mockServices.getApplicableFields.mockResolvedValue([{ customFieldId: 'cf-1' }]);
    const r = await editCustomFieldExecutor.preflight(
      baseIssue as never,
      { type: 'EDIT_CUSTOM_FIELD', customFieldId: 'cf-1', value: 'v' },
      memberActor,
    );
    expect(r.kind).toBe('ELIGIBLE');
  });

  it('TYPE_MISMATCH если value — object (не scalar)', async () => {
    mockServices.getApplicableFields.mockResolvedValue([{ customFieldId: 'cf-1' }]);
    const r = await editCustomFieldExecutor.preflight(
      baseIssue as never,
      { type: 'EDIT_CUSTOM_FIELD', customFieldId: 'cf-1', value: { nested: 'obj' } },
      memberActor,
    );
    expect(r).toMatchObject({ kind: 'SKIPPED', reasonCode: 'TYPE_MISMATCH' });
  });

  it('TYPE_MISMATCH если value — mixed array', async () => {
    mockServices.getApplicableFields.mockResolvedValue([{ customFieldId: 'cf-1' }]);
    const r = await editCustomFieldExecutor.preflight(
      baseIssue as never,
      { type: 'EDIT_CUSTOM_FIELD', customFieldId: 'cf-1', value: ['s', 42] },
      memberActor,
    );
    expect(r).toMatchObject({ kind: 'SKIPPED', reasonCode: 'TYPE_MISMATCH' });
  });

  it('ELIGIBLE при string[] value', async () => {
    mockServices.getApplicableFields.mockResolvedValue([{ customFieldId: 'cf-1' }]);
    const r = await editCustomFieldExecutor.preflight(
      baseIssue as never,
      { type: 'EDIT_CUSTOM_FIELD', customFieldId: 'cf-1', value: ['a', 'b'] },
      memberActor,
    );
    expect(r.kind).toBe('ELIGIBLE');
  });

  it('execute вызывает upsert + audit', async () => {
    await editCustomFieldExecutor.execute(
      baseIssue as never,
      { type: 'EDIT_CUSTOM_FIELD', customFieldId: 'cf-1', value: 'v' },
      memberActor,
    );
    expect(mockServices.upsertIssueCustomFields).toHaveBeenCalledWith(
      'i1',
      { values: [{ customFieldId: 'cf-1', value: 'v' }] },
      'u1',
    );
  });
});

// ────── MoveToSprintExecutor ────────────────────────────────────────────────

describe('moveToSprintExecutor', () => {
  beforeEach(() => mockPrisma.userProjectRole.findFirst.mockResolvedValue({ userId: 'u1' }));

  it('ALREADY_IN_TARGET_STATE когда sprintId совпадает', async () => {
    const r = await moveToSprintExecutor.preflight(
      { ...baseIssue, sprintId: 's1' } as never,
      { type: 'MOVE_TO_SPRINT', sprintId: 's1' },
      memberActor,
    );
    expect(r).toMatchObject({ kind: 'SKIPPED', reasonCode: 'ALREADY_IN_TARGET_STATE' });
  });

  it('SPRINT_PROJECT_MISMATCH если спринт из другого проекта', async () => {
    mockPrisma.sprint.findUnique.mockResolvedValue({ id: 's2', projectId: 'p-OTHER' });
    const r = await moveToSprintExecutor.preflight(baseIssue as never, { type: 'MOVE_TO_SPRINT', sprintId: 's2' }, memberActor);
    expect(r).toMatchObject({ kind: 'SKIPPED', reasonCode: 'SPRINT_PROJECT_MISMATCH' });
  });

  it('INVALID_FIELD_SCHEMA если спринт не найден', async () => {
    mockPrisma.sprint.findUnique.mockResolvedValue(null);
    const r = await moveToSprintExecutor.preflight(baseIssue as never, { type: 'MOVE_TO_SPRINT', sprintId: 's-missing' }, memberActor);
    expect(r).toMatchObject({ kind: 'SKIPPED', reasonCode: 'INVALID_FIELD_SCHEMA' });
  });

  it('ELIGIBLE когда спринт в том же проекте', async () => {
    mockPrisma.sprint.findUnique.mockResolvedValue({ id: 's2', projectId: 'p1' });
    const r = await moveToSprintExecutor.preflight(baseIssue as never, { type: 'MOVE_TO_SPRINT', sprintId: 's2' }, memberActor);
    expect(r.kind).toBe('ELIGIBLE');
  });

  it('null sprintId (remove from sprint) → ELIGIBLE без sprint-lookup', async () => {
    const r = await moveToSprintExecutor.preflight(
      { ...baseIssue, sprintId: 's1' } as never,
      { type: 'MOVE_TO_SPRINT', sprintId: null },
      memberActor,
    );
    expect(r.kind).toBe('ELIGIBLE');
    expect(mockPrisma.sprint.findUnique).not.toHaveBeenCalled();
  });

  it('execute вызывает moveIssuesToSprint с expectedProjectId', async () => {
    await moveToSprintExecutor.execute(baseIssue as never, { type: 'MOVE_TO_SPRINT', sprintId: 's2' }, memberActor);
    expect(mockServices.moveIssuesToSprint).toHaveBeenCalledWith('s2', ['i1'], 'p1');
  });
});

// ────── AddCommentExecutor ──────────────────────────────────────────────────

describe('addCommentExecutor', () => {
  beforeEach(() => mockPrisma.userProjectRole.findFirst.mockResolvedValue({ userId: 'u1' }));

  it('NO_ACCESS без membership', async () => {
    mockPrisma.userProjectRole.findFirst.mockResolvedValueOnce(null);
    const r = await addCommentExecutor.preflight(baseIssue as never, { type: 'ADD_COMMENT', body: 'x' }, memberActor);
    expect(r).toMatchObject({ kind: 'SKIPPED', reasonCode: 'NO_ACCESS' });
  });

  it('ELIGIBLE', async () => {
    const r = await addCommentExecutor.preflight(baseIssue as never, { type: 'ADD_COMMENT', body: 'x' }, memberActor);
    expect(r.kind).toBe('ELIGIBLE');
  });

  it('execute вызывает createComment + audit', async () => {
    mockServices.createComment.mockResolvedValue({ id: 'c1' });
    await addCommentExecutor.execute(baseIssue as never, { type: 'ADD_COMMENT', body: 'hello' }, memberActor);
    expect(mockServices.createComment).toHaveBeenCalledWith('i1', 'u1', { body: 'hello' });
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'issue.comment_added' }) }),
    );
  });
});

// ────── DeleteExecutor ──────────────────────────────────────────────────────

describe('deleteExecutor', () => {
  it('SUPER_ADMIN bypass — не запрашивает permissions', async () => {
    const r = await deleteExecutor.preflight(baseIssue as never, { type: 'DELETE', confirmPhrase: 'DELETE' }, superAdmin);
    expect(r.kind).toBe('ELIGIBLE');
    expect(mockServices.getEffectiveProjectPermissions).not.toHaveBeenCalled();
  });

  it('ADMIN НЕ bypass (должен получить ISSUES_DELETE явно, §7.1)', async () => {
    mockServices.getEffectiveProjectPermissions.mockResolvedValue([]); // нет ISSUES_DELETE
    const r = await deleteExecutor.preflight(
      baseIssue as never,
      { type: 'DELETE', confirmPhrase: 'DELETE' },
      { userId: 'u-admin', systemRoles: ['ADMIN'] },
    );
    expect(r).toMatchObject({ kind: 'SKIPPED', reasonCode: 'NO_ACCESS' });
    // Важно: permissions-проверка всё-таки вызывалась (не bypass).
    expect(mockServices.getEffectiveProjectPermissions).toHaveBeenCalled();
  });

  it('NO_ACCESS если permissions не содержат ISSUES_DELETE', async () => {
    mockServices.getEffectiveProjectPermissions.mockResolvedValue(['ISSUES_VIEW']);
    const r = await deleteExecutor.preflight(baseIssue as never, { type: 'DELETE', confirmPhrase: 'DELETE' }, memberActor);
    expect(r).toMatchObject({ kind: 'SKIPPED', reasonCode: 'NO_ACCESS' });
  });

  it('ELIGIBLE при наличии ISSUES_DELETE', async () => {
    mockServices.getEffectiveProjectPermissions.mockResolvedValue(['ISSUES_DELETE']);
    const r = await deleteExecutor.preflight(baseIssue as never, { type: 'DELETE', confirmPhrase: 'DELETE' }, memberActor);
    expect(r.kind).toBe('ELIGIBLE');
  });

  it('execute: delete СНАЧАЛА, потом audit (pre-push PR-5 🟠 #2: избегаем false-positive forensic)', async () => {
    const callOrder: string[] = [];
    mockServices.deleteIssue.mockImplementation(async () => { callOrder.push('delete'); });
    mockPrisma.auditLog.create.mockImplementation(async () => { callOrder.push('audit'); return {}; });
    await deleteExecutor.execute(baseIssue as never, { type: 'DELETE', confirmPhrase: 'DELETE' }, memberActor);
    expect(callOrder).toEqual(['delete', 'audit']);
    expect(mockServices.deleteIssue).toHaveBeenCalledWith('i1');
  });
});
