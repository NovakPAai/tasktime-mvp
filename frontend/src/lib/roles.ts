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

/**
 * TTSEC-2 Phase 3 access helper for the user-groups admin surface.
 *
 * Today this is just `ADMIN` system role (SUPER_ADMIN bypasses via `hasSystemRole`). Phase 4
 * will swap the body for a real per-user permission check against `USER_GROUP_VIEW` /
 * `USER_GROUP_MANAGE` once the backend exposes per-user permissions to the client.
 *
 * Keeping the call-site abstraction stable lets Phase 4 be a one-function change without
 * hunting down inline role checks across the UI.
 */
export function canViewUserGroups(userRoles: SystemRoleType[] | null | undefined): boolean {
  return hasSystemRole(userRoles, 'ADMIN');
}

/**
 * TTMP-160 PR-5: admin access to CheckpointType / CheckpointTemplate management.
 * Mirrors the backend `requireRole` gate on both router stacks.
 */
export function canManageCheckpoints(userRoles: SystemRoleType[] | null | undefined): boolean {
  return hasAnySystemRole(userRoles, ['SUPER_ADMIN', 'ADMIN', 'RELEASE_MANAGER']);
}

/**
 * TTMP-160 PR-8 / SEC-6: audit log access. Mirrors the backend `requireRole` gate on the
 * `/admin/checkpoint-audit` router.
 */
export function canViewCheckpointAudit(
  userRoles: SystemRoleType[] | null | undefined,
): boolean {
  return hasAnySystemRole(userRoles, ['SUPER_ADMIN', 'ADMIN', 'AUDITOR']);
}

/**
 * TTBULK-1 PR-7: system settings management (session lifetime, bulk-ops limits).
 * Mirrors the backend `requireSuperAdmin()` gate.
 */
export function canManageSystemSettings(
  userRoles: SystemRoleType[] | null | undefined,
): boolean {
  return hasSystemRole(userRoles, 'SUPER_ADMIN');
}
