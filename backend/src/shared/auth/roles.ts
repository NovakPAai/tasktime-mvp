import type { SystemRoleType } from '@prisma/client';

export function hasSystemRole(userRoles: SystemRoleType[], requiredRole: SystemRoleType): boolean {
  return userRoles.includes('SUPER_ADMIN') || userRoles.includes(requiredRole);
}

export function hasAnySystemRole(userRoles: SystemRoleType[], requiredRoles: readonly SystemRoleType[]): boolean {
  return requiredRoles.some((role) => hasSystemRole(userRoles, role));
}

export function isSuperAdmin(userRoles: SystemRoleType[]): boolean {
  return userRoles.includes('SUPER_ADMIN');
}

/** Returns true if the user has global read access to all projects. */
export function hasGlobalProjectReadAccess(userRoles: SystemRoleType[]): boolean {
  return hasAnySystemRole(userRoles, ['SUPER_ADMIN', 'ADMIN', 'RELEASE_MANAGER', 'AUDITOR']);
}

