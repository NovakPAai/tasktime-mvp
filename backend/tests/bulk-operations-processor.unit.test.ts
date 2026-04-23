/**
 * TTBULK-1 PR-4 — unit-тест processor'а.
 *
 * Pure-unit (моки prisma + redis + workflow-engine). Покрывает:
 *   • runTickOnce: lock-skip, idle (нет QUEUED), QUEUED → RUNNING + startedAt,
 *     успешная пачка с увеличением счётчиков, SKIPPED preflight (NO_ACCESS /
 *     NO_TRANSITION / ALREADY_IN_TARGET_STATE), CONFLICT → SKIPPED, FAILED на
 *     exception'е, deleted issue → SKIPPED DELETED, финализация SUCCEEDED /
 *     PARTIAL / FAILED, cancel-путь.
 *   • runRecoveryOnce: stale RUNNING сбрасывает в QUEUED.
 *   • runRetentionOnce: DELETE items > 30d + ops > 90d (терминальные).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockPrisma, mockRedis, mockTransitionExecutor, mockContext } = vi.hoisted(() => {
  const mockPrisma = {
    bulkOperation: {
      findFirst: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    bulkOperationItem: {
      createMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    issue: { findMany: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn((ops: unknown[]) => Promise.all(ops.map((o) => (typeof o === 'object' ? Promise.resolve(o) : o)))),
  };
  const mockRedis = {
    acquireLock: vi.fn(),
    releaseLock: vi.fn(),
    lpopListBatch: vi.fn(),
    publishToChannel: vi.fn().mockResolvedValue(true),
  };
  const mockTransitionExecutor = {
    type: 'TRANSITION',
    preflight: vi.fn(),
    execute: vi.fn(),
  };
  const mockContext = {
    runInBulkOperationContext: vi.fn((_id: string, fn: () => Promise<unknown>) => fn()),
  };
  return { mockPrisma, mockRedis, mockTransitionExecutor, mockContext };
});

vi.mock('../src/prisma/client.js', () => ({ prisma: mockPrisma }));
vi.mock('../src/shared/redis.js', () => ({
  acquireLock: mockRedis.acquireLock,
  releaseLock: mockRedis.releaseLock,
  lpopListBatch: mockRedis.lpopListBatch,
  publishToChannel: mockRedis.publishToChannel,
}));
vi.mock('../src/shared/bulk-operation-context.js', () => mockContext);
vi.mock('../src/shared/auth/roles.js', () => ({
  getEffectiveUserSystemRoles: vi.fn().mockResolvedValue([]),
  hasGlobalProjectReadAccess: vi.fn().mockReturnValue(false),
  hasAnySystemRole: vi.fn().mockReturnValue(false),
  hasSystemRole: vi.fn().mockReturnValue(false),
  isSuperAdmin: vi.fn().mockReturnValue(false),
  computeEffectiveUserSystemRoles: vi.fn(),
  invalidateUserSystemRolesCache: vi.fn(),
  invalidateUserSystemRolesCacheForUsers: vi.fn(),
  sysRolesCacheKey: (id: string) => `user:sysroles:${id}`,
}));
vi.mock('../src/shared/utils/logger.js', () => ({ captureError: vi.fn() }));
vi.mock('../src/modules/bulk-operations/executors/index.js', () => ({
  getExecutor: (type: string) => (type === 'TRANSITION' ? mockTransitionExecutor : null),
}));
// service exports pendingQueueKey — stub без его импорта всей service-зависимости.
vi.mock('../src/modules/bulk-operations/bulk-operations.service.js', () => ({
  pendingQueueKey: (id: string) => `bulk-op:${id}:pending`,
}));

const { runTickOnce, runRecoveryOnce, runRetentionOnce } = await import(
  '../src/modules/bulk-operations/bulk-operations.processor.js'
);

const baseOp = {
  id: 'op-1',
  createdById: 'user-1',
  type: 'TRANSITION',
  status: 'QUEUED',
  scopeKind: 'ids',
  scopeJql: null,
  payload: { type: 'TRANSITION', transitionId: 't-1' },
  idempotencyKey: 'k',
  total: 3,
  processed: 0,
  succeeded: 0,
  failed: 0,
  skipped: 0,
  cancelRequested: false,
  heartbeatAt: null,
  startedAt: null,
  finishedAt: null,
  createdAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRedis.acquireLock.mockResolvedValue('lock-token');
  mockRedis.releaseLock.mockResolvedValue(undefined);
  mockPrisma.bulkOperation.update.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
    ...baseOp,
    ...data,
  }));
  mockPrisma.auditLog.create.mockResolvedValue({});
  mockPrisma.bulkOperationItem.createMany.mockResolvedValue({ count: 0 });
  mockPrisma.$transaction.mockImplementation((ops: unknown[]) =>
    Promise.all(ops.map((o) => (typeof o === 'object' ? Promise.resolve(o) : o))),
  );
});

// ────── lock / idle ─────────────────────────────────────────────────────────

describe('runTickOnce — lock/idle', () => {
  it('не взял лок → skipped-lock', async () => {
    mockRedis.acquireLock.mockResolvedValue(null);
    const res = await runTickOnce();
    expect(res).toEqual({ kind: 'skipped-lock' });
    expect(mockPrisma.bulkOperation.findFirst).not.toHaveBeenCalled();
  });

  it('нет QUEUED/RUNNING → idle + release', async () => {
    mockPrisma.bulkOperation.findFirst.mockResolvedValue(null);
    const res = await runTickOnce();
    expect(res).toEqual({ kind: 'idle' });
    expect(mockRedis.releaseLock).toHaveBeenCalled();
  });
});

// ────── happy-path: batch с 2-succeeded + 1-skipped ──────────────────────────

describe('runTickOnce — batch processing', () => {
  it('QUEUED → RUNNING; 2 eligible + 1 skipped → counters + heartbeat', async () => {
    mockPrisma.bulkOperation.findFirst.mockResolvedValue({ ...baseOp, status: 'QUEUED' });
    mockRedis.lpopListBatch.mockResolvedValue(['i1', 'i2', 'i3']);
    mockPrisma.issue.findMany.mockResolvedValue([
      { id: 'i1', number: 1, title: 'A', projectId: 'p1', project: { id: 'p1', key: 'TT' } },
      { id: 'i2', number: 2, title: 'B', projectId: 'p1', project: { id: 'p1', key: 'TT' } },
      { id: 'i3', number: 3, title: 'C', projectId: 'p1', project: { id: 'p1', key: 'TT' } },
    ]);
    mockTransitionExecutor.preflight
      .mockResolvedValueOnce({ kind: 'ELIGIBLE' })
      .mockResolvedValueOnce({ kind: 'ELIGIBLE' })
      .mockResolvedValueOnce({ kind: 'SKIPPED', reasonCode: 'NO_TRANSITION', reason: 'no' });
    mockTransitionExecutor.execute.mockResolvedValue(undefined);
    // After batch: op updated (processed+=3), not yet fully processed (total=3, processed=3 → finalize)
    mockPrisma.bulkOperation.findUniqueOrThrow.mockResolvedValue({
      ...baseOp,
      status: 'RUNNING',
      processed: 3,
      succeeded: 2,
      skipped: 1,
      failed: 0,
    });

    const res = await runTickOnce();
    expect(res.kind).toBe('processed');
    if (res.kind === 'processed') {
      expect(res.batchSize).toBe(3);
      expect(res.finalized).toBe('SUCCEEDED');
    }
    // runInBulkOperationContext вызвана 2 раза для ELIGIBLE items.
    expect(mockContext.runInBulkOperationContext).toHaveBeenCalledTimes(2);
    // createMany для skipped-item (1 штука).
    expect(mockPrisma.bulkOperationItem.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ outcome: 'SKIPPED', errorCode: 'NO_TRANSITION', operationId: 'op-1' }),
      ]),
    });
    // heartbeat обновляется в counter-update, чтобы recovery не сбрасывал op.
    expect(mockPrisma.bulkOperation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          heartbeatAt: expect.any(Date),
        }),
      }),
    );
    // PR-6: SSE progress event + финальный status event (SUCCEEDED).
    expect(mockRedis.publishToChannel).toHaveBeenCalledWith(
      'bulk-op:op-1:events',
      expect.objectContaining({ event: 'progress' }),
    );
    expect(mockRedis.publishToChannel).toHaveBeenCalledWith(
      'bulk-op:op-1:events',
      expect.objectContaining({ event: 'status', data: expect.objectContaining({ status: 'SUCCEEDED' }) }),
    );
  });

  it('CONFLICT без пользовательского разрешения → SKIPPED с error-code', async () => {
    mockPrisma.bulkOperation.findFirst.mockResolvedValue({ ...baseOp, status: 'RUNNING', total: 1 });
    mockRedis.lpopListBatch.mockResolvedValue(['i1']);
    mockPrisma.issue.findMany.mockResolvedValue([
      { id: 'i1', number: 1, title: 'A', projectId: 'p1', project: { id: 'p1', key: 'TT' } },
    ]);
    mockTransitionExecutor.preflight.mockResolvedValue({
      kind: 'CONFLICT',
      code: 'WORKFLOW_REQUIRED_FIELDS',
      message: 'Field X required',
      requiredFields: ['X'],
    });
    mockPrisma.bulkOperation.findUniqueOrThrow.mockResolvedValue({
      ...baseOp, status: 'RUNNING', processed: 1, skipped: 1, total: 1,
    });

    await runTickOnce();
    expect(mockPrisma.bulkOperationItem.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ outcome: 'SKIPPED', errorCode: 'WORKFLOW_REQUIRED_FIELDS' })],
    });
    expect(mockTransitionExecutor.execute).not.toHaveBeenCalled();
  });

  it('executor.execute бросает исключение → item FAILED с EXECUTOR_ERROR', async () => {
    mockPrisma.bulkOperation.findFirst.mockResolvedValue({ ...baseOp, status: 'RUNNING', total: 1 });
    mockRedis.lpopListBatch.mockResolvedValue(['i1']);
    mockPrisma.issue.findMany.mockResolvedValue([
      { id: 'i1', number: 1, title: 'A', projectId: 'p1', project: { id: 'p1', key: 'TT' } },
    ]);
    mockTransitionExecutor.preflight.mockResolvedValue({ kind: 'ELIGIBLE' });
    mockTransitionExecutor.execute.mockRejectedValue(new Error('workflow boom'));
    mockPrisma.bulkOperation.findUniqueOrThrow.mockResolvedValue({
      ...baseOp, status: 'RUNNING', processed: 1, failed: 1, total: 1,
    });

    const res = await runTickOnce();
    expect(mockPrisma.bulkOperationItem.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ outcome: 'FAILED', errorCode: 'EXECUTOR_ERROR' })],
    });
    if (res.kind === 'processed') expect(res.finalized).toBe('FAILED');
  });

  it('issue удалена между LPOP и findMany → SKIPPED DELETED', async () => {
    mockPrisma.bulkOperation.findFirst.mockResolvedValue({ ...baseOp, status: 'RUNNING', total: 1 });
    mockRedis.lpopListBatch.mockResolvedValue(['i-deleted']);
    mockPrisma.issue.findMany.mockResolvedValue([]); // issue удалена
    mockPrisma.bulkOperation.findUniqueOrThrow.mockResolvedValue({
      ...baseOp, status: 'RUNNING', processed: 1, skipped: 1, total: 1,
    });

    await runTickOnce();
    expect(mockPrisma.bulkOperationItem.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ outcome: 'SKIPPED', errorCode: 'DELETED' })],
    });
  });

  it('Redis недоступен на LPOP → пропуск tick без финализации', async () => {
    mockPrisma.bulkOperation.findFirst.mockResolvedValue({ ...baseOp, status: 'RUNNING' });
    mockRedis.lpopListBatch.mockResolvedValue(null);
    const res = await runTickOnce();
    expect(res.kind).toBe('processed');
    if (res.kind === 'processed') expect(res.finalized).toBeNull();
    expect(mockPrisma.bulkOperationItem.createMany).not.toHaveBeenCalled();
  });

  it('неизвестный executor → все items FAILED c EXECUTOR_NOT_IMPLEMENTED', async () => {
    mockPrisma.bulkOperation.findFirst.mockResolvedValue({
      ...baseOp,
      type: 'ASSIGN', // в PR-4 не реализован
      status: 'RUNNING',
      total: 2,
    });
    mockRedis.lpopListBatch.mockResolvedValue(['i1', 'i2']);
    mockPrisma.bulkOperation.findUniqueOrThrow.mockResolvedValue({
      ...baseOp, type: 'ASSIGN', status: 'RUNNING', processed: 2, failed: 2, total: 2,
    });
    await runTickOnce();
    expect(mockPrisma.bulkOperationItem.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ errorCode: 'EXECUTOR_NOT_IMPLEMENTED', outcome: 'FAILED' }),
      ]),
    });
  });
});

// ────── cancel ───────────────────────────────────────────────────────────────

describe('runTickOnce — cancel', () => {
  it('cancelRequested=true до первой пачки → дренаж queue + CANCELLED', async () => {
    mockPrisma.bulkOperation.findFirst.mockResolvedValue({
      ...baseOp, status: 'RUNNING', cancelRequested: true,
    });
    mockRedis.lpopListBatch
      .mockResolvedValueOnce(['pending1', 'pending2'])
      .mockResolvedValueOnce([]); // queue пуст
    mockPrisma.bulkOperationItem.createMany.mockResolvedValue({ count: 2 });

    const res = await runTickOnce();
    if (res.kind === 'processed') {
      expect(res.finalized).toBe('CANCELLED');
    }
    expect(mockPrisma.bulkOperationItem.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ errorCode: 'CANCELLED_BY_USER', outcome: 'SKIPPED' }),
      ]),
    });
  });
});

// ────── finalize branching ──────────────────────────────────────────────────

describe('runTickOnce — finalize status', () => {
  it('PARTIAL когда failed>0 И succeeded>0', async () => {
    mockPrisma.bulkOperation.findFirst.mockResolvedValue({ ...baseOp, status: 'RUNNING', total: 2 });
    mockRedis.lpopListBatch.mockResolvedValue(['i1', 'i2']);
    mockPrisma.issue.findMany.mockResolvedValue([
      { id: 'i1', number: 1, title: 'A', projectId: 'p1', project: { id: 'p1', key: 'TT' } },
      { id: 'i2', number: 2, title: 'B', projectId: 'p1', project: { id: 'p1', key: 'TT' } },
    ]);
    mockTransitionExecutor.preflight
      .mockResolvedValueOnce({ kind: 'ELIGIBLE' })
      .mockResolvedValueOnce({ kind: 'ELIGIBLE' });
    mockTransitionExecutor.execute
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('boom'));
    mockPrisma.bulkOperation.findUniqueOrThrow.mockResolvedValue({
      ...baseOp, status: 'RUNNING', processed: 2, succeeded: 1, failed: 1, total: 2,
    });

    const res = await runTickOnce();
    if (res.kind === 'processed') expect(res.finalized).toBe('PARTIAL');
  });

  it('INVALID_TRANSITION (stale status) → SKIPPED STALE_STATUS, не FAILED', async () => {
    mockPrisma.bulkOperation.findFirst.mockResolvedValue({ ...baseOp, status: 'RUNNING', total: 1 });
    mockRedis.lpopListBatch.mockResolvedValue(['i1']);
    mockPrisma.issue.findMany.mockResolvedValue([
      { id: 'i1', number: 1, title: 'A', projectId: 'p1', project: { id: 'p1', key: 'TT' } },
    ]);
    mockTransitionExecutor.preflight.mockResolvedValue({ kind: 'ELIGIBLE' });
    mockTransitionExecutor.execute.mockRejectedValue(Object.assign(new Error('INVALID_TRANSITION'), { code: 'INVALID_TRANSITION' }));
    mockPrisma.bulkOperation.findUniqueOrThrow.mockResolvedValue({
      ...baseOp, status: 'RUNNING', processed: 1, skipped: 1, failed: 0, succeeded: 0, total: 1,
    });

    const res = await runTickOnce();
    expect(mockPrisma.bulkOperationItem.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ outcome: 'SKIPPED', errorCode: 'STALE_STATUS' })],
    });
    // succeeded=0 + failed=0 + skipped=total (1) → PARTIAL (all-skipped misleading as SUCCEEDED)
    if (res.kind === 'processed') expect(res.finalized).toBe('PARTIAL');
  });

  it('all-skipped (succeeded=0 && failed=0) → PARTIAL (не обманываем зелёной галкой)', async () => {
    mockPrisma.bulkOperation.findFirst.mockResolvedValue({ ...baseOp, status: 'RUNNING', total: 2 });
    mockRedis.lpopListBatch.mockResolvedValue(['i1', 'i2']);
    mockPrisma.issue.findMany.mockResolvedValue([
      { id: 'i1', number: 1, title: 'A', projectId: 'p1', project: { id: 'p1', key: 'TT' } },
      { id: 'i2', number: 2, title: 'B', projectId: 'p1', project: { id: 'p1', key: 'TT' } },
    ]);
    mockTransitionExecutor.preflight.mockResolvedValue({ kind: 'SKIPPED', reasonCode: 'NO_TRANSITION', reason: 'no' });
    mockPrisma.bulkOperation.findUniqueOrThrow.mockResolvedValue({
      ...baseOp, status: 'RUNNING', processed: 2, skipped: 2, succeeded: 0, failed: 0, total: 2,
    });
    const res = await runTickOnce();
    if (res.kind === 'processed') expect(res.finalized).toBe('PARTIAL');
  });

  it('SUCCEEDED когда failed=0 И succeeded>0 даже если есть skipped', async () => {
    mockPrisma.bulkOperation.findFirst.mockResolvedValue({ ...baseOp, status: 'RUNNING', total: 2 });
    mockRedis.lpopListBatch.mockResolvedValue(['i1', 'i2']);
    mockPrisma.issue.findMany.mockResolvedValue([
      { id: 'i1', number: 1, title: 'A', projectId: 'p1', project: { id: 'p1', key: 'TT' } },
      { id: 'i2', number: 2, title: 'B', projectId: 'p1', project: { id: 'p1', key: 'TT' } },
    ]);
    mockTransitionExecutor.preflight
      .mockResolvedValueOnce({ kind: 'ELIGIBLE' })
      .mockResolvedValueOnce({ kind: 'SKIPPED', reasonCode: 'NO_TRANSITION', reason: 'no' });
    mockTransitionExecutor.execute.mockResolvedValue(undefined);
    mockPrisma.bulkOperation.findUniqueOrThrow.mockResolvedValue({
      ...baseOp, status: 'RUNNING', processed: 2, succeeded: 1, skipped: 1, failed: 0, total: 2,
    });

    const res = await runTickOnce();
    if (res.kind === 'processed') expect(res.finalized).toBe('SUCCEEDED');
  });
});

// ────── recovery ─────────────────────────────────────────────────────────────

describe('runRecoveryOnce', () => {
  it('updateMany stale RUNNING → QUEUED', async () => {
    mockPrisma.bulkOperation.updateMany.mockResolvedValue({ count: 2 });
    const res = await runRecoveryOnce();
    expect(res.reset).toBe(2);
    expect(mockPrisma.bulkOperation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'RUNNING',
          heartbeatAt: expect.objectContaining({ lt: expect.any(Date) }),
        }),
        data: { status: 'QUEUED' },
      }),
    );
  });
});

// ────── retention ────────────────────────────────────────────────────────────

describe('runRetentionOnce', () => {
  it('deleteMany items > 30d + ops > 90d (терминальные)', async () => {
    mockPrisma.bulkOperationItem.deleteMany.mockResolvedValue({ count: 10 });
    mockPrisma.bulkOperation.deleteMany.mockResolvedValue({ count: 3 });
    const res = await runRetentionOnce();
    expect(res).toEqual({ deletedItems: 10, deletedOperations: 3 });
    expect(mockPrisma.bulkOperation.deleteMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        status: { notIn: ['QUEUED', 'RUNNING'] },
      }),
    });
  });
});
