import type { Response, NextFunction } from 'express';
import type { SystemRoleType } from '@prisma/client';
import { AppError } from './error-handler.js';
import type { AuthRequest } from '../types/index.js';
import { hasAnySystemRole, isSuperAdmin, hasGlobalProjectReadAccess } from '../auth/roles.js';
import { prisma } from '../../prisma/client.js';

export function requireRole(...roles: SystemRoleType[]) {
  return (req: AuthRequest, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError(401, 'Authentication required'));
    }
    if (!hasAnySystemRole(req.user.systemRoles, roles)) {
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
    if (!isSuperAdmin(req.user.systemRoles)) {
      return next(new AppError(403, 'Insufficient permissions'));
    }
    next();
  };
}

export function requireProjectRole(getProjectId: (req: AuthRequest) => string, ...roles: string[]) {
  return async (req: AuthRequest, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError(401, 'Authentication required'));
    }
    // SUPER_ADMIN bypasses all project checks
    if (isSuperAdmin(req.user.systemRoles)) {
      return next();
    }
    // ADMIN, RELEASE_MANAGER, AUDITOR have global read access to all projects
    if (hasGlobalProjectReadAccess(req.user.systemRoles)) {
      return next();
    }
    const projectId = getProjectId(req);
    if (!projectId) {
      return next(new AppError(400, 'Project ID required'));
    }
    const roleMatch = await prisma.userProjectRole.findFirst({
      where: {
        userId: req.user.userId,
        projectId,
        role: { in: roles as ('ADMIN' | 'MANAGER' | 'USER' | 'VIEWER')[] },
      },
    });
    if (!roleMatch) {
      return next(new AppError(403, 'Insufficient project permissions'));
    }
    next();
  };
}
