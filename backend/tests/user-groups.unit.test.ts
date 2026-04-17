/**
 * Unit-тесты для user-groups сервиса. Фокус — инварианты cache-инвалидации
 * и корректность CRUD/membership логики без реальной БД.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockPrisma } = vi.hoisted(() => {
  const mockPrisma = {
    userGroup: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    userGroupMember: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
      delete: vi.fn(),
    },
    projectGroupRole: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    projectRoleDefinition: { findUnique: vi.fn() },
    projectRoleScheme: { findFirst: vi.fn() },
    projectRoleSchemeProject: { findUnique: vi.fn() },
    project: { findUnique: vi.fn() },
    user: { findMany: vi.fn() },
  };
  return { mockPrisma };
});

vi.mock('../src/prisma/client.js', () => ({ prisma: mockPrisma }));
vi.mock('../src/shared/redis.js', () => ({
  getCachedJson: vi.fn(),
  setCachedJson: vi.fn(),
  delCachedJson: vi.fn(),
  delCacheByPrefix: vi.fn(),
}));

const invalidateUserEffective = vi.fn();
const invalidatePerProject = vi.fn();
vi.mock('../src/shared/middleware/rbac.js', () => ({
  invalidateUserEffectivePermissions: invalidateUserEffective,
  invalidateProjectPermissionCache: invalidatePerProject,
}));

const service = await import('../src/modules/user-groups/user-groups.service.js');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createGroup', () => {
  it('creates a group when the name is free', async () => {
    mockPrisma.userGroup.findUnique.mockResolvedValue(null);
    mockPrisma.userGroup.create.mockResolvedValue({ id: 'g1', name: 'Team', description: null });
    const result = await service.createGroup({ name: 'Team' });
    expect(result.id).toBe('g1');
    expect(mockPrisma.userGroup.create).toHaveBeenCalledWith({
      data: { name: 'Team', description: null },
    });
  });

  it('rejects duplicate group names with 409', async () => {
    mockPrisma.userGroup.findUnique.mockResolvedValue({ id: 'existing' });
    await expect(service.createGroup({ name: 'Team' })).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe('addMembers', () => {
  it('invalidates effective-permission cache for every added user', async () => {
    mockPrisma.userGroup.findUnique.mockResolvedValue({ id: 'g1' });
    mockPrisma.user.findMany.mockResolvedValue([{ id: 'u1' }, { id: 'u2' }]);
    mockPrisma.userGroupMember.createMany.mockResolvedValue({ count: 2 });

    const result = await service.addMembers('g1', ['u1', 'u2'], 'actor');
    expect(result.added).toBe(2);
    expect(invalidateUserEffective).toHaveBeenCalledWith('u1');
    expect(invalidateUserEffective).toHaveBeenCalledWith('u2');
  });

  it('rejects when some user ids do not exist', async () => {
    mockPrisma.userGroup.findUnique.mockResolvedValue({ id: 'g1' });
    mockPrisma.user.findMany.mockResolvedValue([{ id: 'u1' }]);
    await expect(service.addMembers('g1', ['u1', 'missing'], 'actor')).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(invalidateUserEffective).not.toHaveBeenCalled();
  });
});

describe('removeMember', () => {
  it('invalidates effective-permission cache for the removed user', async () => {
    mockPrisma.userGroupMember.findUnique.mockResolvedValue({ groupId: 'g1' });
    mockPrisma.userGroupMember.delete.mockResolvedValue({});
    await service.removeMember('g1', 'u1');
    expect(invalidateUserEffective).toHaveBeenCalledWith('u1');
  });

  it('returns 404 when the user is not a member', async () => {
    mockPrisma.userGroupMember.findUnique.mockResolvedValue(null);
    await expect(service.removeMember('g1', 'u1')).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('grantProjectRole', () => {
  beforeEach(() => {
    mockPrisma.userGroup.findUnique.mockResolvedValue({ id: 'g1' });
    mockPrisma.project.findUnique.mockResolvedValue({ id: 'p1' });
    mockPrisma.projectRoleDefinition.findUnique.mockResolvedValue({
      id: 'r1', schemeId: 'scheme-active',
    });
    mockPrisma.projectRoleSchemeProject.findUnique.mockResolvedValue({ schemeId: 'scheme-active' });
  });

  it('creates a new binding when none exists', async () => {
    mockPrisma.projectGroupRole.findUnique.mockResolvedValue(null);
    mockPrisma.projectGroupRole.create.mockResolvedValue({ id: 'b1' });
    mockPrisma.userGroupMember.findMany.mockResolvedValue([{ userId: 'u1' }, { userId: 'u2' }]);

    await service.grantProjectRole('g1', { projectId: 'p1', roleId: 'r1' });

    expect(mockPrisma.projectGroupRole.create).toHaveBeenCalled();
    expect(invalidatePerProject).toHaveBeenCalledWith('p1', 'u1');
    expect(invalidatePerProject).toHaveBeenCalledWith('p1', 'u2');
  });

  it('rejects a role that belongs to another scheme', async () => {
    mockPrisma.projectRoleDefinition.findUnique.mockResolvedValue({
      id: 'r1', schemeId: 'scheme-other',
    });
    await expect(
      service.grantProjectRole('g1', { projectId: 'p1', roleId: 'r1' }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('idempotent: re-granting the same roleId is a no-op returning the existing binding', async () => {
    mockPrisma.projectGroupRole.findUnique.mockResolvedValue({ id: 'b-existing', roleId: 'r1' });
    const result = await service.grantProjectRole('g1', { projectId: 'p1', roleId: 'r1' });
    expect(result).toMatchObject({ id: 'b-existing' });
    expect(mockPrisma.projectGroupRole.create).not.toHaveBeenCalled();
    expect(mockPrisma.projectGroupRole.update).not.toHaveBeenCalled();
  });
});

describe('deleteGroup', () => {
  it('returns affected user×project pairs and invalidates each distinct user', async () => {
    mockPrisma.userGroup.findUnique.mockResolvedValue({
      id: 'g1', name: 'Team',
      members: [{ userId: 'u1' }, { userId: 'u2' }],
      projectRoles: [
        { projectId: 'p1', roleId: 'r1' },
        { projectId: 'p2', roleId: 'r1' },
      ],
    });
    mockPrisma.userGroup.delete.mockResolvedValue({});

    const result = await service.deleteGroup('g1');

    expect(result.affectedPairs).toHaveLength(4); // 2 users × 2 projects
    expect(invalidateUserEffective).toHaveBeenCalledWith('u1');
    expect(invalidateUserEffective).toHaveBeenCalledWith('u2');
    expect(invalidateUserEffective).toHaveBeenCalledTimes(2); // dedup by user
  });
});
