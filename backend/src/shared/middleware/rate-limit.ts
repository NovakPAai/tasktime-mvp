import type { Request, Response, NextFunction } from 'express';
import { AppError } from './error-handler.js';

interface Bucket {
  count: number;
  resetAt: number;
}

const store = new Map<string, Bucket>();

// GC: purge expired buckets every minute (no-op in short-lived lambdas).
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of store) {
      if (bucket.resetAt < now) store.delete(key);
    }
  }, 60_000).unref?.();
}

export interface RateLimitOptions {
  /** Distinct namespace, e.g. "auth-login". Prevents cross-route collisions. */
  scope: string;
  limit: number;
  windowMs: number;
}

function clientKey(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? 'anonymous';
}

/** Express middleware that enforces a rate limit. Calls next(AppError 429) when exceeded. */
export function rateLimit(opts: RateLimitOptions) {
  if (process.env.NODE_ENV === 'test') return (_req: Request, _res: Response, next: NextFunction) => next();
  return (req: Request, _res: Response, next: NextFunction): void => {
    const key = `${opts.scope}:${clientKey(req)}`;
    const now = Date.now();
    const existing = store.get(key);

    if (!existing || existing.resetAt < now) {
      // Evict oldest 10% if store exceeds 100k entries
      if (store.size >= 100_000) {
        let evicted = 0;
        for (const [k] of store) {
          store.delete(k);
          if (++evicted >= 10_000) break;
        }
      }
      store.set(key, { count: 1, resetAt: now + opts.windowMs });
      return next();
    }

    existing.count += 1;
    if (existing.count > opts.limit) {
      const retryAfter = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
      return next(
        new AppError(429, 'Too many requests', { retryAfter }),
      );
    }
    next();
  };
}

// ─── Standard policies ────────────────────────────────────────────────────────

export const RATE_LIMITS = {
  authRead:  { scope: 'auth-read',  limit: 30, windowMs: 60_000 },  // GET, registration-status
  authWrite: { scope: 'auth-write', limit: 10, windowMs: 60_000 },  // login, register, refresh, change-password
  invite:    { scope: 'invite',     limit: 20, windowMs: 60_000 },
  apiKey:    { scope: 'api-key',    limit: 20, windowMs: 60_000 },
} as const satisfies Record<string, RateLimitOptions>;
