/**
 * TTBULK-1 PR-6 — unit-тесты retry-failed + streamReportItems.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockPrisma, mockRedis } = vi.hoisted(() => {
  const mockPrisma = {
    bulkOperation: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    bulkOperationItem: { findMany: vi.fn() },
    auditLog: { create: vi.fn() },
  };
  const mockRedis = {
    atomicGetDelJson: vi.fn(),
    setCachedJson: vi.fn(),
    rpushList: vi.fn().mockResolvedValue(1),
    isRedisAvailable: vi.fn().mockResolvedValue(true),
    publishToChannel: vi.fn().mockResolvedValue(true),
  };
  return { mockPrisma, mockRedis };
});

vi.mock('../src/prisma/client.js', () => ({ prisma: mockPrisma }));
vi.mock('../src/shared/redis.js', () => mockRedis);
vi.mock('../src/shared/auth/roles.js', () => ({
  hasGlobalProjectReadAccess: vi.fn().mockReturnValue(false),
  getEffectiveUserSystemRoles: vi.fn(),
  invalidateUserSystemRolesCache: vi.fn(),
  invalidateUserSystemRolesCacheForUsers: vi.fn(),
  computeEffectiveUserSystemRoles: vi.fn(),
  sysRolesCacheKey: (id: string) => `user:sysroles:${id}`,
  isSuperAdmin: vi.fn().mockReturnValue(false),
  hasSystemRole: vi.fn().mockReturnValue(false),
  hasAnySystemRole: vi.fn().mockReturnValue(false),
}));
vi.mock('../src/modules/search/search.service.js', () => ({ searchIssues: vi.fn() }));
// PR-7 добавил getBulkOpsSettings в retry path; mock чтобы не лезть в prisma/redis.
vi.mock('../src/modules/bulk-operations/bulk-operations-settings.service.js', () => ({
  getBulkOpsSettings: vi.fn().mockResolvedValue({ maxConcurrentPerUser: 3, maxItems: 10_000 }),
}));

const { retryFailedItems, streamReportItems } = await import(
  '../src/modules/bulk-operations/bulk-operations.service.js'
);

const actor = { userId: 'u1', systemRoles: ['BULK_OPERATOR'] };
const KEY = '11111111-1111-1111-1111-111111111111';

beforeEach(() => {
  vi.clearAllMocks();
  mockRedis.rpushList.mockResolvedValue(1);
  mockRedis.isRedisAvailable.mockResolvedValue(true);
  mockPrisma.auditLog.create.mockResolvedValue({});
});

describe('retryFailedItems', () => {
  it('404 если source op не существует', async () => {
    mockPrisma.bulkOperation.findUnique.mockResolvedValue(null);
    await expect(retryFailedItems('op-missing', actor, KEY)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('404 если source op принадлежит другому юзеру', async () => {
    mockPrisma.bulkOperation.findUnique.mockResolvedValue({
      id: 'op-1', createdById: 'u-other', status: 'PARTIAL', type: 'TRANSITION',
      scopeKind: 'ids', scopeJql: null, payload: {},
    });
    await expect(retryFailedItems('op-1', actor, KEY)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('409 если source op ещё RUNNING/QUEUED', async () => {
    mockPrisma.bulkOperation.findUnique.mockResolvedValue({
      id: 'op-1', createdById: 'u1', status: 'RUNNING', type: 'TRANSITION',
      scopeKind: 'ids', scopeJql: null, payload: {},
    });
    await expect(retryFailedItems('op-1', actor, KEY)).rejects.toMatchObject({ statusCode: 409 });
  });

  it('410 если failed/skipped items уже зачищены по retention', async () => {
    mockPrisma.bulkOperation.findUnique.mockResolvedValue({
      id: 'op-1', createdById: 'u1', status: 'PARTIAL', type: 'TRANSITION',
      scopeKind: 'ids', scopeJql: null, payload: {},
    });
    mockPrisma.bulkOperationItem.findMany.mockResolvedValue([]);
    await expect(retryFailedItems('op-1', actor, KEY)).rejects.toMatchObject({ statusCode: 410 });
  });

  it('query для retry items исключает CANCELLED_BY_USER errorCode', async () => {
    mockPrisma.bulkOperation.findUnique.mockResolvedValue({
      id: 'op-1', createdById: 'u1', status: 'CANCELLED', type: 'TRANSITION',
      scopeKind: 'ids', scopeJql: null, payload: {},
    });
    mockPrisma.bulkOperationItem.findMany.mockResolvedValue([]);
    await expect(retryFailedItems('op-1', actor, KEY)).rejects.toMatchObject({ statusCode: 410 });
    expect(mockPrisma.bulkOperationItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          errorCode: { not: 'CANCELLED_BY_USER' },
          outcome: { in: ['FAILED', 'SKIPPED'] },
        }),
      }),
    );
  });

  it('happy: создаёт новую op с scope=ids, RPUSH pending, audit', async () => {
    mockPrisma.bulkOperation.findUnique
      .mockResolvedValueOnce({
        id: 'op-1', createdById: 'u1', status: 'PARTIAL', type: 'TRANSITION',
        scopeKind: 'ids', scopeJql: null, payload: { type: 'TRANSITION', transitionId: 't1' },
      })
      .mockResolvedValueOnce(null); // no existing retry
    mockPrisma.bulkOperationItem.findMany.mockResolvedValue([
      { issueId: 'i1' }, { issueId: 'i2' },
    ]);
    mockPrisma.bulkOperation.count.mockResolvedValue(0);
    mockPrisma.bulkOperation.create.mockResolvedValue({ id: 'op-retry', status: 'QUEUED' });

    const res = await retryFailedItems('op-1', actor, KEY);
    expect(res).toEqual({ id: 'op-retry', status: 'QUEUED', alreadyExisted: false });
    expect(mockPrisma.bulkOperation.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        scopeKind: 'ids', scopeJql: null, total: 2, idempotencyKey: KEY, type: 'TRANSITION',
      }),
    }));
    expect(mockRedis.rpushList).toHaveBeenCalledWith('bulk-op:op-retry:pending', ['i1', 'i2']);
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'bulk_operation.retry_failed' }),
    }));
  });

  it('idempotency: повторный ключ возвращает existing', async () => {
    mockPrisma.bulkOperation.findUnique
      .mockResolvedValueOnce({
        id: 'op-1', createdById: 'u1', status: 'PARTIAL', type: 'TRANSITION',
        scopeKind: 'ids', scopeJql: null, payload: {},
      })
      .mockResolvedValueOnce({ id: 'op-retry-existing', status: 'RUNNING' });
    mockPrisma.bulkOperationItem.findMany.mockResolvedValue([{ issueId: 'i1' }]);

    const res = await retryFailedItems('op-1', actor, KEY);
    expect(res).toEqual({ id: 'op-retry-existing', status: 'RUNNING', alreadyExisted: true });
    expect(mockPrisma.bulkOperation.create).not.toHaveBeenCalled();
  });

  it('429 при concurrency-quota', async () => {
    mockPrisma.bulkOperation.findUnique
      .mockResolvedValueOnce({
        id: 'op-1', createdById: 'u1', status: 'PARTIAL', type: 'TRANSITION',
        scopeKind: 'ids', scopeJql: null, payload: {},
      })
      .mockResolvedValueOnce(null);
    mockPrisma.bulkOperationItem.findMany.mockResolvedValue([{ issueId: 'i1' }]);
    mockPrisma.bulkOperation.count.mockResolvedValue(3);
    await expect(retryFailedItems('op-1', actor, KEY)).rejects.toMatchObject({ statusCode: 429 });
  });

  it('503 + rollback DELETE при Redis RPUSH failure', async () => {
    mockPrisma.bulkOperation.findUnique
      .mockResolvedValueOnce({
        id: 'op-1', createdById: 'u1', status: 'PARTIAL', type: 'TRANSITION',
        scopeKind: 'ids', scopeJql: null, payload: {},
      })
      .mockResolvedValueOnce(null);
    mockPrisma.bulkOperationItem.findMany.mockResolvedValue([{ issueId: 'i1' }]);
    mockPrisma.bulkOperation.count.mockResolvedValue(0);
    mockPrisma.bulkOperation.create.mockResolvedValue({ id: 'op-retry', status: 'QUEUED' });
    mockRedis.rpushList.mockResolvedValue(null); // Redis died

    await expect(retryFailedItems('op-1', actor, KEY)).rejects.toMatchObject({ statusCode: 503 });
    expect(mockPrisma.bulkOperation.delete).toHaveBeenCalledWith({ where: { id: 'op-retry' } });
  });
});

describe('streamReportItems', () => {
  it('итерирует items пачками по 1000 с cursor-пагинацией', async () => {
    const page1 = Array.from({ length: 1000 }, (_, i) => ({
      id: `i-${i}`, issueKey: `TT-${i}`, outcome: 'FAILED',
      errorCode: 'X', errorMessage: 'err', processedAt: new Date(),
    }));
    const page2 = Array.from({ length: 42 }, (_, i) => ({
      id: `j-${i}`, issueKey: `TT-${1000 + i}`, outcome: 'SKIPPED',
      errorCode: 'Y', errorMessage: 'skip', processedAt: new Date(),
    }));
    mockPrisma.bulkOperationItem.findMany
      .mockResolvedValueOnce(page1)
      .mockResolvedValueOnce(page2);

    const rows: Array<{ issueKey: string; outcome: string }> = [];
    for await (const r of streamReportItems('op-1')) rows.push(r);
    expect(rows.length).toBe(1042);
    expect(rows[0].issueKey).toBe('TT-0');
    expect(rows[1041].issueKey).toBe('TT-1041');
    // Cursor задан после первой страницы.
    expect(mockPrisma.bulkOperationItem.findMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
      cursor: { id: 'i-999' }, skip: 1,
    }));
  });

  it('пустой dataset → 0 iterations', async () => {
    mockPrisma.bulkOperationItem.findMany.mockResolvedValueOnce([]);
    const rows: unknown[] = [];
    for await (const r of streamReportItems('op-empty')) rows.push(r);
    expect(rows).toEqual([]);
  });
});
