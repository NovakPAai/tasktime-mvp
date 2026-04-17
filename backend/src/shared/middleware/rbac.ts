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
 * Cache layout: `rbac:effective:{userId}:{projectId}` → string[] (granted perms), TTL 60s.
 * Cache is prefixed by userId first so we can drop a user's entire set on membership change.
 */

const EFFECTIVE_KEY = (userId: string, projectId: string) =>
  `rbac:effective:${userId}:${projectId}`;
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
    delCachedJson(EFFECTIVE_KEY(userId, projectId)),
    // Legacy per-permission cache — some callers may still hit it during deploy window.
    delCacheByPrefix(`rbac:perm:${projectId}:${userId}:`),
  ]);
}

/**
 * Drop every cached effective-permission set for a single user across ALL projects. Called when
 * the user's group membership changes (added/removed from a group), since that affects every
 * project that group is bound to.
 */
export async function invalidateUserEffectivePermissions(userId: string): Promise<void> {
  await delCacheByPrefix(`rbac:effective:${userId}:`);
}

/**
 * Drop every cached effective-permission set for a project. Scans and deletes only the minority
 * of users who had their entry cached (most won't). Call when a project-level scheme/role binding
 * changes and you want to avoid iterating all group members.
 */
export async function invalidateProjectEffectivePermissions(projectId: string): Promise<void> {
  // Redis doesn't support suffix-scan efficiently; fall back to iterating direct members + group
  // members. For unbounded projects we could add pg_notify later; MVP uses explicit user-scan.
  const [directUsers, groupUsers] = await Promise.all([
    prisma.userProjectRole.findMany({ where: { projectId }, select: { userId: true } }),
    prisma.userGroupMember.findMany({
      where: { group: { projectRoles: { some: { projectId } } } },
      select: { userId: true },
    }),
  ]);
  const userIds = new Set<string>([
    ...directUsers.map(u => u.userId),
    ...groupUsers.map(u => u.userId),
  ]);
  await Promise.all(
    Array.from(userIds).map(uid => delCachedJson(EFFECTIVE_KEY(uid, projectId))),
  );
  // Also kill legacy prefix for safety during the Phase 2 deploy window.
  await delCacheByPrefix(`rbac:perm:${projectId}:`);
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
      existing.groups.push(row.group);
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
    sourceGroups: chosen.groups,
  };
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
  const key = EFFECTIVE_KEY(userId, projectId);
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
    throw new AppError(403, `Requires one of: ${permissions.join(', ')}`);
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
