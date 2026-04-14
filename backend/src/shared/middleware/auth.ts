import type { Response, NextFunction } from 'express';
import type { SystemRoleType } from '@prisma/client';
import { verifyAccessToken } from '../utils/jwt.js';
import { AppError } from './error-handler.js';
import type { AuthRequest } from '../types/index.js';
import { getUserSession, touchUserSession, getCachedJson, setCachedJson, isRedisAvailable } from '../redis.js';
import { prisma } from '../../prisma/client.js';

const DEFAULT_SESSION_LIFETIME_MINUTES = 60;

// In-process counter — exported so health/metrics endpoints can expose it.
export const sessionFallbackCounter = { total: 0, redis_unavailable: 0, session_missing: 0 };
const SETTING_CACHE_TTL_SECONDS = 60;
const SESSION_LIFETIME_SETTING_KEY = 'session_lifetime_minutes';
const SESSION_LIFETIME_CACHE_KEY = `settings:${SESSION_LIFETIME_SETTING_KEY}`;

async function getSessionLifetimeMinutes(): Promise<number> {
  const cached = await getCachedJson<number>(SESSION_LIFETIME_CACHE_KEY);
  if (cached !== null) return cached;

  try {
    const setting = await prisma.systemSetting.findUnique({ where: { key: SESSION_LIFETIME_SETTING_KEY } });
    const value = setting ? parseInt(setting.value, 10) : DEFAULT_SESSION_LIFETIME_MINUTES;
    const result = isNaN(value) || value < 5 ? DEFAULT_SESSION_LIFETIME_MINUTES : value;
    await setCachedJson(SESSION_LIFETIME_CACHE_KEY, result, SETTING_CACHE_TTL_SECONDS);
    return result;
  } catch {
    return DEFAULT_SESSION_LIFETIME_MINUTES;
  }
}

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
      // Corrupted session data — allow through
      return next();
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
    // session===null has three causes: (1) Redis unavailable, (2) session key expired/missing,
    // (3) session was never created (system accounts). Degrade gracefully — rely on JWT expiry.
    const reason = (await isRedisAvailable()) ? 'session_missing' : 'redis_unavailable';
    sessionFallbackCounter.total += 1;
    sessionFallbackCounter[reason] += 1;
    console.warn('[auth] sliding-session fallback', {
      userId: payload.userId,
      reason,
      counter: sessionFallbackCounter,
    });
  }

  next();
}
