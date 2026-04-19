// TTMP-160 PR-4 + PR-10: cron scheduler for checkpoint recompute + burndown snapshots.
//
// Three cron expressions are configured through env (§12.7):
//   - CHECKPOINTS_SCHEDULER_CRON (default `*/10 * * * *`) — recompute active releases.
//   - BURNDOWN_SNAPSHOT_CRON     (default `5 0 * * *`)    — daily burndown snapshot.
//   - BURNDOWN_RETENTION_CRON    (default `0 3 * * 0`)    — weekly retention purge.
//
// In `NODE_ENV === 'test'` the schedule is not registered — tests drive ticks directly
// via `runOnce('checkpoints')` / `runOnce('burndown-snapshot')` to stay deterministic.
//
// Idempotency across multi-instance deployments: each tick acquires a dedicated Redis lock
// before doing work; a second instance that loses the race reports `skippedByLock: true`.

import type { ScheduledTask } from 'node-cron';
import cron from 'node-cron';
import { config } from '../../../config.js';
import { acquireLock, releaseLock } from '../../../shared/redis.js';
import { prisma } from '../../../prisma/client.js';
import { loadEvaluationIssuesForRelease } from './evaluation-loader.service.js';
import { recomputeForRelease } from './release-checkpoints.service.js';
import { captureSnapshot, purgeOldSnapshots } from './burndown.service.js';

const SCHEDULER_LOCK_KEY = 'checkpoints:scheduler';
const BURNDOWN_SNAPSHOT_LOCK_KEY = 'burndown:snapshot:lock';
const BURNDOWN_RETENTION_LOCK_KEY = 'burndown:retention:lock';
// TTL comfortably above the worst-case tick time. Default cron cadence is 600 s; setting
// 540 s (90 %) leaves a grace window but prevents two instances from overlapping on a slow
// tick. When per-release latency improves (PR-5+), we can drop this back toward 300 s.
const SCHEDULER_LOCK_TTL_S = 540;
const BURNDOWN_LOCK_TTL_S = 600;

// Window for "active or recently released" releases — spec §12.3: active + releaseDate ≥ now − 90d.
const BURNDOWN_RECENT_RELEASE_DAYS = 90;

type JobName = 'checkpoints' | 'burndown-snapshot' | 'burndown-retention';

// Module-level mutable state. Hot-reload in tests (`vi.resetModules()`) would reset these
// without stopping prior tasks; acceptable because tests gate on `NODE_ENV === 'test'` and
// the prod lifecycle is singleton.
let tasks: ScheduledTask[] = [];
// Tracks every in-flight tick across all three jobs so SIGTERM drains them all. A single
// mutable variable would be clobbered when a second cron fires while the first is still
// running (checkpoints every 10m + burndown nightly + retention weekly can overlap).
const runningTicks: Set<Promise<unknown>> = new Set();

export function startCheckpointScheduler(): void {
  if (!config.CHECKPOINTS_SCHEDULER_ENABLED) return;
  if (config.NODE_ENV === 'test') return;
  if (tasks.length > 0) return;

  const checkpointsTask = cron.schedule(config.CHECKPOINTS_SCHEDULER_CRON, () => {
    trackTick(tickCheckpoints());
  });
  tasks.push(checkpointsTask);

  const burndownSnapshotTask = cron.schedule(config.BURNDOWN_SNAPSHOT_CRON, () => {
    trackTick(tickBurndownSnapshot());
  });
  tasks.push(burndownSnapshotTask);

  const burndownRetentionTask = cron.schedule(config.BURNDOWN_RETENTION_CRON, () => {
    trackTick(tickBurndownRetention());
  });
  tasks.push(burndownRetentionTask);
}

function trackTick(p: Promise<unknown>): void {
  runningTicks.add(p);
  p.finally(() => {
    runningTicks.delete(p);
  });
}

/**
 * Stop cron timers and await any in-flight tick so SIGTERM drains cleanly. The caller in
 * server.ts should await this before calling `server.close` / `process.exit`.
 */
export async function stopCheckpointScheduler(): Promise<void> {
  for (const t of tasks) t.stop();
  tasks = [];
  if (runningTicks.size > 0) {
    // allSettled so one hung tick never wedges the drain; individual tick failures are
    // already logged inside the per-tick handlers.
    await Promise.allSettled([...runningTicks]);
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
      return tickBurndownSnapshot();
    case 'burndown-retention':
      return tickBurndownRetention();
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

async function tickBurndownSnapshot(): Promise<{ processedReleases: number; skippedByLock: boolean }> {
  const token = await acquireLock(BURNDOWN_SNAPSHOT_LOCK_KEY, BURNDOWN_LOCK_TTL_S);
  if (!token) return { processedReleases: 0, skippedByLock: true };

  try {
    const now = new Date();
    const recentCutoff = new Date(
      now.getTime() - BURNDOWN_RECENT_RELEASE_DAYS * 24 * 60 * 60 * 1000,
    );

    // Active releases (PLANNING / IN_PROGRESS) — snapshot so the chart keeps moving.
    // Recently released DONE/CANCELLED (≤ 90 days) — snapshot so the tail stays fresh.
    const releases = await prisma.release.findMany({
      where: {
        OR: [
          { status: { category: { in: ['PLANNING', 'IN_PROGRESS'] } } },
          {
            AND: [
              { status: { category: { in: ['DONE', 'CANCELLED'] } } },
              { releaseDate: { gte: recentCutoff } },
            ],
          },
        ],
      },
      select: { id: true },
      take: 1000,
    });

    let processed = 0;
    for (const rel of releases) {
      try {
        await captureSnapshot(rel.id);
        processed += 1;
      } catch (err) {
        console.error(`[burndown] scheduler: captureSnapshot for release ${rel.id} failed`, err);
      }
    }
    return { processedReleases: processed, skippedByLock: false };
  } finally {
    await releaseLock(BURNDOWN_SNAPSHOT_LOCK_KEY, token);
  }
}

async function tickBurndownRetention(): Promise<{ processedReleases: number; skippedByLock: boolean }> {
  const token = await acquireLock(BURNDOWN_RETENTION_LOCK_KEY, BURNDOWN_LOCK_TTL_S);
  if (!token) return { processedReleases: 0, skippedByLock: true };

  try {
    const { deleted } = await purgeOldSnapshots();
    // `processedReleases` is overloaded here as "rows purged" — not ideal, but the shared
    // return shape keeps the runOnce() type simple and tests assert on `skippedByLock`.
    return { processedReleases: deleted, skippedByLock: false };
  } catch (err) {
    console.error('[burndown] scheduler: retention purge failed', err);
    return { processedReleases: 0, skippedByLock: false };
  } finally {
    await releaseLock(BURNDOWN_RETENTION_LOCK_KEY, token);
  }
}
