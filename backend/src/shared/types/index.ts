import type { Request } from 'express';
import type { SystemRoleType } from '@prisma/client';

export interface AuthRequest extends Request {
  user?: {
    userId: string;
    email: string;
    systemRoles: SystemRoleType[];
  };
}
