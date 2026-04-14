import type { SystemRoleType } from '../types';

export function hasSystemRole(userRoles: SystemRoleType[] | null | undefined, requiredRole: SystemRoleType): boolean {
  if (!userRoles || userRoles.length === 0) return false;
  return userRoles.includes('SUPER_ADMIN') || userRoles.includes(requiredRole);
}

export function hasAnySystemRole(
  userRoles: SystemRoleType[] | null | undefined,
  requiredRoles: readonly SystemRoleType[],
): boolean {
  return requiredRoles.some((role) => hasSystemRole(userRoles, role));
}

export function hasGlobalProjectReadAccess(userRoles: SystemRoleType[] | null | undefined): boolean {
  return hasAnySystemRole(userRoles, ['SUPER_ADMIN', 'ADMIN', 'RELEASE_MANAGER', 'AUDITOR']);
}

/** @deprecated Use hasSystemRole */
export function hasRequiredRole(userRoles: SystemRoleType[] | null | undefined, requiredRole: SystemRoleType): boolean {
  return hasSystemRole(userRoles, requiredRole);
}

/** @deprecated Use hasAnySystemRole */
export function hasAnyRequiredRole(
  userRoles: SystemRoleType[] | null | undefined,
  requiredRoles: readonly SystemRoleType[],
): boolean {
  return hasAnySystemRole(userRoles, requiredRoles);
}
