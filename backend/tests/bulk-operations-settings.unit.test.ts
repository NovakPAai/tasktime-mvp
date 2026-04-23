/**
 * TTBULK-1 PR-7 — unit-тест bulk-operations-settings.service.
 *
 * Pure-unit (моки prisma + redis). Покрывает:
 *   • getBulkOpsSettings: пустой DB → ENV/hardcode defaults; малый JSON → clamp вверх;
 *     большой JSON → clamp вниз; malformed JSON → fallback defaults; Redis cache HIT;
 *     Redis DOWN → всё равно читает из DB.
 *   • setBulkOpsSettings: upsert + audit + инвалидация кэша; partial patch (только
 *     maxItems) сохраняет второе поле; clamp на write (out-of-range → clamp до границы).
 *   • clamp: non-integer → trunc; NaN/Infinity → default.
 *   • Кэш: второй вызов в пределах 60s не трогает prisma (memo).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockPrisma, mockRedis } = vi.hoisted(() => {
  const mockPrisma = {
    systemSetting: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    auditLog: { create: vi.fn() },
  };
  const mockRedis = {
    getCachedJson: vi.fn(),
    setCachedJson: vi.fn(),
    delCachedJson: vi.fn(),
  };
  return { mockPrisma, mockRedis };
});

vi.mock('../src/prisma/client.js', () => ({ prisma: mockPrisma }));
vi.mock('../src/shared/redis.js', () => mockRedis);
vi.mock('../src/shared/utils/logger.js', () => ({
  captureError: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const svc = await import('../src/modules/bulk-operations/bulk-operations-settings.service.js');

beforeEach(() => {
  vi.clearAllMocks();
  // resetAllMocks — drop any leftover mockResolvedValueOnce queue that leaks
  // from previous tests (clearAllMocks only clears call history, not one-off queue).
  mockPrisma.systemSetting.findUnique.mockReset();
  mockPrisma.systemSetting.upsert.mockReset();
  svc.__resetMemoCache();
  mockRedis.getCachedJson.mockResolvedValue(null);
  mockRedis.setCachedJson.mockResolvedValue(undefined);
  mockRedis.delCachedJson.mockResolvedValue(undefined);
  mockPrisma.auditLog.create.mockResolvedValue({});
});

describe('getBulkOpsSettings', () => {
  it('пустая DB → ENV/hardcode defaults (3 / 10000)', async () => {
    mockPrisma.systemSetting.findUnique.mockResolvedValue(null);
    const s = await svc.getBulkOpsSettings();
    // Дефолты зафиксированы (BULK_OP_MAX_CONCURRENT_PER_USER=3, BULK_OP_MAX_ITEMS=MAX_ITEMS_HARD_LIMIT=10000)
    expect(s.maxConcurrentPerUser).toBe(3);
    expect(s.maxItems).toBe(10_000);
  });

  it('JSON в DB: валидные значения — возвращает как есть', async () => {
    mockPrisma.systemSetting.findUnique.mockResolvedValue({
      key: 'bulk_operations',
      value: JSON.stringify({ maxConcurrentPerUser: 7, maxItems: 5_000 }),
    });
    const s = await svc.getBulkOpsSettings();
    expect(s).toEqual({ maxConcurrentPerUser: 7, maxItems: 5_000 });
  });

  it('JSON out-of-range: clamp вниз (maxConcurrent > 20 → 20)', async () => {
    mockPrisma.systemSetting.findUnique.mockResolvedValue({
      key: 'bulk_operations',
      value: JSON.stringify({ maxConcurrentPerUser: 999, maxItems: 99_999 }),
    });
    const s = await svc.getBulkOpsSettings();
    expect(s.maxConcurrentPerUser).toBe(20);
    // maxItems clamp'ится до runtime ceiling = min(50000, MAX_ITEMS_HARD_LIMIT=10000) = 10000.
    expect(s.maxItems).toBe(10_000);
  });

  it('JSON out-of-range: clamp вверх (maxConcurrent = 0 → 1, maxItems = 50 → 100)', async () => {
    mockPrisma.systemSetting.findUnique.mockResolvedValue({
      key: 'bulk_operations',
      value: JSON.stringify({ maxConcurrentPerUser: 0, maxItems: 50 }),
    });
    const s = await svc.getBulkOpsSettings();
    expect(s.maxConcurrentPerUser).toBe(1);
    expect(s.maxItems).toBe(100);
  });

  it('malformed JSON → fallback defaults', async () => {
    mockPrisma.systemSetting.findUnique.mockResolvedValue({
      key: 'bulk_operations',
      value: 'not-a-json{{{',
    });
    const s = await svc.getBulkOpsSettings();
    expect(s.maxConcurrentPerUser).toBe(3);
    expect(s.maxItems).toBe(10_000);
  });

  it('Redis cache HIT — не идёт в Prisma', async () => {
    mockRedis.getCachedJson.mockResolvedValue({ maxConcurrentPerUser: 5, maxItems: 2_000 });
    const s = await svc.getBulkOpsSettings();
    expect(s).toEqual({ maxConcurrentPerUser: 5, maxItems: 2_000 });
    expect(mockPrisma.systemSetting.findUnique).not.toHaveBeenCalled();
  });

  it('Redis cache HIT с out-of-range — clamp применяется даже к cached-values', async () => {
    mockRedis.getCachedJson.mockResolvedValue({ maxConcurrentPerUser: 100, maxItems: -5 });
    const s = await svc.getBulkOpsSettings();
    expect(s.maxConcurrentPerUser).toBe(20);
    expect(s.maxItems).toBe(100);
  });

  it('Redis DOWN (throw) → fallback на Prisma', async () => {
    mockRedis.getCachedJson.mockRejectedValue(new Error('redis down'));
    mockPrisma.systemSetting.findUnique.mockResolvedValue({
      key: 'bulk_operations',
      value: JSON.stringify({ maxConcurrentPerUser: 4, maxItems: 1_500 }),
    });
    const s = await svc.getBulkOpsSettings();
    expect(s).toEqual({ maxConcurrentPerUser: 4, maxItems: 1_500 });
  });

  it('Prisma throws → fallback defaults (never-throw инвариант)', async () => {
    mockPrisma.systemSetting.findUnique.mockRejectedValue(new Error('db down'));
    const s = await svc.getBulkOpsSettings();
    expect(s.maxConcurrentPerUser).toBe(3);
    expect(s.maxItems).toBe(10_000);
  });

  it('in-memory memo: второй вызов в пределах 60s не трогает Prisma', async () => {
    mockPrisma.systemSetting.findUnique.mockResolvedValue({
      key: 'bulk_operations',
      value: JSON.stringify({ maxConcurrentPerUser: 2, maxItems: 500 }),
    });
    await svc.getBulkOpsSettings();
    await svc.getBulkOpsSettings();
    expect(mockPrisma.systemSetting.findUnique).toHaveBeenCalledTimes(1);
  });
});

describe('setBulkOpsSettings', () => {
  it('happy: upsert + audit + invalidate cache', async () => {
    mockPrisma.systemSetting.findUnique.mockResolvedValue(null);
    mockPrisma.systemSetting.upsert.mockResolvedValue({});

    const res = await svc.setBulkOpsSettings('admin-1', {
      maxConcurrentPerUser: 5,
      maxItems: 2_500,
    });

    expect(res).toEqual({ maxConcurrentPerUser: 5, maxItems: 2_500 });
    expect(mockPrisma.systemSetting.upsert).toHaveBeenCalledWith({
      where: { key: 'bulk_operations' },
      create: { key: 'bulk_operations', value: JSON.stringify({ maxConcurrentPerUser: 5, maxItems: 2_500 }) },
      update: { value: JSON.stringify({ maxConcurrentPerUser: 5, maxItems: 2_500 }) },
    });
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'system.bulk_operations_settings_changed',
          userId: 'admin-1',
        }),
      }),
    );
    expect(mockRedis.delCachedJson).toHaveBeenCalledWith('settings:bulk_operations');
  });

  it('partial patch: только maxItems — maxConcurrent остаётся из current', async () => {
    mockPrisma.systemSetting.findUnique.mockResolvedValue({
      key: 'bulk_operations',
      value: JSON.stringify({ maxConcurrentPerUser: 7, maxItems: 1_000 }),
    });
    mockPrisma.systemSetting.upsert.mockResolvedValue({});

    const res = await svc.setBulkOpsSettings('admin-1', { maxItems: 3_000 });

    expect(res).toEqual({ maxConcurrentPerUser: 7, maxItems: 3_000 });
  });

  it('clamp на write: out-of-range → clamp до границы', async () => {
    mockPrisma.systemSetting.findUnique.mockResolvedValue(null);
    mockPrisma.systemSetting.upsert.mockResolvedValue({});

    const res = await svc.setBulkOpsSettings('admin-1', {
      maxConcurrentPerUser: 999,
      maxItems: 99_999,
    });

    expect(res.maxConcurrentPerUser).toBe(20);
    expect(res.maxItems).toBe(10_000); // min(50000, MAX_ITEMS_HARD_LIMIT)
  });

  it('invalidate memo: следующий getBulkOpsSettings читает свежее значение', async () => {
    // set() внутри сам вызывает getBulkOpsSettings → первый findUnique (#1),
    // затем в upsert записывает новое значение. После set — memo сброшен,
    // следующий getBulkOpsSettings идёт в findUnique (#2) и должен увидеть новое.
    mockPrisma.systemSetting.findUnique
      .mockResolvedValueOnce({
        key: 'bulk_operations',
        value: JSON.stringify({ maxConcurrentPerUser: 1, maxItems: 100 }),
      })
      .mockResolvedValueOnce({
        key: 'bulk_operations',
        value: JSON.stringify({ maxConcurrentPerUser: 10, maxItems: 100 }),
      });
    mockPrisma.systemSetting.upsert.mockResolvedValue({});

    await svc.setBulkOpsSettings('admin-1', { maxConcurrentPerUser: 10 });

    const after = await svc.getBulkOpsSettings();
    expect(after.maxConcurrentPerUser).toBe(10);
  });
});

describe('clamp edge cases (через get)', () => {
  it('NaN в JSON → fallback default', async () => {
    mockPrisma.systemSetting.findUnique.mockResolvedValue({
      key: 'bulk_operations',
      value: JSON.stringify({ maxConcurrentPerUser: NaN, maxItems: 'abc' }),
    });
    const s = await svc.getBulkOpsSettings();
    // JSON.stringify превратит NaN в null, 'abc' останется строкой; clamp default'ит обоих.
    expect(s.maxConcurrentPerUser).toBe(3);
    expect(s.maxItems).toBe(10_000);
  });

  it('non-integer (5.7) → trunc до 5', async () => {
    mockPrisma.systemSetting.findUnique.mockResolvedValue({
      key: 'bulk_operations',
      value: JSON.stringify({ maxConcurrentPerUser: 5.7, maxItems: 1_500.9 }),
    });
    const s = await svc.getBulkOpsSettings();
    expect(s.maxConcurrentPerUser).toBe(5);
    expect(s.maxItems).toBe(1_500);
  });
});
