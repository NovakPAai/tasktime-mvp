import type { UserRole } from '@prisma/client';

export function hasRequiredRole(userRole: UserRole, requiredRole: UserRole): boolean {
  return userRole === 'SUPER_ADMIN' || userRole === requiredRole;
}

export function hasAnyRequiredRole(userRole: UserRole, requiredRoles: readonly UserRole[]): boolean {
  return requiredRoles.some((requiredRole) => hasRequiredRole(userRole, requiredRole));
}

export function isSuperAdmin(userRole: UserRole): boolean {
  return userRole === 'SUPER_ADMIN';
}
