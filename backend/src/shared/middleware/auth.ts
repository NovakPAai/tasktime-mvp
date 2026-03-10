import type { Response, NextFunction } from 'express';
import type { UserRole } from '@prisma/client';
import { verifyAccessToken } from '../utils/jwt.js';
import { AppError } from './error-handler.js';
import type { AuthRequest } from '../types/index.js';

export function authenticate(req: AuthRequest, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(new AppError(401, 'Authentication required'));
  }

  try {
    const token = header.slice(7);
    const payload = verifyAccessToken(token);
    req.user = {
      userId: payload.userId,
      email: payload.email,
      role: payload.role as UserRole,
    };
    next();
  } catch {
    next(new AppError(401, 'Invalid or expired token'));
  }
}
