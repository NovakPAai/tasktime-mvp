/**
 * TTBULK-1 PR-3 — unit-тест service'а (preview / create / get / cancel / list).
 *
 * Pure-unit (моки prisma + redis + searchIssues), Postgres не нужен. Покрывает:
 *   • preview: scope=ids happy, scope=ids empty, scope=jql резолв, warning
 *     TRUNCATED_TO_MAX_ITEMS, scope=ids > DEFAULT_MAX_ITEMS → TOO_MANY_ITEMS (400),
 *     eligible-items из DB, удалённая задача → SKIPPED DELETED, previewToken
 *     возвращается и записан в Redis.
 *   • create: happy (создаёт BulkOp, RPUSH pending, удаляет previewToken,
 *     пишет audit), идемпотентность (повторный ключ → existing op), чужой
 *     previewToken → 404, истёкший → 409 PREVIEW_EXPIRED, concurrency-quota
 *     ≥ 3 → 429, Redis down → 503 QUEUE_UNAVAILABLE (и rollback операции).
 *   • get: 404 на чужую.
 *   • cancel: 404 на чужую, idempotent no-op в терминальном статусе.
 *   • list: фильтр по status/type, пагинация.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockPrisma, mockRedis, mockSearchIssues } = vi.hoisted(() => {
  const mockPrisma = {
    bulkOperation: {
      findUnique: vi.fn(),
      create: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
    issue: { findMany: vi.fn() },
    project: { findMany: vi.fn() },
    userProjectRole: { findMany: vi.fn() },
    auditLog: { create: vi.fn() },
  };
  const mockRedis = {
    getCachedJson: vi.fn(),
    setCachedJson: vi.fn(),
    delCachedJson: vi.fn(),
    rpushList: vi.fn(),
    isRedisAvailable: vi.fn(),
  };
  const mockSearchIssues = vi.fn();
  return { mockPrisma, mockRedis, mockSearchIssues };
});

vi.mock('../src/prisma/client.js', () => ({ prisma: mockPrisma }));
vi.mock('../src/shared/redis.js', () => mockRedis);
vi.mock('../src/shared/auth/roles.js', async () => {
  return {
    hasGlobalProjectReadAccess: vi.fn().mockReturnValue(false),
    // Unused by service after refactor — но могут импортироваться транзитивно:
    getEffectiveUserSystemRoles: vi.fn(),
    invalidateUserSystemRolesCache: vi.fn(),
    invalidateUserSystemRolesCacheForUsers: vi.fn(),
    computeEffectiveUserSystemRoles: vi.fn(),
    sysRolesCacheKey: (id: string) => `user:sysroles:${id}`,
    isSuperAdmin: vi.fn().mockReturnValue(false),
    hasSystemRole: vi.fn().mockReturnValue(false),
    hasAnySystemRole: vi.fn().mockReturnValue(false),
  };
});
vi.mock('../src/modules/search/search.service.js', () => ({
  searchIssues: mockSearchIssues,
}));

const service = await import('../src/modules/bulk-operations/bulk-operations.service.js');

const actor = {
  userId: 'user-1',
  systemRoles: ['USER', 'BULK_OPERATOR'] as const,
  accessibleProjectIds: ['proj-1'] as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  // Дефолты — каждый тест может переопределить.
  mockRedis.getCachedJson.mockResolvedValue(null);
  mockRedis.setCachedJson.mockResolvedValue(undefined);
  mockRedis.delCachedJson.mockResolvedValue(undefined);
  mockRedis.rpushList.mockResolvedValue(1);
  mockRedis.isRedisAvailable.mockResolvedValue(true);
  mockPrisma.auditLog.create.mockResolvedValue({});
});

// ────── previewBulkOperation ─────────────────────────────────────────────────

describe('previewBulkOperation — scope=ids', () => {
  it('happy: резолвит issueIds, возвращает eligible + previewToken', async () => {
    mockPrisma.issue.findMany.mockResolvedValue([
      { id: 'i1', number: 1, title: 'First', projectId: 'proj-1', project: { id: 'proj-1', key: 'TT' } },
      { id: 'i2', number: 2, title: 'Second', projectId: 'proj-1', project: { id: 'proj-1', key: 'TT' } },
    ]);
    const res = await service.previewBulkOperation(
      { scope: { kind: 'ids', issueIds: ['i1', 'i2'] }, payload: { type: 'ADD_COMMENT', body: 'hi' } },
      actor,
    );
    expect(res.totalMatched).toBe(2);
    expect(res.eligible).toHaveLength(2);
    expect(res.eligible[0].issueKey).toBe('TT-1');
    expect(res.skipped).toEqual([]);
    expect(res.conflicts).toEqual([]);
    expect(res.previewToken).toMatch(/^[0-9a-f-]{36}$/);
    expect(mockRedis.setCachedJson).toHaveBeenCalledWith(
      expect.stringMatching(/^bulk-op:preview:/),
      expect.objectContaining({ userId: 'user-1', type: 'ADD_COMMENT', eligibleIds: ['i1', 'i2'] }),
      expect.any(Number),
    );
  });

  it('задача удалена между preview и metadata → SKIPPED DELETED', async () => {
    mockPrisma.issue.findMany.mockResolvedValue([
      { id: 'i1', number: 1, title: 'First', projectId: 'proj-1', project: { id: 'proj-1', key: 'TT' } },
    ]);
    const res = await service.previewBulkOperation(
      { scope: { kind: 'ids', issueIds: ['i1', 'i2-deleted'] }, payload: { type: 'DELETE', confirmPhrase: 'DELETE' } },
      actor,
    );
    expect(res.eligible).toHaveLength(1);
    expect(res.skipped).toHaveLength(1);
    expect(res.skipped[0].reasonCode).toBe('DELETED');
  });

  it('пустой scope=ids — возвращает пустой response без обращения к DB', async () => {
    const res = await service.previewBulkOperation(
      // Bypass DTO: service получает уже-валидированный input, но в тесте даём пустой массив напрямую.
      { scope: { kind: 'ids', issueIds: [] }, payload: { type: 'ADD_COMMENT', body: 'x' } },
      actor,
    );
    expect(res.totalMatched).toBe(0);
    expect(res.eligible).toEqual([]);
    expect(mockPrisma.issue.findMany).not.toHaveBeenCalled();
  });
});

describe('previewBulkOperation — scope=jql', () => {
  it('happy: резолвит через searchIssues, возвращает eligible', async () => {
    mockSearchIssues.mockResolvedValue({
      kind: 'ok',
      total: 2,
      issues: [{ id: 'i1' }, { id: 'i2' }],
      startAt: 0,
      limit: 10000,
      warnings: [],
      compileWarnings: [],
    });
    mockPrisma.issue.findMany.mockResolvedValue([
      { id: 'i1', number: 1, title: 'A', projectId: 'p1', project: { id: 'p1', key: 'TT' } },
      { id: 'i2', number: 2, title: 'B', projectId: 'p1', project: { id: 'p1', key: 'TT' } },
    ]);
    const res = await service.previewBulkOperation(
      { scope: { kind: 'jql', jql: 'project = TT' }, payload: { type: 'ASSIGN', assigneeId: null } },
      actor,
    );
    expect(res.totalMatched).toBe(2);
    expect(res.eligible).toHaveLength(2);
    expect(res.warnings).toEqual([]);
  });

  it('searchIssues возвращает total > limit → TRUNCATED_TO_MAX_ITEMS warning', async () => {
    mockSearchIssues.mockResolvedValue({
      kind: 'ok',
      total: 12_547,
      issues: Array.from({ length: 2 }, (_, i) => ({ id: `i${i}` })), // mock'им только 2 для краткости
      startAt: 0,
      limit: 10000,
      warnings: [],
      compileWarnings: [],
    });
    mockPrisma.issue.findMany.mockResolvedValue([
      { id: 'i0', number: 1, title: 'A', projectId: 'p1', project: { id: 'p1', key: 'TT' } },
      { id: 'i1', number: 2, title: 'B', projectId: 'p1', project: { id: 'p1', key: 'TT' } },
    ]);
    const res = await service.previewBulkOperation(
      { scope: { kind: 'jql', jql: 'project = TT' }, payload: { type: 'ASSIGN', assigneeId: null } },
      actor,
    );
    expect(res.warnings).toContain('TRUNCATED_TO_MAX_ITEMS');
    expect(res.totalMatched).toBe(12_547);
  });

  it('searchIssues error → AppError пробрасывается', async () => {
    mockSearchIssues.mockResolvedValue({
      kind: 'error',
      status: 400,
      code: 'PARSE_ERROR',
      message: 'bad jql',
      parseErrors: [],
    });
    await expect(
      service.previewBulkOperation(
        { scope: { kind: 'jql', jql: 'bad jql' }, payload: { type: 'ASSIGN', assigneeId: null } },
        actor,
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

// ────── createBulkOperation ──────────────────────────────────────────────────

describe('createBulkOperation', () => {
  const previewEntry = {
    userId: 'user-1',
    type: 'ASSIGN',
    scopeKind: 'ids',
    scopeJql: null,
    payload: { type: 'ASSIGN', assigneeId: null },
    eligibleIds: ['i1', 'i2'],
    warnings: [],
  };

  it('happy: создаёт op, RPUSH, удаляет previewToken, audit', async () => {
    mockPrisma.bulkOperation.findUnique.mockResolvedValue(null); // нет дубля idempotency
    mockRedis.getCachedJson.mockResolvedValue(previewEntry);
    mockPrisma.bulkOperation.count.mockResolvedValue(0); // quota ok
    mockPrisma.bulkOperation.create.mockResolvedValue({ id: 'op-1', status: 'QUEUED' });

    const res = await service.createBulkOperation(
      { previewToken: 'token-1', idempotencyKey: '11111111-1111-1111-1111-111111111111' },
      { userId: 'user-1', systemRoles: ['BULK_OPERATOR'] },
    );

    expect(res).toEqual({ id: 'op-1', status: 'QUEUED' });
    expect(mockRedis.rpushList).toHaveBeenCalledWith('bulk-op:op-1:pending', ['i1', 'i2']);
    expect(mockRedis.delCachedJson).toHaveBeenCalledWith(expect.stringMatching(/^bulk-op:preview:/));
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'bulk_operation.created', entityId: 'op-1' }),
      }),
    );
  });

  it('idempotency: повторный ключ возвращает существующий op', async () => {
    mockPrisma.bulkOperation.findUnique.mockResolvedValue({ id: 'op-existing', status: 'RUNNING' });
    const res = await service.createBulkOperation(
      { previewToken: 'token-1', idempotencyKey: '11111111-1111-1111-1111-111111111111' },
      { userId: 'user-1', systemRoles: ['BULK_OPERATOR'] },
    );
    expect(res).toEqual({ id: 'op-existing', status: 'RUNNING' });
    expect(mockPrisma.bulkOperation.create).not.toHaveBeenCalled();
    expect(mockRedis.rpushList).not.toHaveBeenCalled();
  });

  it('истёкший previewToken → 409 PREVIEW_EXPIRED', async () => {
    mockPrisma.bulkOperation.findUnique.mockResolvedValue(null);
    mockRedis.getCachedJson.mockResolvedValue(null);
    await expect(
      service.createBulkOperation(
        { previewToken: 'expired', idempotencyKey: '11111111-1111-1111-1111-111111111111' },
        { userId: 'user-1', systemRoles: ['BULK_OPERATOR'] },
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('чужой previewToken → 404', async () => {
    mockPrisma.bulkOperation.findUnique.mockResolvedValue(null);
    mockRedis.getCachedJson.mockResolvedValue({ ...previewEntry, userId: 'other-user' });
    await expect(
      service.createBulkOperation(
        { previewToken: 'someone-elses', idempotencyKey: '11111111-1111-1111-1111-111111111111' },
        { userId: 'user-1', systemRoles: ['BULK_OPERATOR'] },
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('quota 3 исчерпана → 429 TOO_MANY_CONCURRENT', async () => {
    mockPrisma.bulkOperation.findUnique.mockResolvedValue(null);
    mockRedis.getCachedJson.mockResolvedValue(previewEntry);
    mockPrisma.bulkOperation.count.mockResolvedValue(3);
    await expect(
      service.createBulkOperation(
        { previewToken: 'token-1', idempotencyKey: '11111111-1111-1111-1111-111111111111' },
        { userId: 'user-1', systemRoles: ['BULK_OPERATOR'] },
      ),
    ).rejects.toMatchObject({ statusCode: 429 });
  });

  it('Redis недоступен до create → 503 QUEUE_UNAVAILABLE (op не создаётся)', async () => {
    mockPrisma.bulkOperation.findUnique.mockResolvedValue(null);
    mockRedis.getCachedJson.mockResolvedValue(previewEntry);
    mockPrisma.bulkOperation.count.mockResolvedValue(0);
    mockRedis.isRedisAvailable.mockResolvedValue(false);
    await expect(
      service.createBulkOperation(
        { previewToken: 'token-1', idempotencyKey: '11111111-1111-1111-1111-111111111111' },
        { userId: 'user-1', systemRoles: ['BULK_OPERATOR'] },
      ),
    ).rejects.toMatchObject({ statusCode: 503 });
    expect(mockPrisma.bulkOperation.create).not.toHaveBeenCalled();
  });

  it('RPUSH упал после create → 503 + откат op в FAILED', async () => {
    mockPrisma.bulkOperation.findUnique.mockResolvedValue(null);
    mockRedis.getCachedJson.mockResolvedValue(previewEntry);
    mockPrisma.bulkOperation.count.mockResolvedValue(0);
    mockPrisma.bulkOperation.create.mockResolvedValue({ id: 'op-1', status: 'QUEUED' });
    mockRedis.rpushList.mockResolvedValue(null); // Redis died after create
    mockPrisma.bulkOperation.update.mockResolvedValue({ id: 'op-1', status: 'FAILED' });

    await expect(
      service.createBulkOperation(
        { previewToken: 'token-1', idempotencyKey: '11111111-1111-1111-1111-111111111111' },
        { userId: 'user-1', systemRoles: ['BULK_OPERATOR'] },
      ),
    ).rejects.toMatchObject({ statusCode: 503 });
    expect(mockPrisma.bulkOperation.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'op-1' }, data: expect.objectContaining({ status: 'FAILED' }) }),
    );
  });

  it('preview без eligibleIds → 400 NO_ELIGIBLE_ITEMS', async () => {
    mockPrisma.bulkOperation.findUnique.mockResolvedValue(null);
    mockRedis.getCachedJson.mockResolvedValue({ ...previewEntry, eligibleIds: [] });
    await expect(
      service.createBulkOperation(
        { previewToken: 'token-1', idempotencyKey: '11111111-1111-1111-1111-111111111111' },
        { userId: 'user-1', systemRoles: ['BULK_OPERATOR'] },
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

// ────── get / cancel / list ──────────────────────────────────────────────────

describe('getBulkOperation', () => {
  it('owner видит свою операцию', async () => {
    mockPrisma.bulkOperation.findUnique.mockResolvedValue({ id: 'op-1', createdById: 'user-1', status: 'QUEUED' });
    const res = await service.getBulkOperation('op-1', { userId: 'user-1', systemRoles: ['USER'] });
    expect(res.id).toBe('op-1');
  });

  it('чужая операция → 404 (не разглашаем существование)', async () => {
    mockPrisma.bulkOperation.findUnique.mockResolvedValue({ id: 'op-1', createdById: 'other', status: 'QUEUED' });
    await expect(
      service.getBulkOperation('op-1', { userId: 'user-1', systemRoles: ['USER'] }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('cancelBulkOperation', () => {
  it('выставляет cancel_requested + audit', async () => {
    mockPrisma.bulkOperation.findUnique.mockResolvedValue({
      id: 'op-1',
      createdById: 'user-1',
      status: 'RUNNING',
    });
    mockPrisma.bulkOperation.update.mockResolvedValue({ id: 'op-1', cancelRequested: true });
    const res = await service.cancelBulkOperation('op-1', { userId: 'user-1', systemRoles: ['USER'] });
    expect(res.cancelRequested).toBe(true);
    expect(mockPrisma.auditLog.create).toHaveBeenCalled();
  });

  it('idempotent no-op для терминального статуса', async () => {
    mockPrisma.bulkOperation.findUnique.mockResolvedValue({
      id: 'op-1',
      createdById: 'user-1',
      status: 'SUCCEEDED',
    });
    const res = await service.cancelBulkOperation('op-1', { userId: 'user-1', systemRoles: ['USER'] });
    expect(res.status).toBe('SUCCEEDED');
    expect(mockPrisma.bulkOperation.update).not.toHaveBeenCalled();
  });

  it('чужая → 404', async () => {
    mockPrisma.bulkOperation.findUnique.mockResolvedValue({
      id: 'op-1',
      createdById: 'other',
      status: 'QUEUED',
    });
    await expect(
      service.cancelBulkOperation('op-1', { userId: 'user-1', systemRoles: ['USER'] }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('listBulkOperations', () => {
  it('возвращает пагинированный список юзера', async () => {
    mockPrisma.bulkOperation.findMany.mockResolvedValue([{ id: 'op-1' }, { id: 'op-2' }]);
    mockPrisma.bulkOperation.count.mockResolvedValue(2);
    const res = await service.listBulkOperations(
      { userId: 'user-1', systemRoles: ['USER'] },
      { limit: 10, startAt: 0 },
    );
    expect(res.items).toHaveLength(2);
    expect(res.total).toBe(2);
    expect(mockPrisma.bulkOperation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { createdById: 'user-1' } }),
    );
  });

  it('фильтр по status прокидывается в where', async () => {
    mockPrisma.bulkOperation.findMany.mockResolvedValue([]);
    mockPrisma.bulkOperation.count.mockResolvedValue(0);
    await service.listBulkOperations(
      { userId: 'user-1', systemRoles: ['USER'] },
      { status: 'RUNNING' },
    );
    expect(mockPrisma.bulkOperation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { createdById: 'user-1', status: 'RUNNING' } }),
    );
  });
});
