import type { Prisma, SystemRoleType } from '@prisma/client';
import { hasGlobalProjectReadAccess } from '../auth/roles.js';

/**
 * Prisma WHERE clause that limits issue queries to rows visible to userId.
 * Users with global project read access (SUPER_ADMIN, ADMIN, RELEASE_MANAGER,
 * AUDITOR) see all issues — pass an empty object so no filter is applied.
 * Regular users see only issues in projects where they have a role.
 */
export function accessibleIssueWhere(
  userId: string,
  systemRoles: SystemRoleType[],
): Prisma.IssueWhereInput {
  if (hasGlobalProjectReadAccess(systemRoles)) return {};
  return {
    project: {
      userRoles: { some: { userId } },
    },
  };
}

export type IssueAccessLevel = 'global' | 'member' | 'none';

/** Returns the access level for a specific project. */
export function issueAccessLevel(
  userId: string,
  systemRoles: SystemRoleType[],
  projectUserRoles: { userId: string }[],
): IssueAccessLevel {
  if (hasGlobalProjectReadAccess(systemRoles)) return 'global';
  if (projectUserRoles.some((r) => r.userId === userId)) return 'member';
  return 'none';
}
