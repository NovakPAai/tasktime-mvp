/**
 * TTSRH-1 PR-5 — Redis-backed per-user rate limiter for /api/search/issues.
 *
 * Design per §R15 ТЗ: 30 requests per minute per user on the expensive DB path
 * (compile + findMany). Cheap read-only endpoints (`/search/validate`,
 * `/search/schema`) are NOT limited — they don't touch Postgres heavily and a
 * throttle would harm the editor's real-time feedback loop.
 *
 * Implementation: **fixed-window bucket** via Redis `INCR` with a 60s TTL.
 * Key format `search:rate:<userId>:<unix-minute>` rolls over at minute
 * boundaries. A true sliding window (sorted set + ZADD/ZREMRANGEBYSCORE) is
 * a Phase-2 upgrade if burst-at-boundary abuse becomes an observed problem.
 *
 * If Redis is unavailable, `incrWithTtl` returns `null` and we **fail open**
 * — a broken cache shouldn't block legitimate traffic. The fail-open branch
 * logs once per request so ops can correlate bypass events with Redis health.
 */

import type { Request, Response, NextFunction } from 'express';
import { incrWithTtl } from '../../shared/redis.js';
import type { AuthRequest } from '../../shared/types/index.js';

const WINDOW_SECONDS = 60;
const MAX_REQUESTS_PER_WINDOW = 30;

/**
 * Express middleware. Requires `authenticate` to run first. When the bucket is
 * exhausted, responds with `429 Too Many Requests` + `Retry-After` header per
 * HTTP spec.
 */
export function searchRateLimit(req: Request, res: Response, next: NextFunction): void {
  const userId = (req as AuthRequest).user?.userId;
  if (!userId) {
    // `authenticate` should have rejected already; defensive 401 here instead
    // of running the rate limiter with a shared anonymous bucket (which would
    // itself be a DoS vector).
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const bucketKey = `search:rate:${userId}:${currentWindow()}`;
  void (async () => {
    try {
      const count = await incrWithTtl(bucketKey, WINDOW_SECONDS);
      if (count === null) {
        // Redis unavailable — fail open. Log once per request so ops can
        // correlate a sustained bypass window with Redis health metrics.
        console.warn('search.rate-limit: Redis unavailable, bypassing limit for user', userId);
        next();
        return;
      }
      if (count > MAX_REQUESTS_PER_WINDOW) {
        res.setHeader('Retry-After', String(WINDOW_SECONDS));
        res.status(429).json({
          error: 'RATE_LIMIT_EXCEEDED',
          message: `Search is limited to ${MAX_REQUESTS_PER_WINDOW} requests per minute.`,
          retryAfterSeconds: WINDOW_SECONDS,
        });
        return;
      }
      next();
    } catch (err) {
      next(err);
    }
  })();
}

/** Unix minute bucket — rolls over every 60s in lock-step with the TTL. */
function currentWindow(): number {
  return Math.floor(Date.now() / (WINDOW_SECONDS * 1000));
}
