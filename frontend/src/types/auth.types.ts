/** Auth domain types — TTUI-125 */

export type SystemRoleType = 'SUPER_ADMIN' | 'ADMIN' | 'RELEASE_MANAGER' | 'USER' | 'AUDITOR' | 'BULK_OPERATOR';

/** @deprecated Use SystemRoleType. Kept for legacy compatibility. */
export type UserRole = SystemRoleType;

export interface User {
  id: string;
  email: string;
  name: string;
  systemRoles: SystemRoleType[];
  isActive: boolean;
  mustChangePassword?: boolean;
  createdAt: string;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
}
