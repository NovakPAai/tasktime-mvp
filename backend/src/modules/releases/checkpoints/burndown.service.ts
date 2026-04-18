// TTMP-160 PR-10: burndown snapshots + query service.
//
// Responsibilities (spec §11/§12.4):
//   - captureSnapshot(releaseId[, date]) — aggregate release state into one row in
//     `release_burndown_snapshots`, upsert by (releaseId, snapshotDate).
//   - getBurndown(releaseId, { metric, from, to }) — series + idealLine + initial.
//   - backfillSnapshot(releaseId, date?) — sync capture for FR-31 (ADMIN/SUPER_ADMIN).
//   - purgeOldSnapshots() — FR-32 retention (drop snapshots older than
//     BURNDOWN_RETENTION_DAYS_AFTER_DONE for DONE/CANCELLED releases).
//
// Ideal-line formula (spec §12.4):
//   initial = snapshots[0]; start = initial.snapshotDate; end = release.plannedDate
//   start_value = metric-specific
//   for day in [start .. end]: value = start_value * (1 − progress)
//
// Caching: `burndown:{releaseId}:{metric}:{from}:{to}` TTL 300s.
// Invalidated by `invalidateBurndownCache(releaseId)` (called on capture + after
// recompute changes `violatedCheckpoints`).
//
// Numeric columns use `Decimal(8,2)` — we normalise via Number() on read and toFixed(2)
// on write so the Prisma driver never trips on strings.

import type { Prisma, ReleaseBurndownSnapshot } from '@prisma/client';
import { prisma } from '../../../prisma/client.js';
import { config } from '../../../config.js';
import { AppError } from '../../../shared/middleware/error-handler.js';
import {
  delCacheByPrefix,
  getCachedJson,
  setCachedJson,
} from '../../../shared/redis.js';

export type BurndownMetric = 'issues' | 'hours' | 'violations';

export interface BurndownPoint {
  date: string;
  total: number;
  done: number;
  open: number;
  cancelled: number;
  totalEstimatedHours: number;
  doneEstimatedHours: number;
  openEstimatedHours: number;
  violatedCheckpoints: number;
  totalCheckpoints: number;
}

export interface IdealPoint {
  date: string;
  value: number;
}

export interface BurndownResponse {
  releaseId: string;
  metric: BurndownMetric;
  plannedDate: string | null;
  releaseDate: string | null;
  initial: BurndownPoint | null;
  series: BurndownPoint[];
  idealLine: IdealPoint[];
}

// ─── Capture ─────────────────────────────────────────────────────────────────

/**
 * Capture a snapshot of the release's burndown metrics for the given date (UTC day).
 * Upserts on (releaseId, snapshotDate) so the daily cron and manual backfills converge
 * on one row per day. Side effect: invalidates the burndown cache for this release.
 *
 * `date` defaults to today (UTC midnight). Pass an explicit Date to re-write history
 * (only called from backfillSnapshot / tests).
 */
export async function captureSnapshot(
  releaseId: string,
  date: Date = todayUtc(),
  tx: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<ReleaseBurndownSnapshot> {
  const snapshotDate = startOfUtcDay(date);

  const release = await tx.release.findUnique({
    where: { id: releaseId },
    select: { id: true },
  });
  if (!release) throw new AppError(404, 'Релиз не найден');

  // One round-trip per entity class. All issues currently in the release via ReleaseItem.
  // We intentionally ignore the legacy `Issue.releaseId` field — new code uses ReleaseItem
  // as the authoritative membership (spec §11: "через ReleaseItem и/или Issue.releaseId"
  // but §12.3 aggregates SELECT FROM release_items which is what we mirror here).
  const issues = await tx.releaseItem.findMany({
    where: { releaseId },
    select: {
      issue: {
        select: {
          status: true,
          estimatedHours: true,
        },
      },
    },
  });

  let total = 0;
  let done = 0;
  let cancelled = 0;
  let totalHours = 0;
  let doneHours = 0;
  // `cancelledHours` is computed but intentionally not persisted: the schema stores only
  // total/done/open hours (§12.3). `openHours = total − done − cancelledHours` keeps
  // "open" honest for cancelled estimated work without adding a column the UI doesn't use.
  let cancelledHours = 0;
  for (const { issue } of issues) {
    const hours = issue.estimatedHours ? Number(issue.estimatedHours) : 0;
    total += 1;
    totalHours += hours;
    if (issue.status === 'DONE') {
      done += 1;
      doneHours += hours;
    } else if (issue.status === 'CANCELLED') {
      cancelled += 1;
      cancelledHours += hours;
    }
  }
  const open = total - done - cancelled;
  const openHours = Math.max(0, totalHours - doneHours - cancelledHours);

  const checkpoints = await tx.releaseCheckpoint.findMany({
    where: { releaseId },
    select: { state: true },
  });
  const totalCheckpoints = checkpoints.length;
  const violatedCheckpoints = checkpoints.filter((c) => c.state === 'VIOLATED').length;

  const snapshot = await tx.releaseBurndownSnapshot.upsert({
    where: {
      releaseId_snapshotDate: { releaseId, snapshotDate },
    },
    create: {
      releaseId,
      snapshotDate,
      totalIssues: total,
      doneIssues: done,
      openIssues: open,
      cancelledIssues: cancelled,
      totalEstimatedHours: totalHours.toFixed(2),
      doneEstimatedHours: doneHours.toFixed(2),
      openEstimatedHours: openHours.toFixed(2),
      violatedCheckpoints,
      totalCheckpoints,
    },
    update: {
      totalIssues: total,
      doneIssues: done,
      openIssues: open,
      cancelledIssues: cancelled,
      totalEstimatedHours: totalHours.toFixed(2),
      doneEstimatedHours: doneHours.toFixed(2),
      openEstimatedHours: openHours.toFixed(2),
      violatedCheckpoints,
      totalCheckpoints,
      // capturedAt is updated automatically via `@default(now())` only on create —
      // for update we explicitly bump it so callers can tell fresh captures apart.
      capturedAt: new Date(),
    },
  });

  await invalidateBurndownCache(releaseId);
  return snapshot;
}

export async function backfillSnapshot(
  releaseId: string,
  date?: Date,
): Promise<ReleaseBurndownSnapshot> {
  return captureSnapshot(releaseId, date);
}

// ─── Query ───────────────────────────────────────────────────────────────────

export interface GetBurndownOptions {
  metric?: BurndownMetric;
  from?: string;
  to?: string;
}

export async function getBurndown(
  releaseId: string,
  opts: GetBurndownOptions = {},
): Promise<BurndownResponse> {
  const metric: BurndownMetric = opts.metric ?? 'issues';
  const cacheKey = `burndown:${releaseId}:${metric}:${opts.from ?? ''}:${opts.to ?? ''}`;
  const cached = await getCachedJson<BurndownResponse>(cacheKey);
  if (cached) return cached;

  const release = await prisma.release.findUnique({
    where: { id: releaseId },
    select: { id: true, plannedDate: true, releaseDate: true },
  });
  if (!release) throw new AppError(404, 'Релиз не найден');

  const whereRange: Prisma.ReleaseBurndownSnapshotWhereInput = { releaseId };
  if (opts.from) whereRange.snapshotDate = { gte: parseYmd(opts.from, 'from') };
  if (opts.to) {
    whereRange.snapshotDate = {
      ...(whereRange.snapshotDate as Prisma.DateTimeFilter | undefined),
      lte: parseYmd(opts.to, 'to'),
    };
  }

  const rows = await prisma.releaseBurndownSnapshot.findMany({
    where: whereRange,
    orderBy: { snapshotDate: 'asc' },
  });

  // Initial always comes from the *earliest* snapshot for the release (not necessarily
  // within the query range). This mirrors spec §12.4: ideal-line baseline is the first
  // ever recorded state, so filtering by `from` shouldn't move the anchor.
  const initialRow =
    rows.length > 0 && !opts.from
      ? rows[0]!
      : await prisma.releaseBurndownSnapshot.findFirst({
          where: { releaseId },
          orderBy: { snapshotDate: 'asc' },
        });

  const series = rows.map(toPoint);
  const initial = initialRow ? toPoint(initialRow) : null;
  const idealLine = initial && release.plannedDate
    ? buildIdealLine(initial, release.plannedDate, metric)
    : [];

  const response: BurndownResponse = {
    releaseId,
    metric,
    plannedDate: release.plannedDate ? ymd(release.plannedDate) : null,
    releaseDate: release.releaseDate ? ymd(release.releaseDate) : null,
    initial,
    series,
    idealLine,
  };

  await setCachedJson(cacheKey, response, 300);
  return response;
}

// ─── Retention ───────────────────────────────────────────────────────────────

/**
 * FR-32: drop daily snapshots for releases whose status category is DONE/CANCELLED
 * and whose last activity is older than BURNDOWN_RETENTION_DAYS_AFTER_DONE. We keep
 * the most recent snapshot per retired release (so the UI can still render the last
 * point without a backfill).
 */
export async function purgeOldSnapshots(): Promise<{ deleted: number; aggregated: number }> {
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - config.BURNDOWN_RETENTION_DAYS_AFTER_DONE);
  const cutoffDay = startOfUtcDay(cutoff);

  const doneReleases = await prisma.release.findMany({
    where: {
      status: { category: { in: ['DONE', 'CANCELLED'] } },
      OR: [
        { releaseDate: { lte: cutoffDay } },
        // releaseDate can be null for cancelled releases — fall back to updatedAt.
        { releaseDate: null, updatedAt: { lte: cutoffDay } },
      ],
    },
    select: { id: true },
    take: 1000,
  });
  if (doneReleases.length === 0) return { deleted: 0, aggregated: 0 };

  let deletedTotal = 0;
  for (const rel of doneReleases) {
    // Keep the newest snapshot per release so the UI has an anchor point. `findFirst`
    // and `deleteMany` must run in one transaction — otherwise a concurrent
    // captureSnapshot (cron or backfill) could insert a newer row between the two
    // statements, and the deleteMany would silently erase that just-captured row.
    const count = await prisma.$transaction(async (tx) => {
      const keep = await tx.releaseBurndownSnapshot.findFirst({
        where: { releaseId: rel.id },
        orderBy: { snapshotDate: 'desc' },
        select: { id: true },
      });
      const result = await tx.releaseBurndownSnapshot.deleteMany({
        where: {
          releaseId: rel.id,
          ...(keep ? { NOT: { id: keep.id } } : {}),
        },
      });
      return result.count;
    });
    deletedTotal += count;
    if (count > 0) await invalidateBurndownCache(rel.id);
  }
  // Weekly aggregation (BURNDOWN_WEEKLY_AGG_AFTER_DAYS) is reserved for a follow-up — the
  // dataset is small enough today that simple retention covers FR-32.
  return { deleted: deletedTotal, aggregated: 0 };
}

// ─── Cache ───────────────────────────────────────────────────────────────────

export async function invalidateBurndownCache(releaseId: string): Promise<void> {
  await delCacheByPrefix(`burndown:${releaseId}:`);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function todayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseYmd(s: string, field: 'from' | 'to'): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    throw new AppError(400, `Некорректная дата в параметре ${field}: ожидается YYYY-MM-DD`);
  }
  return new Date(`${s}T00:00:00.000Z`);
}

function toPoint(row: ReleaseBurndownSnapshot): BurndownPoint {
  return {
    date: ymd(row.snapshotDate),
    total: row.totalIssues,
    done: row.doneIssues,
    open: row.openIssues,
    cancelled: row.cancelledIssues,
    totalEstimatedHours: Number(row.totalEstimatedHours),
    doneEstimatedHours: Number(row.doneEstimatedHours),
    openEstimatedHours: Number(row.openEstimatedHours),
    violatedCheckpoints: row.violatedCheckpoints,
    totalCheckpoints: row.totalCheckpoints,
  };
}

function buildIdealLine(
  initial: BurndownPoint,
  plannedDate: Date,
  metric: BurndownMetric,
): IdealPoint[] {
  const startDate = new Date(`${initial.date}T00:00:00.000Z`);
  const endDate = startOfUtcDay(plannedDate);
  // Overdue / degenerate range: planned date is already past the first snapshot.
  // Emit two points at the initial value — chart still renders, user sees a flat ideal
  // line that visually flags "we're past the deadline". A more elaborate projection
  // (extend ideal to today / releaseDate) is deferred until UX for overdue is specified.
  if (endDate.getTime() <= startDate.getTime()) {
    return [
      { date: initial.date, value: startValue(initial, metric) },
      { date: ymd(endDate), value: startValue(initial, metric) },
    ];
  }

  const startValueNum = startValue(initial, metric);
  const totalDays = Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000);
  const out: IdealPoint[] = [];
  for (let i = 0; i <= totalDays; i += 1) {
    const day = new Date(startDate.getTime() + i * 86_400_000);
    const progress = i / totalDays;
    const value = startValueNum * (1 - progress);
    out.push({ date: ymd(day), value: Math.round(value * 100) / 100 });
  }
  return out;
}

function startValue(p: BurndownPoint, metric: BurndownMetric): number {
  switch (metric) {
    case 'issues':
      return p.total - p.done - p.cancelled;
    case 'hours':
      return Math.round(p.openEstimatedHours * 100) / 100;
    case 'violations':
      return p.violatedCheckpoints;
  }
}
