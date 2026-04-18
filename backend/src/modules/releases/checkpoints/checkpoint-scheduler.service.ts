// TTMP-160 PR-4: cron scheduler for periodic checkpoint recomputation.
//
// Two cron expressions are configured through env (§12.7):
//   - CHECKPOINTS_SCHEDULER_CRON (default `*/10 * * * *`) — recompute active releases.
//   - BURNDOWN_SNAPSHOT_CRON (default `5 0 * * *`)         — placeholder; impl lands in PR-10.
//
// In `NODE_ENV === 'test'` the schedule is not registered — tests drive ticks directly
// via `runOnce('checkpoints')` to stay deterministic.
//
// Idempotency across multi-instance deployments: `acquireLock('checkpoints:scheduler', 300)`
// at the start of a tick; a second instance that loses the race skips its tick.

import type { ScheduledTask } from 'node-cron';
import cron from 'node-cron';
import { config } from '../../../config.js';
import { acquireLock, releaseLock } from '../../../shared/redis.js';
import { prisma } from '../../../prisma/client.js';
import { loadEvaluationIssuesForRelease } from './evaluation-loader.service.js';
import { recomputeForRelease } from './release-checkpoints.service.js';

const SCHEDULER_LOCK_KEY = 'checkpoints:scheduler';
// TTL comfortably above the worst-case tick time. Default cron cadence is 600 s; setting
// 540 s (90 %) leaves a grace window but prevents two instances from overlapping on a slow
// tick. When per-release latency improves (PR-5+), we can drop this back toward 300 s.
const SCHEDULER_LOCK_TTL_S = 540;

type JobName = 'checkpoints' | 'burndown-snapshot';

// Module-level mutable state. Hot-reload in tests (`vi.resetModules()`) would reset these
// without stopping prior tasks; acceptable because tests gate on `NODE_ENV === 'test'` and
// the prod lifecycle is singleton.
let tasks: ScheduledTask[] = [];
let runningTick: Promise<unknown> | null = null;

export function startCheckpointScheduler(): void {
  if (!config.CHECKPOINTS_SCHEDULER_ENABLED) return;
  if (config.NODE_ENV === 'test') return;
  if (tasks.length > 0) return;

  const checkpointsTask = cron.schedule(config.CHECKPOINTS_SCHEDULER_CRON, () => {
    runningTick = tickCheckpoints().finally(() => {
      runningTick = null;
    });
  });
  tasks.push(checkpointsTask);

  // PR-10 will add: cron.schedule(config.BURNDOWN_SNAPSHOT_CRON, () => void tickBurndownSnapshot());
}

/**
 * Stop cron timers and await any in-flight tick so SIGTERM drains cleanly. The caller in
 * server.ts should await this before calling `server.close` / `process.exit`.
 */
export async function stopCheckpointScheduler(): Promise<void> {
  for (const t of tasks) t.stop();
  tasks = [];
  if (runningTick) {
    try {
      await runningTick;
    } catch {
      // tick failures are already logged inside tickCheckpoints
    }
  }
}

/**
 * Run a single tick synchronously — used by integration tests to exercise the scheduler
 * without waiting for cron. Returns stats so tests can assert on iteration counts.
 */
export async function runOnce(job: JobName): Promise<{ processedReleases: number; skippedByLock: boolean }> {
  switch (job) {
    case 'checkpoints':
      return tickCheckpoints();
    case 'burndown-snapshot':
      return { processedReleases: 0, skippedByLock: false };
  }
}

async function tickCheckpoints(): Promise<{ processedReleases: number; skippedByLock: boolean }> {
  const token = await acquireLock(SCHEDULER_LOCK_KEY, SCHEDULER_LOCK_TTL_S);
  if (!token) {
    // Another instance owns the lock — skip this tick. Distributed no-op.
    return { processedReleases: 0, skippedByLock: true };
  }

  try {
    const windowMs = config.CHECKPOINTS_EVAL_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    const now = new Date();
    const from = new Date(now.getTime() - windowMs);
    const to = new Date(now.getTime() + windowMs);

    const releases = await prisma.release.findMany({
      where: {
        plannedDate: { gte: from, lte: to },
        status: { category: { in: ['PLANNING', 'IN_PROGRESS'] } },
      },
      select: { id: true },
      take: 500,
    });

    let processed = 0;
    // Sequential per-release so the main event loop isn't blocked long — recomputeForRelease
    // itself loads + writes per row. §2 of nonfunctional reqs: tick ≤100ms continuous.
    for (const rel of releases) {
      try {
        const loaded = await loadEvaluationIssuesForRelease(rel.id);
        await recomputeForRelease(rel.id, loaded);
        processed += 1;
      } catch (err) {
        console.error(`[checkpoints] scheduler: recompute for release ${rel.id} failed`, err);
      }
    }

    return { processedReleases: processed, skippedByLock: false };
  } finally {
    await releaseLock(SCHEDULER_LOCK_KEY, token);
  }
}
