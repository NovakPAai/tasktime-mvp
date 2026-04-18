// TTMP-160 PR-4: per-request context using AsyncLocalStorage.
//
// Why: event hooks (PR-4) triggered inside deep service calls need to coalesce repeated
// recomputes of the same release within a single HTTP request. A bulk-update of 50 issues
// on one release must not fan out to 50 recomputes — it must schedule exactly one at the end
// of the request (§12.9, "простой вариант"). AsyncLocalStorage lets us do this without
// threading an `options` parameter through every service boundary.

import { AsyncLocalStorage } from 'node:async_hooks';
import type { NextFunction, Request, Response } from 'express';

interface CheckpointRequestContext {
  pendingReleaseIds: Set<string>;
  pendingIssueIds: Set<string>;
}

export type CheckpointFlushFn = (ctx: CheckpointRequestContext) => Promise<void>;

let flushFn: CheckpointFlushFn | null = null;

/**
 * Register the flush callback that will drain the context at request end. The
 * checkpoint-triggers service registers itself during module init — keeping the
 * middleware independent of the triggers module avoids a circular import.
 */
export function setCheckpointFlushFn(fn: CheckpointFlushFn): void {
  flushFn = fn;
}

const storage = new AsyncLocalStorage<CheckpointRequestContext>();

export function checkpointContextMiddleware(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  const ctx: CheckpointRequestContext = {
    pendingReleaseIds: new Set(),
    pendingIssueIds: new Set(),
  };

  // `finish` fires after the response body is fully flushed, so recomputes run *after*
  // the user's HTTP response returns — matches spec §12.9: "после коммита транзакции".
  // Errors in recompute must not surface to the client; log and swallow.
  res.on('finish', () => {
    if (!flushFn) return;
    if (ctx.pendingReleaseIds.size === 0 && ctx.pendingIssueIds.size === 0) return;
    flushFn(ctx).catch((err) => {
      console.error('[checkpoints] post-request recompute failed', err);
    });
  });

  storage.run(ctx, () => next());
}

/**
 * Returns the active context, or undefined outside an HTTP request (cron ticks / bootstrap
 * scripts — those call `recomputeForRelease` directly without coalescing).
 */
export function getCheckpointContext(): CheckpointRequestContext | undefined {
  return storage.getStore();
}
