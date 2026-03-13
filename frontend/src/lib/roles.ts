import type { UserRole } from '../types';

export function hasRequiredRole(userRole: UserRole | null | undefined, requiredRole: UserRole): boolean {
  return Boolean(userRole) && (userRole === 'SUPER_ADMIN' || userRole === requiredRole);
}

export function hasAnyRequiredRole(
  userRole: UserRole | null | undefined,
  requiredRoles: readonly UserRole[],
): boolean {
  return requiredRoles.some((requiredRole) => hasRequiredRole(userRole, requiredRole));
}
