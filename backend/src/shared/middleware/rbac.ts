import type { Response, NextFunction } from 'express';
import type { SystemRoleType, ProjectPermission } from '@prisma/client';
import { AppError } from './error-handler.js';
import type { AuthRequest, AuthUser } from '../types/index.js';
import { hasAnySystemRole, isSuperAdmin, hasGlobalProjectReadAccess } from '../auth/roles.js';
import { prisma } from '../../prisma/client.js';
import { getSchemeForProject } from '../../modules/project-role-schemes/project-role-schemes.service.js';
import { getCachedJson, setCachedJson, delCachedJson, delCacheByPrefix } from '../redis.js';

/**
 * TTSEC-2 Phase 2: group-aware effective permissions.
 *
 * We compute a single "effective role" per (user, project) by unioning:
 *   - DIRECT UserProjectRole rows
 *   - roles granted via UserGroupMember → ProjectGroupRole bindings
 *
 * Among all candidates we pick the ONE role with the most `granted=true` permissions;
 * tiebreaker — roleId ascending (for determinism across replicas). This matches spec §5.2.
 *
 * Cache layout (AI review #65 round 3): `rbac:effective:{projectId}:{userId}` → string[] (granted
 * perms), TTL 60s. Key is projectId-first so scheme-level changes (attach/detach project, delete
 * role, update permission matrix) can do a single prefix SCAN + delete — covering ALL cached
 * users for the project, including ones who just lost access and no longer appear in the current
 * bindings query. For per-user wipes (group membership change) we iterate the user's affected
 * projects and delete pair-by-pair — bounded by the user's actual project count, not the whole
 * keyspace.
 */

const EFFECTIVE_KEY = (projectId: string, userId: string) =>
  `rbac:effective:${projectId}:${userId}`;
const EFFECTIVE_PROJECT_PREFIX = (projectId: string) => `rbac:effective:${projectId}:`;
const EFFECTIVE_TTL = 60;

/**
 * Invalidate cached permissions for a single (user, project) pair.
 *
 * INVARIANT: every write path that affects which roles apply to a user in a project MUST call
 * this helper (or one of the broader helpers below). Current callers:
 *   - admin.service.assignProjectRole / removeProjectRole — per-user invalidation
 *   - project-role-schemes.service.attachProject / detachProject — per-project prefix invalidation
 *   - project-role-schemes.service.updatePermissions + create/update/deleteRole — per-scheme
 *     invalidation via `invalidatePermissionCacheForScheme`
 *   - user-groups.service.* — per-user (members) or per-group (project-role bindings)
 *
 * Missing a call leaves `requireProjectPermission` serving stale allow decisions for up to TTL.
 */
export async function invalidateProjectPermissionCache(projectId: string, userId: string): Promise<void> {
  await Promise.all([
    // New group-aware effective cache (single composite key).
    delCachedJson(EFFECTIVE_KEY(projectId, userId)),
    // Legacy per-permission cache — some callers may still hit it during deploy window.
    delCacheByPrefix(`rbac:perm:${projectId}:${userId}:`),
  ]);
}

/**
 * Drop every cached effective-permission set for a single user across ALL projects. Called when
 * the user's group membership changes (added/removed from a group), since that affects every
 * project the user could see through direct roles or group bindings.
 *
 * Implementation iterates the user's currently-known projects (direct roles + groups the user
 * is in) and deletes pair-by-pair. If the caller knows the exact projectIds affected (e.g. the
 * group just bound/unbound), they should call `invalidateProjectPermissionCache(pid, uid)` for
 * each pair directly — cheaper and exact. This helper is for the general "something about this
 * user changed, flush them" case.
 */
export async function invalidateUserEffectivePermissions(userId: string): Promise<void> {
  const [directProjects, groupProjects] = await Promise.all([
    prisma.userProjectRole.findMany({ where: { userId }, select: { projectId: true } }),
    prisma.projectGroupRole.findMany({
      where: { group: { members: { some: { userId } } } },
      select: { projectId: true },
    }),
  ]);
  const projectIds = new Set<string>([
    ...directProjects.map(r => r.projectId),
    ...groupProjects.map(r => r.projectId),
  ]);
  await Promise.all(
    Array.from(projectIds).map(pid => invalidateProjectPermissionCache(pid, userId)),
  );
}

/**
 * Drop every cached effective-permission set for a project — regardless of whether a user still
 * has a direct/group binding.
 *
 * AI review #65 round 3 🟠 — scheme changes may REMOVE bindings (detach project, delete role,
 * update matrix), and those users' stale cache entries must be wiped too. Prefix SCAN + DELETE
 * on `rbac:effective:{projectId}:*` handles exactly this: it hits every user whose entry was
 * ever cached for the project, not just users currently visible in the bindings query.
 */
export async function invalidateProjectEffectivePermissions(projectId: string): Promise<void> {
  await Promise.all([
    delCacheByPrefix(EFFECTIVE_PROJECT_PREFIX(projectId)),
    // Legacy per-permission cache — same treatment for deploy-window safety.
    delCacheByPrefix(`rbac:perm:${projectId}:`),
  ]);
}

type EffectiveRole = {
  roleId: string;
  roleName: string;
  roleKey: string;
  permissions: ProjectPermission[];
  source: 'DIRECT' | 'GROUP';
  sourceGroups: { id: string; name: string }[]; // populated when source=GROUP (may be multiple)
};

/**
 * Compute the effective role for a (user, project). Returns `null` if the user has no direct role
 * and is not a member of any group bound to the project.
 *
 * The returned role is the ONE with max granted-permissions count across candidates
 * (tiebreaker: roleId asc). `sourceGroups` lists every group that supplied the chosen role —
 * typically one, but can be several if two groups bind to the same role definition.
 *
 * This is NOT cached — cache the permission set via `getEffectiveProjectPermissions`. Routes that
 * need the role object itself (SecurityTab, /users/me/security) read it uncached; they're rare.
 */
export async function computeEffectiveRole(
  userId: string,
  projectId: string,
): Promise<EffectiveRole | null> {
  // Resolve via the project's ACTIVE scheme — a binding whose roleId points to a stale
  // (previously-active) scheme falls back to matching by role key in the active scheme. This
  // mirrors the original requireProjectPermission contract and covers the transitional state
  // where some UserProjectRole rows still carry roleId=NULL.
  const scheme = await getSchemeForProject(projectId);
  const rolesInScheme = scheme.roles; // [{ id, key, permissions: [{permission, granted}] }]

  const [directRows, groupRows] = await Promise.all([
    prisma.userProjectRole.findMany({
      where: { userId, projectId },
      select: { roleId: true, role: true },
    }),
    prisma.projectGroupRole.findMany({
      where: { projectId, group: { members: { some: { userId } } } },
      select: {
        roleId: true,
        group: { select: { id: true, name: true } },
        // Need the binding role's `key` in case the binding's scheme doesn't match active scheme.
        roleDefinition: { select: { key: true } },
      },
    }),
  ]);

  type CandidateRole = typeof rolesInScheme[number];
  type Candidate = { role: CandidateRole; source: 'DIRECT' | 'GROUP'; groups: { id: string; name: string }[] };
  const byRoleId = new Map<string, Candidate>();

  const resolveInScheme = (roleId: string | null | undefined, legacyKey: string | undefined): CandidateRole | undefined => {
    if (roleId) {
      const byId = rolesInScheme.find(r => r.id === roleId);
      if (byId) return byId;
    }
    if (legacyKey) {
      return rolesInScheme.find(r => r.key === legacyKey);
    }
    return undefined;
  };

  for (const row of directRows) {
    const role = resolveInScheme(row.roleId, row.role);
    if (!role) continue;
    if (!byRoleId.has(role.id)) {
      byRoleId.set(role.id, { role, source: 'DIRECT', groups: [] });
    }
  }
  for (const row of groupRows) {
    const role = resolveInScheme(row.roleId, row.roleDefinition.key);
    if (!role) continue;
    const existing = byRoleId.get(role.id);
    if (existing) {
      // Dedup by group id — defensive: two bindings of the same group to the same role should
      // be prevented by `@@unique([groupId, projectId])`, but data migration / join anomalies
      // could still produce duplicates and leak to /users/me/security.
      if (!existing.groups.some(g => g.id === row.group.id)) {
        existing.groups.push(row.group);
      }
    } else {
      byRoleId.set(role.id, { role, source: 'GROUP', groups: [row.group] });
    }
  }

  const candidates = Array.from(byRoleId.values());
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    const aGranted = a.role.permissions.filter(p => p.granted).length;
    const bGranted = b.role.permissions.filter(p => p.granted).length;
    const d = bGranted - aGranted;
    return d !== 0 ? d : a.role.id.localeCompare(b.role.id);
  });

  const chosen = candidates[0]!;
  return {
    roleId: chosen.role.id,
    roleName: chosen.role.name,
    roleKey: chosen.role.key,
    permissions: chosen.role.permissions.filter(p => p.granted).map(p => p.permission),
    source: chosen.source,
    // AI review #65 round 3 🟡 — when the chosen role is DIRECT, don't leak irrelevant group
    // context. If the user also holds the same role via groups, that's informational only and
    // unrelated to the effective grant path; keeping it would contradict `source: 'DIRECT'`.
    sourceGroups: chosen.source === 'DIRECT' ? [] : chosen.groups,
  };
}

/**
 * Batched variant of computeEffectiveRole for many projects at once. Used by
 * /users/me/security (AI review #65 round 2 — avoid N+1 when a user is in many projects).
 *
 * Query plan: 1× direct-roles + 1× group-roles + N× getSchemeForProject (Redis-cached, 300s TTL).
 * Total DB queries: 2 instead of 2N; scheme reads hit Redis unless cold.
 */
export async function computeEffectiveRolesForProjects(
  userId: string,
  projectIds: string[],
): Promise<Map<string, EffectiveRole | null>> {
  const result = new Map<string, EffectiveRole | null>();
  if (projectIds.length === 0) return result;

  const [directRows, groupRows, schemes] = await Promise.all([
    prisma.userProjectRole.findMany({
      where: { userId, projectId: { in: projectIds } },
      select: { projectId: true, roleId: true, role: true },
    }),
    prisma.projectGroupRole.findMany({
      where: { projectId: { in: projectIds }, group: { members: { some: { userId } } } },
      select: {
        projectId: true,
        roleId: true,
        group: { select: { id: true, name: true } },
        roleDefinition: { select: { key: true } },
      },
    }),
    Promise.all(projectIds.map(async pid => [pid, await getSchemeForProject(pid)] as const)),
  ]);

  const schemeByProject = new Map(schemes);
  const directByProject = new Map<string, typeof directRows>();
  const groupByProject = new Map<string, typeof groupRows>();
  for (const row of directRows) {
    const arr = directByProject.get(row.projectId) ?? [];
    arr.push(row);
    directByProject.set(row.projectId, arr);
  }
  for (const row of groupRows) {
    const arr = groupByProject.get(row.projectId) ?? [];
    arr.push(row);
    groupByProject.set(row.projectId, arr);
  }

  for (const projectId of projectIds) {
    const scheme = schemeByProject.get(projectId);
    if (!scheme) { result.set(projectId, null); continue; }
    const rolesInScheme = scheme.roles;
    type CandidateRole = typeof rolesInScheme[number];
    type Candidate = { role: CandidateRole; source: 'DIRECT' | 'GROUP'; groups: { id: string; name: string }[] };
    const byRoleId = new Map<string, Candidate>();

    const resolveInScheme = (roleId: string | null | undefined, legacyKey: string | undefined): CandidateRole | undefined => {
      if (roleId) {
        const byId = rolesInScheme.find(r => r.id === roleId);
        if (byId) return byId;
      }
      if (legacyKey) return rolesInScheme.find(r => r.key === legacyKey);
      return undefined;
    };

    for (const row of (directByProject.get(projectId) ?? [])) {
      const role = resolveInScheme(row.roleId, row.role);
      if (!role) continue;
      if (!byRoleId.has(role.id)) byRoleId.set(role.id, { role, source: 'DIRECT', groups: [] });
    }
    for (const row of (groupByProject.get(projectId) ?? [])) {
      const role = resolveInScheme(row.roleId, row.roleDefinition.key);
      if (!role) continue;
      const existing = byRoleId.get(role.id);
      if (existing) {
        if (!existing.groups.some(g => g.id === row.group.id)) existing.groups.push(row.group);
      } else {
        byRoleId.set(role.id, { role, source: 'GROUP', groups: [row.group] });
      }
    }

    const candidates = Array.from(byRoleId.values());
    if (candidates.length === 0) { result.set(projectId, null); continue; }

    candidates.sort((a, b) => {
      const aGranted = a.role.permissions.filter(p => p.granted).length;
      const bGranted = b.role.permissions.filter(p => p.granted).length;
      const d = bGranted - aGranted;
      return d !== 0 ? d : a.role.id.localeCompare(b.role.id);
    });

    const chosen = candidates[0]!;
    result.set(projectId, {
      roleId: chosen.role.id,
      roleName: chosen.role.name,
      roleKey: chosen.role.key,
      permissions: chosen.role.permissions.filter(p => p.granted).map(p => p.permission),
      source: chosen.source,
      // AI review #65 round 3 🟡 — see single-project variant above.
      sourceGroups: chosen.source === 'DIRECT' ? [] : chosen.groups,
    });
  }

  return result;
}

/**
 * Return the effective permission set (granted=true only) for a (user, project). Redis-cached.
 *
 * Returns an empty array if the user has no access. We cache empty arrays too — unlike deny-caches
 * in permission-specific code, the "no role at all" state is stable and changes only via explicit
 * writes that DO call invalidation helpers.
 */
export async function getEffectiveProjectPermissions(
  userId: string,
  projectId: string,
): Promise<ProjectPermission[]> {
  const key = EFFECTIVE_KEY(projectId, userId);
  const cached = await getCachedJson<ProjectPermission[]>(key);
  if (cached !== null) return cached;

  const role = await computeEffectiveRole(userId, projectId);
  const perms = role?.permissions ?? [];
  await setCachedJson(key, perms, EFFECTIVE_TTL);
  return perms;
}

/**
 * Assert that the authenticated user has AT LEAST ONE of the listed permissions in the project.
 * Used when multiple permissions can authorise an action — e.g. deleting a comment authored by
 * someone else requires `COMMENTS_DELETE_OTHERS` OR `COMMENTS_MANAGE`.
 *
 * SUPER_ADMIN bypasses. Global project-read roles bypass only if EVERY permission in the list is
 * a `_VIEW` permission (otherwise we'd let them perform writes via the view-access shortcut).
 */
export async function assertProjectPermission(
  user: AuthUser,
  projectId: string,
  permissions: ProjectPermission[],
): Promise<void> {
  if (permissions.length === 0) throw new AppError(500, 'assertProjectPermission: empty list');
  if (isSuperAdmin(user.systemRoles)) return;
  if (permissions.every(p => p.endsWith('_VIEW')) && hasGlobalProjectReadAccess(user.systemRoles)) return;

  const granted = await getEffectiveProjectPermissions(user.userId, projectId);
  const grantedSet = new Set(granted);
  if (!permissions.some(p => grantedSet.has(p))) {
    throw new AppError(403, `Требуется одно из прав: ${permissions.join(', ')}`);
  }
}

export function requireRole(...roles: SystemRoleType[]) {
  return (req: AuthRequest, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError(401, 'Authentication required'));
    }
    if (!hasAnySystemRole(req.user.systemRoles, roles)) {
      return next(new AppError(403, 'Insufficient permissions'));
    }
    next();
  };
}

export function requireSuperAdmin() {
  return (req: AuthRequest, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError(401, 'Authentication required'));
    }
    if (!isSuperAdmin(req.user.systemRoles)) {
      return next(new AppError(403, 'Insufficient permissions'));
    }
    next();
  };
}

/**
 * Options for requireProjectPermission.
 * - allowGlobalRead: when true (default) and the permission is a read (_VIEW), users with
 *   global project-read system roles bypass the project membership check. Set to `false` for
 *   endpoints that must be strictly scoped to project members (e.g. sensitive per-project data).
 */
export type RequireProjectPermissionOptions = {
  allowGlobalRead?: boolean;
};

export function requireProjectPermission(
  getProjectId: (req: AuthRequest) => string,
  permission: ProjectPermission,
  options: RequireProjectPermissionOptions = {},
) {
  const { allowGlobalRead = true } = options;
  return async (req: AuthRequest, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new AppError(401, 'Authentication required'));
    if (isSuperAdmin(req.user.systemRoles)) return next();
    if (allowGlobalRead && permission.endsWith('_VIEW') && hasGlobalProjectReadAccess(req.user.systemRoles)) return next();

    const projectId = getProjectId(req);
    if (!projectId) return next(new AppError(400, 'Project ID required'));

    try {
      // TTSEC-2 Phase 2: uses the unified group-aware effective-permissions cache.
      const granted = await getEffectiveProjectPermissions(req.user.userId, projectId);
      if (granted.includes(permission)) return next();
      return next(new AppError(403, 'Insufficient project permissions'));
    } catch (err) {
      next(err);
    }
  };
}

export function requireProjectRole(getProjectId: (req: AuthRequest) => string, ...roles: string[]) {
  return async (req: AuthRequest, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError(401, 'Authentication required'));
    }
    // SUPER_ADMIN bypasses all project checks
    if (isSuperAdmin(req.user.systemRoles)) {
      return next();
    }
    // ADMIN, RELEASE_MANAGER, AUDITOR have global read access to all projects
    if (hasGlobalProjectReadAccess(req.user.systemRoles)) {
      return next();
    }
    const projectId = getProjectId(req);
    if (!projectId) {
      return next(new AppError(400, 'Project ID required'));
    }
    const roleMatch = await prisma.userProjectRole.findFirst({
      where: {
        userId: req.user.userId,
        projectId,
        role: { in: roles as ('ADMIN' | 'MANAGER' | 'USER' | 'VIEWER')[] },
      },
    });
    if (!roleMatch) {
      return next(new AppError(403, 'Insufficient project permissions'));
    }
    next();
  };
}
