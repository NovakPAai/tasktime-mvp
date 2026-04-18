// TTMP-160 PR-4: event-hook entry points for code that mutates issues/releases/custom fields.
// Hooks call `scheduleRecomputeForIssue(issueId)` or `scheduleRecomputeForRelease(releaseId)`
// which coalesce into the per-request AsyncLocalStorage context. At `res.on('finish')` the
// middleware flushes the pending set — one recompute per release, no matter how many
// individual issue mutations happened inside the request.

import { prisma } from '../../../prisma/client.js';
import {
  getCheckpointContext,
  setCheckpointFlushFn,
} from '../../../shared/middleware/request-context.js';
import { loadEvaluationIssuesForRelease } from './evaluation-loader.service.js';
import { recomputeForRelease } from './release-checkpoints.service.js';

/**
 * Queue a recompute triggered by a change to a single issue. If a request context is active
 * we defer; otherwise (e.g. unit tests or cron) we recompute synchronously. Safe to call
 * from within a transaction — the recompute runs post-finish.
 */
export async function scheduleRecomputeForIssue(issueId: string): Promise<void> {
  const ctx = getCheckpointContext();
  if (ctx) {
    ctx.pendingIssueIds.add(issueId);
    return;
  }
  await recomputeForIssueSync(issueId);
}

export async function scheduleRecomputeForIssues(issueIds: string[]): Promise<void> {
  if (issueIds.length === 0) return;
  const ctx = getCheckpointContext();
  if (ctx) {
    for (const id of issueIds) ctx.pendingIssueIds.add(id);
    return;
  }
  // Non-HTTP caller (tests, seed, CLI). Dedup issue → release set to avoid N recomputes.
  const releaseIds = new Set<string>();
  for (const issueId of issueIds) {
    const ids = await resolveReleaseIdsForIssue(issueId);
    for (const id of ids) releaseIds.add(id);
  }
  for (const releaseId of releaseIds) {
    try {
      await recomputeForRelease(releaseId);
    } catch (err) {
      console.error(`[checkpoints] recompute for release ${releaseId} failed`, err);
    }
  }
}

export async function scheduleRecomputeForRelease(releaseId: string): Promise<void> {
  const ctx = getCheckpointContext();
  if (ctx) {
    ctx.pendingReleaseIds.add(releaseId);
    return;
  }
  await recomputeForRelease(releaseId);
}

/**
 * Immediate recompute path — resolves all releases that contain the given issue (via
 * ReleaseItem join OR legacy `Issue.releaseId`) and runs `recomputeForRelease` for each.
 * Errors are swallowed per release so one bad release doesn't block the rest.
 */
async function recomputeForIssueSync(issueId: string): Promise<void> {
  const releaseIds = await resolveReleaseIdsForIssue(issueId);
  for (const releaseId of releaseIds) {
    try {
      await recomputeForRelease(releaseId);
    } catch (err) {
      console.error(`[checkpoints] recompute for release ${releaseId} failed`, err);
    }
  }
}

async function resolveReleaseIdsForIssue(issueId: string): Promise<string[]> {
  const issue = await prisma.issue.findUnique({
    where: { id: issueId },
    select: {
      releaseId: true,
      releaseItems: { select: { releaseId: true } },
    },
  });
  if (!issue) return [];
  const ids = new Set<string>();
  if (issue.releaseId) ids.add(issue.releaseId);
  for (const ri of issue.releaseItems) ids.add(ri.releaseId);
  return [...ids];
}

// ─── Flush at request end ────────────────────────────────────────────────────

setCheckpointFlushFn(async (ctx) => {
  // Merge issueId → releaseId so we recompute each release exactly once.
  const releaseIds = new Set<string>(ctx.pendingReleaseIds);

  for (const issueId of ctx.pendingIssueIds) {
    const ids = await resolveReleaseIdsForIssue(issueId);
    for (const id of ids) releaseIds.add(id);
  }

  // Load + recompute each release in parallel. Preload once and pass through to avoid the
  // double batch-load inside apply/add flows (see release-checkpoints.service).
  await Promise.all(
    [...releaseIds].map(async (releaseId) => {
      try {
        const loaded = await loadEvaluationIssuesForRelease(releaseId);
        await recomputeForRelease(releaseId, loaded);
      } catch (err) {
        console.error(`[checkpoints] flush recompute for release ${releaseId} failed`, err);
      }
    }),
  );
});
