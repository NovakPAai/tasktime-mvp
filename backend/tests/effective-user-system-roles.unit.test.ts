/**
 * TTBULK-1 PR-2 — unit-тест на `getEffectiveUserSystemRoles` и его кэш.
 *
 * Проверяем:
 *   • UNION(DIRECT ∪ GROUP) — dedupe по ролям.
 *   • Только DIRECT / только GROUP / пусто.
 *   • Cache-hit — БД не трогается.
 *   • Cache-miss — данные пишутся в Redis с TTL 60.
 *   • Инвалидация — DEL по ключу `user:sysroles:{userId}`.
 *   • Bulk-инвалидация списка юзеров.
 *
 * Pure-unit (моки на prisma + redis); Postgres не нужен.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockPrisma, mockRedis } = vi.hoisted(() => {
  const mockPrisma = {
    userSystemRole: { findMany: vi.fn() },
    userGroupSystemRole: { findMany: vi.fn() },
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

const {
  computeEffectiveUserSystemRoles,
  getEffectiveUserSystemRoles,
  invalidateUserSystemRolesCache,
  invalidateUserSystemRolesCacheForUsers,
  sysRolesCacheKey,
} = await import('../src/shared/auth/roles.js');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('computeEffectiveUserSystemRoles — UNION без кэша', () => {
  it('возвращает пустой массив если DIRECT и GROUP пусты', async () => {
    mockPrisma.userSystemRole.findMany.mockResolvedValue([]);
    mockPrisma.userGroupSystemRole.findMany.mockResolvedValue([]);
    const roles = await computeEffectiveUserSystemRoles('u1');
    expect(roles).toEqual([]);
  });

  it('только DIRECT', async () => {
    mockPrisma.userSystemRole.findMany.mockResolvedValue([{ role: 'USER' }, { role: 'ADMIN' }]);
    mockPrisma.userGroupSystemRole.findMany.mockResolvedValue([]);
    const roles = await computeEffectiveUserSystemRoles('u1');
    expect(roles.sort()).toEqual(['ADMIN', 'USER']);
  });

  it('только GROUP (новая семантика TTBULK-1)', async () => {
    mockPrisma.userSystemRole.findMany.mockResolvedValue([]);
    mockPrisma.userGroupSystemRole.findMany.mockResolvedValue([{ role: 'BULK_OPERATOR' }]);
    const roles = await computeEffectiveUserSystemRoles('u1');
    expect(roles).toEqual(['BULK_OPERATOR']);
  });

  it('UNION: DIRECT + GROUP', async () => {
    mockPrisma.userSystemRole.findMany.mockResolvedValue([{ role: 'USER' }]);
    mockPrisma.userGroupSystemRole.findMany.mockResolvedValue([{ role: 'BULK_OPERATOR' }]);
    const roles = await computeEffectiveUserSystemRoles('u1');
    expect(roles.sort()).toEqual(['BULK_OPERATOR', 'USER']);
  });

  it('dedupe если одна и та же роль есть и DIRECT и GROUP', async () => {
    mockPrisma.userSystemRole.findMany.mockResolvedValue([{ role: 'BULK_OPERATOR' }]);
    mockPrisma.userGroupSystemRole.findMany.mockResolvedValue([{ role: 'BULK_OPERATOR' }]);
    const roles = await computeEffectiveUserSystemRoles('u1');
    expect(roles).toEqual(['BULK_OPERATOR']);
  });

  it('dedupe при множественных group-assignments одной роли', async () => {
    mockPrisma.userSystemRole.findMany.mockResolvedValue([]);
    mockPrisma.userGroupSystemRole.findMany.mockResolvedValue([
      { role: 'BULK_OPERATOR' },
      { role: 'BULK_OPERATOR' },
      { role: 'ADMIN' },
    ]);
    const roles = await computeEffectiveUserSystemRoles('u1');
    expect(roles.sort()).toEqual(['ADMIN', 'BULK_OPERATOR']);
  });
});

describe('getEffectiveUserSystemRoles — Redis TTL-кэш', () => {
  it('cache-hit: возвращает из кэша, БД не трогается', async () => {
    mockRedis.getCachedJson.mockResolvedValue(['USER', 'BULK_OPERATOR']);
    const roles = await getEffectiveUserSystemRoles('u1');
    expect(roles).toEqual(['USER', 'BULK_OPERATOR']);
    expect(mockRedis.getCachedJson).toHaveBeenCalledWith('user:sysroles:u1');
    expect(mockPrisma.userSystemRole.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.userGroupSystemRole.findMany).not.toHaveBeenCalled();
    expect(mockRedis.setCachedJson).not.toHaveBeenCalled();
  });

  it('cache-miss: читает БД и пишет в Redis с TTL=60', async () => {
    mockRedis.getCachedJson.mockResolvedValue(null);
    mockPrisma.userSystemRole.findMany.mockResolvedValue([{ role: 'USER' }]);
    mockPrisma.userGroupSystemRole.findMany.mockResolvedValue([{ role: 'BULK_OPERATOR' }]);
    const roles = await getEffectiveUserSystemRoles('u1');
    expect(roles.sort()).toEqual(['BULK_OPERATOR', 'USER']);
    expect(mockRedis.setCachedJson).toHaveBeenCalledWith(
      'user:sysroles:u1',
      expect.any(Array),
      60,
    );
  });

  it('graceful fallback: Redis недоступен (getCachedJson=null) — идём в БД и всё равно работаем', async () => {
    mockRedis.getCachedJson.mockResolvedValue(null);
    mockPrisma.userSystemRole.findMany.mockResolvedValue([{ role: 'USER' }]);
    mockPrisma.userGroupSystemRole.findMany.mockResolvedValue([]);
    const roles = await getEffectiveUserSystemRoles('u1');
    expect(roles).toEqual(['USER']);
    // setCachedJson всё равно вызывается (no-op если Redis down, но контракт — писать).
    expect(mockRedis.setCachedJson).toHaveBeenCalled();
  });
});

describe('invalidateUserSystemRolesCache', () => {
  it('удаляет ключ конкретного юзера', async () => {
    await invalidateUserSystemRolesCache('u1');
    expect(mockRedis.delCachedJson).toHaveBeenCalledWith('user:sysroles:u1');
    expect(mockRedis.delCachedJson).toHaveBeenCalledTimes(1);
  });

  it('bulk-инвалидация вызывает DEL по каждому userId', async () => {
    await invalidateUserSystemRolesCacheForUsers(['u1', 'u2', 'u3']);
    expect(mockRedis.delCachedJson).toHaveBeenCalledTimes(3);
    expect(mockRedis.delCachedJson).toHaveBeenCalledWith('user:sysroles:u1');
    expect(mockRedis.delCachedJson).toHaveBeenCalledWith('user:sysroles:u2');
    expect(mockRedis.delCachedJson).toHaveBeenCalledWith('user:sysroles:u3');
  });

  it('bulk-инвалидация пустого списка — не падает', async () => {
    await invalidateUserSystemRolesCacheForUsers([]);
    expect(mockRedis.delCachedJson).not.toHaveBeenCalled();
  });
});

describe('sysRolesCacheKey', () => {
  it('формат ключа', () => {
    expect(sysRolesCacheKey('u1')).toBe('user:sysroles:u1');
  });
});
