import type { Response, NextFunction } from 'express';
import type { SystemRoleType, ProjectPermission } from '@prisma/client';
import { AppError } from './error-handler.js';
import type { AuthRequest } from '../types/index.js';
import { hasAnySystemRole, isSuperAdmin, hasGlobalProjectReadAccess } from '../auth/roles.js';
import { prisma } from '../../prisma/client.js';
import { getSchemeForProject } from '../../modules/project-role-schemes/project-role-schemes.service.js';
import { getCachedJson, setCachedJson, delCacheByPrefix } from '../redis.js';

/**
 * Invalidate cached permission results for a user+project pair.
 *
 * INVARIANT: every write path that creates, updates, or deletes a UserProjectRole MUST call
 * this helper (or `delCacheByPrefix('rbac:perm:${projectId}:')` for bulk updates). Current
 * callers:
 *   - admin.service.assignProjectRole / removeProjectRole — per-user invalidation
 *   - project-role-schemes.service.attachProject / detachProject — per-project prefix invalidation
 *     (covers all users through the composite-FK remap)
 *   - project-role-schemes.service.updatePermissions + create/update/deleteRole — per-scheme
 *     invalidation via `invalidatePermissionCacheForScheme`
 *
 * Missing a call leaves `requireProjectPermission` serving stale allow/deny decisions for up
 * to the cache TTL (60s).
 */
export async function invalidateProjectPermissionCache(projectId: string, userId: string): Promise<void> {
  await delCacheByPrefix(`rbac:perm:${projectId}:${userId}:`);
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

    const cacheKey = `rbac:perm:${projectId}:${req.user.userId}:${permission}`;

    try {
      // Cache holds only positive (granted) results — a cached `true` means "still allowed".
      // We do not cache deny decisions: a missing cache entry means "recompute", so granting a
      // new role via a write path that forgot to invalidate still takes effect on the next
      // request instead of being masked by a stale `false` for the full TTL.
      const cachedResult = await getCachedJson<boolean>(cacheKey);
      if (cachedResult === true) return next();

      const scheme = await getSchemeForProject(projectId);
      // Read ALL roles the user has in this project (in the canonical one-role-per-project model
      // this returns 0..1 rows; during the migration window or after legacy data import it may
      // return more). Permission is granted if ANY of the user's roles grants it — most
      // permissive wins. This also makes behavior deterministic if multiple rows ever coexist.
      const userRoles = await prisma.userProjectRole.findMany({
        where: { userId: req.user.userId, projectId },
        select: { roleId: true, role: true },
      });

      let granted = false;
      for (const ur of userRoles) {
        // Prefer roleId. If it's missing OR points to a role outside the active scheme
        // (e.g. the project was recently re-attached to a different scheme and the migration
        // hasn't caught up yet), fall back to matching by the legacy `role` key.
        let roleDef = ur.roleId ? scheme.roles.find(r => r.id === ur.roleId) : undefined;
        if (!roleDef) {
          roleDef = scheme.roles.find(r => r.key === ur.role);
        }
        if (roleDef?.permissions.find(p => p.permission === permission)?.granted) {
          granted = true;
          break;
        }
      }

      if (granted) await setCachedJson(cacheKey, true, 60);
      return granted ? next() : next(new AppError(403, 'Insufficient project permissions'));
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
