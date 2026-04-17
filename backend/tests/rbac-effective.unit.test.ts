/**
 * Unit-тесты для group-aware RBAC из rbac.ts.
 * Проверяем computeEffectiveRole + assertProjectPermission: выбор max-permissions,
 * детерминированный tiebreaker, fallback через active scheme, source=DIRECT/GROUP.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ProjectPermission } from '@prisma/client';

const { mockPrisma } = vi.hoisted(() => {
  const mockPrisma = {
    userProjectRole: { findMany: vi.fn() },
    projectGroupRole: { findMany: vi.fn() },
    userGroupMember: { findMany: vi.fn() },
  };
  return { mockPrisma };
});

vi.mock('../src/prisma/client.js', () => ({ prisma: mockPrisma }));

vi.mock('../src/shared/redis.js', () => ({
  getCachedJson: vi.fn().mockResolvedValue(null), // always miss → exercise compute path
  setCachedJson: vi.fn(),
  delCachedJson: vi.fn(),
  delCacheByPrefix: vi.fn(),
}));

const mockGetScheme = vi.fn();
vi.mock('../src/modules/project-role-schemes/project-role-schemes.service.js', () => ({
  getSchemeForProject: (projectId: string) => mockGetScheme(projectId),
}));

// Import after mocks.
const {
  computeEffectiveRole,
  assertProjectPermission,
  getEffectiveProjectPermissions,
  computeEffectiveRolesForProjects,
} = await import('../src/shared/middleware/rbac.js');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function role(id: string, key: string, name: string, perms: ProjectPermission[]) {
  return {
    id, key, name,
    permissions: perms.map(p => ({ permission: p, granted: true })),
  };
}

const USER_ID = 'user-1';
const PROJECT_ID = 'proj-1';
const SCHEME_ID = 'scheme-1';

const ADMIN = role('r-admin', 'ADMIN', 'Администратор', [
  'ISSUES_VIEW', 'ISSUES_CREATE', 'ISSUES_EDIT', 'ISSUES_DELETE',
  'SPRINTS_CREATE', 'SPRINTS_EDIT', 'SPRINTS_DELETE',
  'COMMENTS_MANAGE', 'COMMENTS_DELETE_OTHERS',
] as ProjectPermission[]);
const USER = role('r-user', 'USER', 'Участник', [
  'ISSUES_VIEW', 'ISSUES_CREATE',
] as ProjectPermission[]);
const VIEWER = role('r-viewer', 'VIEWER', 'Наблюдатель', ['ISSUES_VIEW'] as ProjectPermission[]);

beforeEach(() => {
  vi.clearAllMocks();
  mockGetScheme.mockResolvedValue({ id: SCHEME_ID, roles: [ADMIN, USER, VIEWER] });
  mockPrisma.userProjectRole.findMany.mockResolvedValue([]);
  mockPrisma.projectGroupRole.findMany.mockResolvedValue([]);
});

// ─── computeEffectiveRole ────────────────────────────────────────────────────

describe('computeEffectiveRole', () => {
  it('returns null when user has neither direct nor group role', async () => {
    expect(await computeEffectiveRole(USER_ID, PROJECT_ID)).toBeNull();
  });

  it('resolves DIRECT-only user via roleId', async () => {
    mockPrisma.userProjectRole.findMany.mockResolvedValue([
      { roleId: USER.id, role: 'USER' },
    ]);
    const eff = await computeEffectiveRole(USER_ID, PROJECT_ID);
    expect(eff).not.toBeNull();
    expect(eff!.source).toBe('DIRECT');
    expect(eff!.roleKey).toBe('USER');
    expect(eff!.permissions).toContain('ISSUES_VIEW');
    expect(eff!.permissions).not.toContain('ISSUES_DELETE');
  });

  it('falls back to matching by legacy `role` key when roleId is NULL', async () => {
    mockPrisma.userProjectRole.findMany.mockResolvedValue([
      { roleId: null, role: 'USER' },
    ]);
    const eff = await computeEffectiveRole(USER_ID, PROJECT_ID);
    expect(eff?.roleKey).toBe('USER');
  });

  it('falls back to `role` key when roleId points outside active scheme', async () => {
    // Stale roleId (scheme switched) — runtime falls back to legacy key match.
    mockPrisma.userProjectRole.findMany.mockResolvedValue([
      { roleId: 'stale-role-id', role: 'ADMIN' },
    ]);
    const eff = await computeEffectiveRole(USER_ID, PROJECT_ID);
    expect(eff?.roleKey).toBe('ADMIN');
    expect(eff?.permissions).toContain('ISSUES_DELETE');
  });

  it('resolves GROUP-only user and exposes sourceGroups', async () => {
    mockPrisma.projectGroupRole.findMany.mockResolvedValue([
      {
        roleId: ADMIN.id,
        group: { id: 'g-1', name: 'Frontend Team' },
        roleDefinition: { key: 'ADMIN' },
      },
    ]);
    const eff = await computeEffectiveRole(USER_ID, PROJECT_ID);
    expect(eff?.source).toBe('GROUP');
    expect(eff?.sourceGroups).toEqual([{ id: 'g-1', name: 'Frontend Team' }]);
    expect(eff?.permissions).toContain('ISSUES_DELETE');
  });

  it('picks role with max permissions when user has DIRECT=USER and GROUP=ADMIN', async () => {
    mockPrisma.userProjectRole.findMany.mockResolvedValue([{ roleId: USER.id, role: 'USER' }]);
    mockPrisma.projectGroupRole.findMany.mockResolvedValue([
      { roleId: ADMIN.id, group: { id: 'g-1', name: 'Admins' }, roleDefinition: { key: 'ADMIN' } },
    ]);
    const eff = await computeEffectiveRole(USER_ID, PROJECT_ID);
    expect(eff?.roleKey).toBe('ADMIN');
    expect(eff?.source).toBe('GROUP');
    expect(eff?.sourceGroups[0]?.id).toBe('g-1');
  });

  it('tiebreaker by roleId asc when two roles grant equal permissions', async () => {
    const roleA = role('zzzz', 'A', 'A', ['ISSUES_VIEW'] as ProjectPermission[]);
    const roleB = role('aaaa', 'B', 'B', ['ISSUES_VIEW'] as ProjectPermission[]);
    mockGetScheme.mockResolvedValue({ id: SCHEME_ID, roles: [roleA, roleB] });
    mockPrisma.userProjectRole.findMany.mockResolvedValue([{ roleId: roleA.id, role: 'A' }]);
    mockPrisma.projectGroupRole.findMany.mockResolvedValue([
      { roleId: roleB.id, group: { id: 'g', name: 'G' }, roleDefinition: { key: 'B' } },
    ]);
    const eff = await computeEffectiveRole(USER_ID, PROJECT_ID);
    expect(eff?.roleId).toBe('aaaa'); // min id wins tiebreaker
  });

  it('source=DIRECT but sourceGroups lists every group that also grants the same role (round 4)', async () => {
    mockPrisma.userProjectRole.findMany.mockResolvedValue([{ roleId: ADMIN.id, role: 'ADMIN' }]);
    mockPrisma.projectGroupRole.findMany.mockResolvedValue([
      { roleId: ADMIN.id, group: { id: 'g-1', name: 'Admins' }, roleDefinition: { key: 'ADMIN' } },
      { roleId: ADMIN.id, group: { id: 'g-2', name: 'Leads' }, roleDefinition: { key: 'ADMIN' } },
    ]);
    const eff = await computeEffectiveRole(USER_ID, PROJECT_ID);
    expect(eff?.source).toBe('DIRECT');
    expect(eff?.sourceGroups).toEqual([
      { id: 'g-1', name: 'Admins' },
      { id: 'g-2', name: 'Leads' },
    ]);
  });

  it('sourceGroups is deduplicated when the same group appears twice (AI review #65 round 2)', async () => {
    mockPrisma.userProjectRole.findMany.mockResolvedValue([]);
    mockPrisma.projectGroupRole.findMany.mockResolvedValue([
      { roleId: ADMIN.id, group: { id: 'g-1', name: 'Admins' }, roleDefinition: { key: 'ADMIN' } },
      { roleId: ADMIN.id, group: { id: 'g-1', name: 'Admins' }, roleDefinition: { key: 'ADMIN' } },
      { roleId: ADMIN.id, group: { id: 'g-2', name: 'Leads' }, roleDefinition: { key: 'ADMIN' } },
    ]);
    const eff = await computeEffectiveRole(USER_ID, PROJECT_ID);
    expect(eff?.sourceGroups).toEqual([
      { id: 'g-1', name: 'Admins' },
      { id: 'g-2', name: 'Leads' },
    ]);
  });
});

// ─── computeEffectiveRolesForProjects (batched) ──────────────────────────────

describe('computeEffectiveRolesForProjects', () => {
  it('returns empty map on empty input without any DB call', async () => {
    const res = await computeEffectiveRolesForProjects(USER_ID, []);
    expect(res.size).toBe(0);
    expect(mockPrisma.userProjectRole.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.projectGroupRole.findMany).not.toHaveBeenCalled();
  });

  it('makes exactly one direct query and one group query for N projects', async () => {
    mockPrisma.userProjectRole.findMany.mockResolvedValue([
      { projectId: 'p1', roleId: USER.id, role: 'USER' },
      { projectId: 'p2', roleId: ADMIN.id, role: 'ADMIN' },
    ]);
    mockPrisma.projectGroupRole.findMany.mockResolvedValue([]);

    const res = await computeEffectiveRolesForProjects(USER_ID, ['p1', 'p2', 'p3']);

    expect(mockPrisma.userProjectRole.findMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.projectGroupRole.findMany).toHaveBeenCalledTimes(1);
    expect(res.get('p1')?.roleKey).toBe('USER');
    expect(res.get('p2')?.roleKey).toBe('ADMIN');
    expect(res.get('p3')).toBeNull(); // no role in p3
  });

  it('merges DIRECT + GROUP per-project with max-permissions pick', async () => {
    mockPrisma.userProjectRole.findMany.mockResolvedValue([
      { projectId: 'p1', roleId: USER.id, role: 'USER' },
    ]);
    mockPrisma.projectGroupRole.findMany.mockResolvedValue([
      { projectId: 'p1', roleId: ADMIN.id, group: { id: 'g-1', name: 'G' }, roleDefinition: { key: 'ADMIN' } },
    ]);
    const res = await computeEffectiveRolesForProjects(USER_ID, ['p1']);
    const eff = res.get('p1');
    expect(eff?.roleKey).toBe('ADMIN');
    expect(eff?.source).toBe('GROUP');
  });
});

// ─── assertProjectPermission (OR-list) ───────────────────────────────────────

describe('assertProjectPermission', () => {
  const authUser = { userId: USER_ID, email: 'u@ex.com', systemRoles: [] };

  it('passes when the user has at least one of the listed permissions', async () => {
    mockPrisma.userProjectRole.findMany.mockResolvedValue([{ roleId: ADMIN.id, role: 'ADMIN' }]);
    await expect(
      assertProjectPermission(authUser, PROJECT_ID, ['COMMENTS_DELETE_OTHERS', 'COMMENTS_MANAGE']),
    ).resolves.toBeUndefined();
  });

  it('throws 403 when none of the listed permissions are granted', async () => {
    mockPrisma.userProjectRole.findMany.mockResolvedValue([{ roleId: USER.id, role: 'USER' }]);
    await expect(
      assertProjectPermission(authUser, PROJECT_ID, ['COMMENTS_DELETE_OTHERS', 'COMMENTS_MANAGE']),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('SUPER_ADMIN bypasses regardless of granted permissions', async () => {
    const superUser = { userId: USER_ID, email: 'u@ex.com', systemRoles: ['SUPER_ADMIN' as const] };
    await expect(
      assertProjectPermission(superUser, PROJECT_ID, ['SPRINTS_DELETE']),
    ).resolves.toBeUndefined();
    expect(mockPrisma.userProjectRole.findMany).not.toHaveBeenCalled();
  });

  it('rejects empty permission list (programmer error)', async () => {
    await expect(
      assertProjectPermission(authUser, PROJECT_ID, []),
    ).rejects.toMatchObject({ statusCode: 500 });
  });
});

// ─── getEffectiveProjectPermissions ──────────────────────────────────────────

describe('getEffectiveProjectPermissions', () => {
  it('returns empty array when no role found', async () => {
    const perms = await getEffectiveProjectPermissions(USER_ID, PROJECT_ID);
    expect(perms).toEqual([]);
  });

  it('returns the granted permissions of the chosen role', async () => {
    mockPrisma.userProjectRole.findMany.mockResolvedValue([{ roleId: ADMIN.id, role: 'ADMIN' }]);
    const perms = await getEffectiveProjectPermissions(USER_ID, PROJECT_ID);
    expect(perms).toContain('SPRINTS_CREATE');
    expect(perms).toContain('SPRINTS_DELETE');
  });
});
