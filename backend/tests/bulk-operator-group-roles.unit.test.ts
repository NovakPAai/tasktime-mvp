/**
 * TTBULK-1 PR-8 — unit-тесты group-level system role management.
 *
 * Pure-unit (моки prisma + redis + rbac). Покрывает:
 *   • grantSystemRoleToGroup: happy (создаёт + invalidates members); idempotent
 *     (повторный grant возвращает existing, не зовёт create); 404 group not found;
 *     no members → create без invalidation (micro-optimization).
 *   • revokeSystemRoleFromGroup: happy (delete + invalidates members); 404 group;
 *     404 роль не назначена; no members → delete без invalidation.
 *   • getSystemRoleAssignments: два списка (users DIRECT + groups), order по grantedAt DESC.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockPrisma } = vi.hoisted(() => {
  const mockPrisma = {
    userGroup: { findUnique: vi.fn() },
    userGroupSystemRole: {
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      findMany: vi.fn(),
    },
    userSystemRole: { findMany: vi.fn() },
  };
  return { mockPrisma };
});

vi.mock('../src/prisma/client.js', () => ({ prisma: mockPrisma }));

const mockInvalidateSysRolesCache = vi.fn();
// NB: relative path здесь — `'../src/shared/auth/roles.js'`. Он должен совпадать с тем,
// как user-groups.service.ts импортирует этот модуль (`'../../shared/auth/roles.js'`) —
// Vitest матчит по resolved path. Если roles.ts когда-нибудь переедет или будет
// ре-экспортироваться через barrel, этот mock нужно будет обновить.
vi.mock('../src/shared/auth/roles.js', () => ({
  invalidateUserSystemRolesCacheForUsers: mockInvalidateSysRolesCache,
  isSuperAdmin: (roles: string[]) => roles.includes('SUPER_ADMIN'),
}));

// Unused rbac helper is imported transitively; stub it out silently.
vi.mock('../src/shared/middleware/rbac.js', () => ({
  invalidateProjectPermissionCache: vi.fn(),
}));

const service = await import('../src/modules/user-groups/user-groups.service.js');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('grantSystemRoleToGroup', () => {
  it('happy: создаёт запись + инвалидирует кэш всех участников', async () => {
    mockPrisma.userGroup.findUnique.mockResolvedValue({
      id: 'g1',
      members: [{ userId: 'u1' }, { userId: 'u2' }, { userId: 'u3' }],
    });
    mockPrisma.userGroupSystemRole.findUnique.mockResolvedValue(null);
    mockPrisma.userGroupSystemRole.create.mockResolvedValue({
      id: 'sr1',
      role: 'BULK_OPERATOR',
      createdAt: new Date(),
      createdBy: 'admin-1',
    });

    const res = await service.grantSystemRoleToGroup('g1', 'BULK_OPERATOR', {
      userId: 'admin-1',
      systemRoles: ['ADMIN'],
    });

    expect(res.role).toBe('BULK_OPERATOR');
    expect(mockPrisma.userGroupSystemRole.create).toHaveBeenCalledWith({
      data: { groupId: 'g1', role: 'BULK_OPERATOR', createdBy: 'admin-1' },
      select: expect.anything(),
    });
    expect(mockInvalidateSysRolesCache).toHaveBeenCalledWith(['u1', 'u2', 'u3']);
  });

  it('idempotent: повторный grant возвращает existing, не зовёт create и не инвалидирует', async () => {
    mockPrisma.userGroup.findUnique.mockResolvedValue({
      id: 'g1',
      members: [{ userId: 'u1' }],
    });
    const existing = {
      id: 'sr1',
      role: 'BULK_OPERATOR',
      createdAt: new Date('2026-01-01'),
      createdBy: 'admin-1',
    };
    mockPrisma.userGroupSystemRole.findUnique.mockResolvedValue(existing);

    const res = await service.grantSystemRoleToGroup('g1', 'BULK_OPERATOR', {
      userId: 'admin-2',
      systemRoles: ['ADMIN'],
    });

    expect(res).toEqual(existing);
    expect(mockPrisma.userGroupSystemRole.create).not.toHaveBeenCalled();
    expect(mockInvalidateSysRolesCache).not.toHaveBeenCalled();
  });

  it('группа без участников: create без invalidation (нечего инвалидировать)', async () => {
    mockPrisma.userGroup.findUnique.mockResolvedValue({ id: 'g1', members: [] });
    mockPrisma.userGroupSystemRole.findUnique.mockResolvedValue(null);
    mockPrisma.userGroupSystemRole.create.mockResolvedValue({
      id: 'sr1',
      role: 'AUDITOR',
      createdAt: new Date(),
      createdBy: 'admin-1',
    });

    await service.grantSystemRoleToGroup('g1', 'AUDITOR', {
      userId: 'admin-1',
      systemRoles: ['ADMIN'],
    });

    expect(mockPrisma.userGroupSystemRole.create).toHaveBeenCalled();
    expect(mockInvalidateSysRolesCache).not.toHaveBeenCalled();
  });

  it('404: группа не найдена', async () => {
    mockPrisma.userGroup.findUnique.mockResolvedValue(null);

    await expect(
      service.grantSystemRoleToGroup('missing', 'ADMIN', {
        userId: 'admin-1',
        systemRoles: ['SUPER_ADMIN'],
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(mockPrisma.userGroupSystemRole.create).not.toHaveBeenCalled();
  });

  it('🟠 403: ADMIN (не SUPER_ADMIN) не может grant SUPER_ADMIN через группу', async () => {
    await expect(
      service.grantSystemRoleToGroup('g1', 'SUPER_ADMIN', {
        userId: 'admin-1',
        systemRoles: ['ADMIN'],
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(mockPrisma.userGroup.findUnique).not.toHaveBeenCalled();
  });

  it('🟠 403: ADMIN не может grant ADMIN через группу (privilege escalation guard)', async () => {
    await expect(
      service.grantSystemRoleToGroup('g1', 'ADMIN', {
        userId: 'admin-1',
        systemRoles: ['ADMIN'],
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('SUPER_ADMIN может grant SUPER_ADMIN — guard разрешает', async () => {
    mockPrisma.userGroup.findUnique.mockResolvedValue({ id: 'g1', members: [] });
    mockPrisma.userGroupSystemRole.findUnique.mockResolvedValue(null);
    mockPrisma.userGroupSystemRole.create.mockResolvedValue({
      id: 'sr1',
      role: 'SUPER_ADMIN',
      createdAt: new Date(),
      createdBy: 'sa-1',
    });

    const res = await service.grantSystemRoleToGroup('g1', 'SUPER_ADMIN', {
      userId: 'sa-1',
      systemRoles: ['SUPER_ADMIN'],
    });
    expect(res.role).toBe('SUPER_ADMIN');
  });

  it('🟠 P2002 race: параллельный create проигрывает @@unique → re-fetch winner', async () => {
    mockPrisma.userGroup.findUnique.mockResolvedValue({
      id: 'g1',
      members: [{ userId: 'u1' }],
    });
    mockPrisma.userGroupSystemRole.findUnique.mockResolvedValue(null);
    // P2002 simulation
    class FakePrismaErr extends Error {
      code = 'P2002';
      clientVersion = 'x';
      meta = { target: ['group_id', 'role'] };
    }
    const { Prisma } = await import('@prisma/client');
    const p2002 = Object.assign(new FakePrismaErr(), { name: 'PrismaClientKnownRequestError' });
    Object.setPrototypeOf(p2002, Prisma.PrismaClientKnownRequestError.prototype);
    mockPrisma.userGroupSystemRole.create.mockRejectedValueOnce(p2002);
    const winner = {
      id: 'sr-winner',
      role: 'BULK_OPERATOR',
      createdAt: new Date(),
      createdBy: 'admin-other',
    };
    mockPrisma.userGroupSystemRole.findUniqueOrThrow = vi.fn().mockResolvedValue(winner);

    const res = await service.grantSystemRoleToGroup('g1', 'BULK_OPERATOR', {
      userId: 'admin-1',
      systemRoles: ['ADMIN'],
    });

    expect(res).toEqual(winner);
    expect(mockPrisma.userGroupSystemRole.findUniqueOrThrow).toHaveBeenCalled();
  });
});

describe('revokeSystemRoleFromGroup', () => {
  it('happy: удаляет + инвалидирует кэш всех участников', async () => {
    mockPrisma.userGroup.findUnique.mockResolvedValue({
      id: 'g1',
      members: [{ userId: 'u1' }, { userId: 'u2' }],
    });
    mockPrisma.userGroupSystemRole.findUnique.mockResolvedValue({ id: 'sr1' });
    mockPrisma.userGroupSystemRole.delete.mockResolvedValue({});

    const res = await service.revokeSystemRoleFromGroup('g1', 'BULK_OPERATOR', {
      userId: 'admin-1',
      systemRoles: ['ADMIN'],
    });

    expect(res).toEqual({ ok: true });
    expect(mockPrisma.userGroupSystemRole.delete).toHaveBeenCalledWith({ where: { id: 'sr1' } });
    expect(mockInvalidateSysRolesCache).toHaveBeenCalledWith(['u1', 'u2']);
  });

  it('404: группа не найдена', async () => {
    mockPrisma.userGroup.findUnique.mockResolvedValue(null);
    await expect(
      service.revokeSystemRoleFromGroup('missing', 'ADMIN', {
        userId: 'admin-1',
        systemRoles: ['SUPER_ADMIN'],
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('404: роль не назначена этой группе', async () => {
    mockPrisma.userGroup.findUnique.mockResolvedValue({ id: 'g1', members: [] });
    mockPrisma.userGroupSystemRole.findUnique.mockResolvedValue(null);

    await expect(
      service.revokeSystemRoleFromGroup('g1', 'ADMIN', {
        userId: 'admin-1',
        systemRoles: ['SUPER_ADMIN'],
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(mockPrisma.userGroupSystemRole.delete).not.toHaveBeenCalled();
  });

  it('группа без участников: delete без invalidation', async () => {
    mockPrisma.userGroup.findUnique.mockResolvedValue({ id: 'g1', members: [] });
    mockPrisma.userGroupSystemRole.findUnique.mockResolvedValue({ id: 'sr1' });
    mockPrisma.userGroupSystemRole.delete.mockResolvedValue({});

    await service.revokeSystemRoleFromGroup('g1', 'AUDITOR', {
      userId: 'admin-1',
      systemRoles: ['ADMIN'],
    });

    expect(mockPrisma.userGroupSystemRole.delete).toHaveBeenCalled();
    expect(mockInvalidateSysRolesCache).not.toHaveBeenCalled();
  });
});

describe('getSystemRoleAssignments', () => {
  it('возвращает раздельные списки users (DIRECT) + groups', async () => {
    const now = new Date('2026-04-23T10:00:00Z');
    const earlier = new Date('2026-04-22T10:00:00Z');

    mockPrisma.userSystemRole.findMany.mockResolvedValue([
      {
        createdAt: now,
        user: { id: 'u1', name: 'Alice', email: 'a@x', isActive: true },
      },
      {
        createdAt: earlier,
        user: { id: 'u2', name: 'Bob', email: 'b@x', isActive: false },
      },
    ]);
    mockPrisma.userGroupSystemRole.findMany.mockResolvedValue([
      {
        id: 'sr1',
        createdAt: now,
        group: {
          id: 'g1',
          name: 'Admins',
          description: 'Bulk admins',
          _count: { members: 5 },
        },
      },
    ]);

    const res = await service.getSystemRoleAssignments('BULK_OPERATOR');

    expect(res.role).toBe('BULK_OPERATOR');
    expect(res.users).toHaveLength(2);
    expect(res.users[0]).toEqual({
      id: 'u1',
      name: 'Alice',
      email: 'a@x',
      isActive: true,
      grantedAt: now,
    });
    expect(res.users[1].id).toBe('u2');
    expect(res.users[1].isActive).toBe(false);

    expect(res.groups).toHaveLength(1);
    expect(res.groups[0]).toEqual({
      id: 'g1',
      name: 'Admins',
      description: 'Bulk admins',
      memberCount: 5,
      grantedAt: now,
      assignmentId: 'sr1',
    });
  });

  it('пустые assignments — пустые списки', async () => {
    mockPrisma.userSystemRole.findMany.mockResolvedValue([]);
    mockPrisma.userGroupSystemRole.findMany.mockResolvedValue([]);

    const res = await service.getSystemRoleAssignments('ADMIN');
    expect(res.users).toEqual([]);
    expect(res.groups).toEqual([]);
  });
});
