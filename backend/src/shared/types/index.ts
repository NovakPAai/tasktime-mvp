import type { Request } from 'express';
import type { SystemRoleType } from '@prisma/client';

export interface AuthUser {
  userId: string;
  email: string;
  systemRoles: SystemRoleType[];
}

export interface AuthRequest extends Request {
  user?: AuthUser;
}
