import type { Response, NextFunction } from 'express';
import type { SystemRoleType } from '@prisma/client';
import { verifyAccessToken } from '../utils/jwt.js';
import { AppError } from './error-handler.js';
import type { AuthRequest } from '../types/index.js';
import { getUserSession, touchUserSession, isRedisAvailable } from '../redis.js';
import { getSessionLifetimeMinutes, SYSTEM_ACCOUNT_DOMAIN } from '../utils/session-settings.js';

// In-process counter — exported so health/metrics endpoints can expose it.
export const sessionFallbackCounter = { total: 0, redis_unavailable: 0, session_missing: 0 };

export async function authenticate(req: AuthRequest, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(new AppError(401, 'Authentication required'));
  }

  let payload;
  try {
    const token = header.slice(7);
    payload = verifyAccessToken(token);
  } catch {
    return next(new AppError(401, 'Invalid or expired token'));
  }

  req.user = {
    userId: payload.userId,
    email: payload.email,
    systemRoles: payload.systemRoles as SystemRoleType[],
  };

  // Sliding session check — skip for system accounts
  const session = await getUserSession(payload.userId);

  if (session !== null) {
    // Redis is available and session exists — check inactivity
    if (!session.userId) {
      return next(new AppError(401, 'Session invalid', { code: 'SESSION_INVALID' }));
    }

    const lifetimeMinutes = await getSessionLifetimeMinutes();
    const lastSeen = new Date(session.lastSeenAt).getTime();
    const idleMs = Date.now() - lastSeen;

    if (idleMs > lifetimeMinutes * 60 * 1000) {
      return next(new AppError(401, 'Session expired due to inactivity', { code: 'SESSION_EXPIRED' }));
    }

    // Extend session — await so TOCTOU expiry is detected
    const touched = await touchUserSession(payload.userId, lifetimeMinutes * 60);
    if (!touched) {
      // Session expired between the check and the touch — deny access
      return next(new AppError(401, 'Session expired due to inactivity', { code: 'SESSION_EXPIRED' }));
    }
  } else {
    // session===null: (1) Redis unavailable, (2) session key expired, (3) system accounts.
    if (await isRedisAvailable()) {
      // Redis is up — session key is gone, meaning it expired or was never created.
      // System accounts (agent@) never get a session key; allow them through.
      // Regular users with an expired key must re-authenticate.
      const isSystemAccount = payload.email.endsWith(SYSTEM_ACCOUNT_DOMAIN);
      if (!isSystemAccount) {
        sessionFallbackCounter.total += 1;
        sessionFallbackCounter['session_missing'] += 1;
        return next(new AppError(401, 'Session expired due to inactivity', { code: 'SESSION_EXPIRED' }));
      }
    } else {
      // Redis is unavailable — degrade gracefully, rely on JWT expiry.
      sessionFallbackCounter.total += 1;
      sessionFallbackCounter['redis_unavailable'] += 1;
      console.warn('[auth] sliding-session fallback: redis unavailable', {
        userId: payload.userId,
        counter: sessionFallbackCounter,
      });
    }
  }

  next();
}
