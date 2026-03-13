import type { Response, NextFunction } from 'express';
import type { UserRole } from '@prisma/client';
import { AppError } from './error-handler.js';
import type { AuthRequest } from '../types/index.js';
import { hasAnyRequiredRole, isSuperAdmin } from '../auth/roles.js';

export function requireRole(...roles: UserRole[]) {
  return (req: AuthRequest, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError(401, 'Authentication required'));
    }
    if (!hasAnyRequiredRole(req.user.role, roles)) {
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
    if (!isSuperAdmin(req.user.role)) {
      return next(new AppError(403, 'Insufficient permissions'));
    }
    next();
  };
}
