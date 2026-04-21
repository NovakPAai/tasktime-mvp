// TTMP-160 PR-3: release-binding service.
//
// Responsibilities:
//   - apply-template / add-by-typeIds with FR-15 criteriaSnapshot + offsetDaysSnapshot copy
//   - preview-template dry-run (FR-14)
//   - recomputeForRelease: pure engine → diff against stored hash → persist if changed
//   - CheckpointViolationEvent lifecycle: open on new violations, close on resolution
//   - list with breakdown / passedIssues / violatedIssues (FR-25, FR-27)
//   - sync-instances propagation (FR-15 opt-in)
//   - Redis cache invalidation for the per-release checkpoint list

import type { Prisma, ReleaseCheckpoint, CheckpointType } from '@prisma/client';
import { prisma } from '../../../prisma/client.js';
import { AppError } from '../../../shared/middleware/error-handler.js';
import { delCachedJson, getCachedJson, setCachedJson } from '../../../shared/redis.js';
import { invalidateBurndownCache } from './burndown.service.js';
import type {
  CheckpointBreakdown,
  CheckpointCriterion,
  CheckpointViolation,
  ReleaseRisk,
} from './checkpoint.types.js';
import { computeReleaseRisk, evaluateCheckpoint } from './checkpoint-engine.service.js';
import type { LoadedRelease } from './evaluation-loader.service.js';
import { loadEvaluationIssuesForRelease } from './evaluation-loader.service.js';
import { notifyViolation } from './webhook-notifier.service.js';

const CACHE_TTL_SECONDS = 60;
const cacheKey = (releaseId: string) => `release:${releaseId}:checkpoints`;

// ─── Response shapes ─────────────────────────────────────────────────────────

export interface EvaluatedCheckpointResponse {
  id: string;
  releaseId: string;
  checkpointType: {
    id: string;
    name: string;
    color: string;
    weight: CheckpointType['weight'];
  };
  deadline: string;
  state: ReleaseCheckpoint['state'];
  isWarning: boolean;
  breakdown: CheckpointBreakdown;
  passedIssues: Array<{ issueId: string; issueKey: string; issueTitle: string }>;
  violatedIssues: CheckpointViolation[];
  lastEvaluatedAt: string | null;
  offsetDaysSnapshot: number;
}

export interface ReleaseCheckpointsResponse {
  releaseId: string;
  risk: ReleaseRisk;
  checkpoints: EvaluatedCheckpointResponse[];
}

export interface CheckpointPreviewItem {
  checkpointTypeId: string;
  name: string;
  color: string;
  weight: CheckpointType['weight'];
  offsetDaysSnapshot: number;
  deadline: string;
  wouldBeState: ReleaseCheckpoint['state'];
  breakdown: CheckpointBreakdown;
  violations: CheckpointViolation[];
}

// ─── Loaders ─────────────────────────────────────────────────────────────────

export async function listForRelease(releaseId: string): Promise<ReleaseCheckpointsResponse> {
  const cached = await getCachedJson<ReleaseCheckpointsResponse>(cacheKey(releaseId));
  if (cached) return cached;

  const release = await prisma.release.findUnique({
    where: { id: releaseId },
    select: { id: true },
  });
  if (!release) throw new AppError(404, 'Релиз не найден');

  const rows = await prisma.releaseCheckpoint.findMany({
    where: { releaseId },
    include: { checkpointType: true },
    orderBy: { deadline: 'asc' },
  });

  const passedIds = new Set<string>();
  for (const rc of rows) {
    for (const id of parseStringIdArray(rc.passedIssueIds)) passedIds.add(id);
  }

  const passedIssueIndex = await fetchIssueIndex([...passedIds]);

  const checkpoints: EvaluatedCheckpointResponse[] = rows.map((rc) => {
    const passedIdsForRow = parseStringIdArray(rc.passedIssueIds);
    const applicableIds = parseStringIdArray(rc.applicableIssueIds);
    const violations = parseViolations(rc.violations);
    const isWarning = computeListIsWarning(rc, violations.length, rc.checkpointType.warningDays);

    return {
      id: rc.id,
      releaseId: rc.releaseId,
      checkpointType: {
        id: rc.checkpointType.id,
        name: rc.checkpointType.name,
        color: rc.checkpointType.color,
        weight: rc.checkpointType.weight,
      },
      deadline: toISODate(rc.deadline),
      state: rc.state,
      isWarning,
      breakdown: {
        applicable: applicableIds.length,
        passed: passedIdsForRow.length,
        violated: violations.length,
      },
      passedIssues: passedIdsForRow
        .map((id) => passedIssueIndex.get(id))
        .filter((x): x is { issueId: string; issueKey: string; issueTitle: string } => x != null),
      // NOTE: `violatedIssues` titles come from the snapshotted `violations` JSON — they
      // reflect the last recompute, not the live DB. If a user renames a violating issue,
      // the display title drifts until the next recompute. PR-6 surfaces this via relative
      // timestamps on `lastEvaluatedAt`.
      violatedIssues: violations,
      lastEvaluatedAt: rc.lastEvaluatedAt ? rc.lastEvaluatedAt.toISOString() : null,
      offsetDaysSnapshot: rc.offsetDaysSnapshot,
    };
  });

  const risk = computeReleaseRisk(
    rows.map((rc) => ({ weight: rc.checkpointType.weight, state: rc.state })),
  );

  const response: ReleaseCheckpointsResponse = { releaseId, risk, checkpoints };
  await setCachedJson(cacheKey(releaseId), response, CACHE_TTL_SECONDS);
  return response;
}

// ─── Apply / Add ─────────────────────────────────────────────────────────────

export async function applyTemplate(releaseId: string, templateId: string): Promise<ReleaseCheckpointsResponse> {
  const release = await assertReleaseWithPlannedDate(releaseId);

  const template = await prisma.checkpointTemplate.findUnique({
    where: { id: templateId },
    include: { items: { include: { checkpointType: true } } },
  });
  if (!template) throw new AppError(404, 'Шаблон контрольных точек не найден');

  const typeRows = template.items.map((i) => i.checkpointType);
  await createCheckpointsFromTypes(releaseId, release.plannedDate, typeRows);
  // Preload once — immediate recompute after apply hits exactly the same data.
  const loaded = await loadEvaluationIssuesForRelease(releaseId);
  await recomputeForRelease(releaseId, loaded);
  return listForRelease(releaseId);
}

export async function addCheckpoints(releaseId: string, checkpointTypeIds: string[]): Promise<ReleaseCheckpointsResponse> {
  const release = await assertReleaseWithPlannedDate(releaseId);

  const types = await prisma.checkpointType.findMany({
    where: { id: { in: checkpointTypeIds } },
  });
  if (types.length !== checkpointTypeIds.length) {
    const foundIds = new Set(types.map((t) => t.id));
    const missing = checkpointTypeIds.filter((id) => !foundIds.has(id));
    throw new AppError(400, 'CHECKPOINT_TYPES_NOT_FOUND', { missingIds: missing });
  }

  await createCheckpointsFromTypes(releaseId, release.plannedDate, types);
  const loaded = await loadEvaluationIssuesForRelease(releaseId);
  await recomputeForRelease(releaseId, loaded);
  return listForRelease(releaseId);
}

export async function removeCheckpoint(releaseId: string, checkpointId: string): Promise<{ ok: true }> {
  const rc = await prisma.releaseCheckpoint.findUnique({ where: { id: checkpointId } });
  if (!rc || rc.releaseId !== releaseId) {
    throw new AppError(404, 'Контрольная точка не найдена');
  }

  // Close open violation events before the cascade so the event history reflects the
  // actual end-of-life timestamp, not a silent cascade delete (FR-22/FR-23 audit trail).
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.checkpointViolationEvent.updateMany({
      where: { releaseCheckpointId: checkpointId, resolvedAt: null },
      data: { resolvedAt: now },
    });
    await tx.releaseCheckpoint.delete({ where: { id: checkpointId } });
  });

  await invalidateReleaseCache(releaseId);
  return { ok: true };
}

// ─── Preview (FR-14) ─────────────────────────────────────────────────────────

export async function previewTemplate(releaseId: string, templateId: string): Promise<{ previews: CheckpointPreviewItem[] }> {
  const release = await assertReleaseWithPlannedDate(releaseId);

  const template = await prisma.checkpointTemplate.findUnique({
    where: { id: templateId },
    include: { items: { include: { checkpointType: true }, orderBy: { orderIndex: 'asc' } } },
  });
  if (!template) throw new AppError(404, 'Шаблон контрольных точек не найден');

  const loaded = await loadEvaluationIssuesForRelease(releaseId);
  const now = new Date();

  const previews: CheckpointPreviewItem[] = template.items.map((item) => {
    const type = item.checkpointType;
    const deadline = addDays(release.plannedDate, type.offsetDays);
    const criteria = type.criteria as unknown as CheckpointCriterion[];
    const result = evaluateCheckpoint(
      {
        criteria,
        deadline,
        warningDays: type.warningDays,
        issues: loaded.issues,
        context: loaded.context,
      },
      now,
    );
    return {
      checkpointTypeId: type.id,
      name: type.name,
      color: type.color,
      weight: type.weight,
      offsetDaysSnapshot: type.offsetDays,
      deadline: toISODate(deadline),
      wouldBeState: result.state,
      breakdown: result.breakdown,
      violations: result.violations,
    };
  });

  return { previews };
}

// ─── Recompute ───────────────────────────────────────────────────────────────

// Idempotent: re-running with identical data does not touch rows whose
// (state, violationsHash) pair is unchanged — matches FR-7 R-7 skip-writes.
//
// `preloaded` lets callers that already fetched the evaluation inputs (apply/add flows,
// PR-4 scheduler batching) avoid a duplicate batch-load. Defaults to a fresh load.
export async function recomputeForRelease(
  releaseId: string,
  preloaded?: LoadedRelease,
): Promise<{ updatedCount: number; unchangedCount: number }> {
  const existing = await prisma.releaseCheckpoint.findMany({
    where: { releaseId },
    include: { checkpointType: { select: { weight: true, warningDays: true } } },
  });
  if (existing.length === 0) {
    await invalidateReleaseCache(releaseId);
    return { updatedCount: 0, unchangedCount: 0 };
  }

  const loaded = preloaded ?? (await loadEvaluationIssuesForRelease(releaseId));
  const now = new Date();

  let updatedCount = 0;
  let unchangedCount = 0;

  for (const rc of existing) {
    const criteria = rc.criteriaSnapshot as unknown as CheckpointCriterion[];
    const result = evaluateCheckpoint(
      {
        criteria,
        deadline: rc.deadline,
        warningDays: rc.checkpointType.warningDays,
        issues: loaded.issues,
        context: loaded.context,
      },
      now,
    );

    const stateUnchanged = rc.state === result.state;
    const hashUnchanged = rc.violationsHash === result.violationsHash;
    if (stateUnchanged && hashUnchanged && rc.lastEvaluatedAt != null) {
      unchangedCount += 1;
      continue;
    }

    const priorState = rc.state;
    await prisma.$transaction(async (tx) => {
      await tx.releaseCheckpoint.update({
        where: { id: rc.id },
        data: {
          state: result.state,
          lastEvaluatedAt: now,
          applicableIssueIds: result.applicableIssueIds as unknown as Prisma.InputJsonValue,
          passedIssueIds: result.passedIssueIds as unknown as Prisma.InputJsonValue,
          violations: result.violations as unknown as Prisma.InputJsonValue,
          violationsHash: result.violationsHash,
        },
      });

      await reconcileViolationEvents(tx, rc.id, result.violations, now);
    });

    // FR-17: dispatch the webhook AFTER the transaction commits so downstream consumers
    // see a consistent state. The notifier itself handles debounce + error swallowing.
    void notifyViolation({
      releaseCheckpointId: rc.id,
      priorState,
      newState: result.state,
      checkpointTypeId: rc.checkpointTypeId,
    });

    updatedCount += 1;
  }

  await invalidateReleaseCache(releaseId);
  return { updatedCount, unchangedCount };
}

// ─── Sync-instances (FR-15) ──────────────────────────────────────────────────

export async function syncInstances(
  checkpointTypeId: string,
  releaseIds: string[],
): Promise<{ syncedCount: number }> {
  const type = await prisma.checkpointType.findUnique({ where: { id: checkpointTypeId } });
  if (!type) throw new AppError(404, 'Тип контрольной точки не найден');

  const targets = await prisma.releaseCheckpoint.findMany({
    where: { checkpointTypeId, releaseId: { in: releaseIds } },
    select: { id: true, releaseId: true, release: { select: { plannedDate: true } } },
  });

  await Promise.all(
    targets
      .filter((rc) => rc.release.plannedDate != null)
      .map((rc) =>
        prisma.releaseCheckpoint.update({
          where: { id: rc.id },
          data: {
            criteriaSnapshot: type.criteria as Prisma.InputJsonValue,
            offsetDaysSnapshot: type.offsetDays,
            // TTSRH-1 PR-15: propagate TTQL snapshot fields at sync time.
            // PR-16 evaluator reads these to decide STRUCTURED/TTQL/COMBINED path.
            ttqlSnapshot: type.ttqlCondition ?? null,
            conditionModeSnapshot: type.conditionMode,
            deadline: addDays(rc.release.plannedDate!, type.offsetDays),
          },
        }),
      ),
  );

  const touchedReleaseIds = [...new Set(targets.map((t) => t.releaseId))];
  await Promise.all(touchedReleaseIds.map((releaseId) => recomputeForRelease(releaseId)));

  return { syncedCount: targets.length };
}

// ─── Issue-scoped view ───────────────────────────────────────────────────────

export interface IssueCheckpointsGroup {
  releaseId: string;
  releaseName: string;
  checkpoints: EvaluatedCheckpointResponse[];
}

// Returns groups of checkpoints for every release containing the given issue.
// A checkpoint is only included if the issue is in its `applicableIssueIds`.
export async function listForIssue(issueId: string): Promise<IssueCheckpointsGroup[]> {
  const issue = await prisma.issue.findUnique({
    where: { id: issueId },
    select: {
      id: true,
      releaseItems: { select: { releaseId: true } },
      releaseId: true,
    },
  });
  if (!issue) throw new AppError(404, 'Задача не найдена');

  const releaseIds = new Set<string>();
  if (issue.releaseId) releaseIds.add(issue.releaseId);
  for (const item of issue.releaseItems) releaseIds.add(item.releaseId);
  if (releaseIds.size === 0) return [];

  const releases = await prisma.release.findMany({
    where: { id: { in: [...releaseIds] } },
    select: { id: true, name: true },
  });
  const releaseNameById = new Map(releases.map((r) => [r.id, r.name]));

  // A checkpoint "touches" the issue iff the issue is in passedIssues ∪ violatedIssues
  // (which by the engine's construction equals applicableIssueIds — FR-6).
  const allReleaseIds = [...releaseIds];
  const responses = await Promise.all(allReleaseIds.map((id) => listForRelease(id)));

  const groups: IssueCheckpointsGroup[] = [];
  for (let i = 0; i < allReleaseIds.length; i++) {
    const releaseId = allReleaseIds[i]!;
    const resp = responses[i]!;
    const touching = resp.checkpoints.filter((cp) => {
      const inPassed = cp.passedIssues.some((p) => p.issueId === issueId);
      const inViolated = cp.violatedIssues.some((v) => v.issueId === issueId);
      return inPassed || inViolated;
    });
    if (touching.length > 0) {
      groups.push({
        releaseId,
        releaseName: releaseNameById.get(releaseId) ?? '',
        checkpoints: touching,
      });
    }
  }
  return groups;
}

// ─── FR-22: issue's violation history ────────────────────────────────────────

export interface IssueCheckpointEvent {
  id: string;
  releaseCheckpointId: string;
  releaseId: string;
  issueId: string;
  issueKey: string;
  reason: string;
  criterionType: string;
  occurredAt: string;
  resolvedAt: string | null;
  checkpointName: string;
  releaseName: string;
}

/**
 * FR-22: issue's violation history. Ordered newest-first and capped at 200 rows — the
 * cap is a simple pagination ceiling; if a single issue accumulates more than 200 events
 * (unlikely in normal flow), we'd expose a cursor here. For MVP the 200-row horizon is
 * more than enough to surface recent activity on any issue.
 */
export async function listEventsForIssue(issueId: string): Promise<IssueCheckpointEvent[]> {
  const events = await prisma.checkpointViolationEvent.findMany({
    where: { issueId },
    orderBy: { occurredAt: 'desc' },
    include: {
      releaseCheckpoint: {
        select: {
          releaseId: true,
          checkpointType: { select: { name: true } },
          release: { select: { name: true } },
        },
      },
    },
    take: 200,
  });
  return events.map((e) => ({
    id: e.id,
    releaseCheckpointId: e.releaseCheckpointId,
    releaseId: e.releaseCheckpoint.releaseId,
    issueId: e.issueId,
    issueKey: e.issueKey,
    reason: e.reason,
    criterionType: e.criterionType,
    occurredAt: e.occurredAt.toISOString(),
    resolvedAt: e.resolvedAt ? e.resolvedAt.toISOString() : null,
    checkpointName: e.releaseCheckpoint.checkpointType.name,
    releaseName: e.releaseCheckpoint.release.name,
  }));
}

// ─── FR-26 / FR-27: release matrix (issues × checkpoints) ────────────────────

export type MatrixCellState = 'passed' | 'violated' | 'pending' | 'na';

export interface MatrixCell {
  state: MatrixCellState;
  reason?: string;
}

export interface CheckpointsMatrixResponse {
  releaseId: string;
  issues: Array<{ id: string; key: string; title: string }>;
  checkpoints: Array<{
    id: string;
    name: string;
    color: string;
    weight: string;
    deadline: string;
    state: ReleaseCheckpoint['state'];
  }>;
  // Row-major: cells[i][j] corresponds to issues[i] × checkpoints[j].
  cells: MatrixCell[][];
}

/**
 * Build the "Issues × Checkpoints" matrix for a release. Each cell is derived from the
 * snapshot stored on the release-checkpoint row — `applicableIssueIds`, `passedIssueIds`,
 * and the `violations` array. We do one extra DB read to fetch the issue titles and
 * project keys so rows render with human-readable labels.
 *
 * FR-26: `na` for issues that fall outside `applicableIssueIds` (e.g. checkpoint has an
 * `issueTypes` filter that excludes this issue's type). `passed` / `violated` / `pending`
 * strictly mirror the evaluator output.
 */
export async function buildCheckpointsMatrix(
  releaseId: string,
): Promise<CheckpointsMatrixResponse> {
  const release = await prisma.release.findUnique({
    where: { id: releaseId },
    select: { id: true },
  });
  if (!release) throw new AppError(404, 'Релиз не найден');

  const [checkpoints, items] = await Promise.all([
    prisma.releaseCheckpoint.findMany({
      where: { releaseId },
      include: { checkpointType: true },
      orderBy: { deadline: 'asc' },
    }),
    prisma.releaseItem.findMany({
      where: { releaseId },
      select: {
        issue: {
          select: {
            id: true,
            number: true,
            title: true,
            project: { select: { key: true } },
          },
        },
      },
    }),
  ]);

  const issues = items
    .map((i) => i.issue)
    .filter((i): i is NonNullable<typeof i> => i !== null)
    .map((i) => ({
      id: i.id,
      key: `${i.project.key}-${i.number}`,
      title: i.title,
    }))
    .sort((a, b) => a.key.localeCompare(b.key));

  const checkpointHeaders = checkpoints.map((cp) => ({
    id: cp.id,
    name: cp.checkpointType.name,
    color: cp.checkpointType.color,
    weight: cp.checkpointType.weight,
    deadline: cp.deadline.toISOString().slice(0, 10),
    state: cp.state,
  }));

  // Pre-index each checkpoint's three member lists for O(1) cell lookup.
  const indexed = checkpoints.map((cp) => {
    const applicable = new Set(parseStringIdArray(cp.applicableIssueIds));
    const passed = new Set(parseStringIdArray(cp.passedIssueIds));
    const violationsByIssue = new Map<string, string>();
    for (const v of parseViolations(cp.violations)) {
      if (v.issueId) violationsByIssue.set(v.issueId, v.reason);
    }
    return { applicable, passed, violationsByIssue };
  });

  const cells: MatrixCell[][] = issues.map((issue) =>
    indexed.map((entry): MatrixCell => {
      if (!entry.applicable.has(issue.id)) return { state: 'na' };
      if (entry.passed.has(issue.id)) return { state: 'passed' };
      const reason = entry.violationsByIssue.get(issue.id);
      if (reason !== undefined) return { state: 'violated', reason };
      return { state: 'pending' };
    }),
  );

  return { releaseId, issues, checkpoints: checkpointHeaders, cells };
}

/**
 * CSV export of the matrix (FR-26). First column is the issue key + title; subsequent
 * columns are one per checkpoint. Cell symbols: OK / VIOLATED / PENDING / —. We include
 * the violation `reason` as a parenthetical suffix when present so the CSV row is
 * self-contained.
 */
export function checkpointsMatrixToCsv(m: CheckpointsMatrixResponse): string {
  const escape = (s: string | null | undefined): string => {
    if (s === null || s === undefined) return '';
    return /[,"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const labelHeaders = ['issue_key', 'issue_title', ...m.checkpoints.map((cp) => cp.name)];
  const lines = [labelHeaders.map(escape).join(',')];

  for (let i = 0; i < m.issues.length; i++) {
    const issue = m.issues[i]!;
    const row: string[] = [issue.key, issue.title];
    for (let j = 0; j < m.checkpoints.length; j++) {
      const cell = m.cells[i]![j]!;
      if (cell.state === 'na') row.push('—');
      else if (cell.state === 'passed') row.push('OK');
      else if (cell.state === 'pending') row.push('PENDING');
      else row.push(cell.reason ? `VIOLATED (${cell.reason})` : 'VIOLATED');
    }
    lines.push(row.map(escape).join(','));
  }

  // UTF-8 BOM for Excel Cyrillic + CRLF per RFC 4180 (same convention as audit CSV).
  return '\uFEFF' + lines.join('\r\n');
}

// ─── FR-11 / FR-12: "my violations" + "project violating issues" ─────────────

export interface IssueViolationSummary {
  issueId: string;
  issueKey: string;
  issueTitle: string;
  projectId: string;
  projectKey: string;
  violations: Array<{
    checkpointId: string;
    checkpointName: string;
    checkpointColor: string;
    releaseId: string;
    releaseName: string;
    deadline: string;
    reason: string;
  }>;
}

/**
 * FR-11: returns every issue in a project that is currently violating at least one
 * VIOLATED-state release checkpoint, keyed by issue id. Powers the "red stripe" indicator
 * on board cards and project lists.
 */
export async function listViolatingIssuesForProject(
  projectId: string,
): Promise<IssueViolationSummary[]> {
  const checkpoints = await prisma.releaseCheckpoint.findMany({
    where: {
      state: 'VIOLATED',
      release: {
        OR: [
          { projectId },
          // INTEGRATION releases — pull them in if any of the checkpoint's violations
          // references an issue belonging to this project.
          { items: { some: { issue: { projectId } } } },
        ],
      },
    },
    select: {
      id: true,
      deadline: true,
      violations: true,
      release: { select: { id: true, name: true } },
      checkpointType: { select: { name: true, color: true } },
    },
  });

  // Deduplicate by issueId, attaching each violating checkpoint to the aggregate.
  const byIssue = new Map<string, IssueViolationSummary['violations']>();
  for (const cp of checkpoints) {
    if (!Array.isArray(cp.violations)) continue;
    for (const raw of cp.violations) {
      if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) continue;
      const v = raw as Record<string, Prisma.JsonValue>;
      const issueId = typeof v.issueId === 'string' ? v.issueId : null;
      const reason = typeof v.reason === 'string' ? v.reason : '';
      if (!issueId) continue;
      const list = byIssue.get(issueId) ?? [];
      list.push({
        checkpointId: cp.id,
        checkpointName: cp.checkpointType.name,
        checkpointColor: cp.checkpointType.color,
        releaseId: cp.release.id,
        releaseName: cp.release.name,
        deadline: cp.deadline.toISOString().slice(0, 10),
        reason,
      });
      byIssue.set(issueId, list);
    }
  }
  if (byIssue.size === 0) return [];

  const issueIds = [...byIssue.keys()];
  const issues = await prisma.issue.findMany({
    where: { id: { in: issueIds }, projectId },
    select: {
      id: true,
      number: true,
      title: true,
      projectId: true,
      project: { select: { key: true } },
    },
  });

  return issues.map((i) => ({
    issueId: i.id,
    issueKey: `${i.project.key}-${i.number}`,
    issueTitle: i.title,
    projectId: i.projectId,
    projectKey: i.project.key,
    violations: byIssue.get(i.id) ?? [],
  }));
}

/**
 * FR-12 / SEC-7: the authenticated user's own issues that are currently in a VIOLATED
 * checkpoint. Three layers of filtering are applied:
 *
 *   1. Global read-role (SUPER_ADMIN/ADMIN/RELEASE_MANAGER/AUDITOR) — bypass project scope.
 *      Other users only see checkpoints on releases tied to projects they are a member of
 *      (directly or via a group). This closes a cross-project title-leak described in
 *      pre-push review HIGH 3.
 *   2. `state: 'VIOLATED'` — only active breaches surface in the badge.
 *   3. `assigneeId === userId` on the final issue join — strictly own workload.
 *
 * The checkpoint scan is capped at 1000 rows as a safety ceiling; violations within a
 * single checkpoint are unbounded, so the cap is on checkpoints, not issue rows.
 */
export async function listMyViolations(
  userId: string,
  systemRoles: Array<'SUPER_ADMIN' | 'ADMIN' | 'RELEASE_MANAGER' | 'AUDITOR' | 'USER'>,
): Promise<IssueViolationSummary[]> {
  const hasGlobalRead = systemRoles.some((r) =>
    (['SUPER_ADMIN', 'ADMIN', 'RELEASE_MANAGER', 'AUDITOR'] as const).includes(r as never),
  );

  const checkpointWhere: Prisma.ReleaseCheckpointWhereInput = { state: 'VIOLATED' };
  if (!hasGlobalRead) {
    const accessibleProjectIds = await resolveAccessibleProjectIds(userId);
    if (accessibleProjectIds.length === 0) return [];
    checkpointWhere.OR = [
      { release: { projectId: { in: accessibleProjectIds } } },
      // INTEGRATION releases have null projectId; surface their violations only for issues
      // the user can actually see via the final issue.assigneeId join (any INTEGRATION
      // release references issues from various projects, and we filter by assigneeId below).
      { release: { type: 'INTEGRATION' } },
    ];
  }

  const checkpoints = await prisma.releaseCheckpoint.findMany({
    where: checkpointWhere,
    select: {
      id: true,
      deadline: true,
      violations: true,
      release: { select: { id: true, name: true } },
      checkpointType: { select: { name: true, color: true } },
    },
    take: 1000, // safety cap — badge payload shouldn't explode the server
  });

  const byIssue = new Map<string, IssueViolationSummary['violations']>();
  for (const cp of checkpoints) {
    if (!Array.isArray(cp.violations)) continue;
    for (const raw of cp.violations) {
      if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) continue;
      const v = raw as Record<string, Prisma.JsonValue>;
      const issueId = typeof v.issueId === 'string' ? v.issueId : null;
      const reason = typeof v.reason === 'string' ? v.reason : '';
      if (!issueId) continue;
      const list = byIssue.get(issueId) ?? [];
      list.push({
        checkpointId: cp.id,
        checkpointName: cp.checkpointType.name,
        checkpointColor: cp.checkpointType.color,
        releaseId: cp.release.id,
        releaseName: cp.release.name,
        deadline: cp.deadline.toISOString().slice(0, 10),
        reason,
      });
      byIssue.set(issueId, list);
    }
  }
  if (byIssue.size === 0) return [];

  const issues = await prisma.issue.findMany({
    where: {
      id: { in: [...byIssue.keys()] },
      assigneeId: userId,
    },
    select: {
      id: true,
      number: true,
      title: true,
      projectId: true,
      project: { select: { key: true } },
    },
    take: 200,
  });

  return issues.map((i) => ({
    issueId: i.id,
    issueKey: `${i.project.key}-${i.number}`,
    issueTitle: i.title,
    projectId: i.projectId,
    projectKey: i.project.key,
    violations: byIssue.get(i.id) ?? [],
  }));
}

/**
 * Badge poll: TopBar calls this every 60 s, so it must be cheap. A Postgres-side count
 * over `jsonb_array_elements(violations)` avoids pulling the JSON payload into Node at
 * all. Filters by assigneeId via a subquery so the index on `issues.assignee_id` is used.
 *
 * SEC-7: only counts rows for `assigneeId === userId`. No project-membership pre-filter
 * here — the count is just a number and leaks no titles; `listMyViolations` (which does
 * leak titles) applies full project scoping.
 */
export async function countMyViolations(userId: string): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ cnt: bigint }>>`
    SELECT COUNT(DISTINCT target.issue_id)::bigint AS cnt
    FROM "release_checkpoints" cp,
         LATERAL jsonb_array_elements(cp."violations") AS v
    JOIN "issues" i ON i."id" = (v->>'issueId')
         LEFT JOIN LATERAL (SELECT (v->>'issueId') AS issue_id) AS target ON TRUE
    WHERE cp."state" = 'VIOLATED'
      AND i."assignee_id" = ${userId}
  `;
  const first = rows[0];
  return first ? Number(first.cnt) : 0;
}

/**
 * Resolve the project IDs the user can see — union of direct `UserProjectRole` rows and
 * indirect `ProjectGroupRole` via group membership. Mirrors the pattern in
 * `shared/middleware/rbac.ts`.
 */
async function resolveAccessibleProjectIds(userId: string): Promise<string[]> {
  const [direct, viaGroups] = await Promise.all([
    prisma.userProjectRole.findMany({ where: { userId }, select: { projectId: true } }),
    prisma.projectGroupRole.findMany({
      where: { group: { members: { some: { userId } } } },
      select: { projectId: true },
    }),
  ]);
  const set = new Set<string>();
  for (const r of direct) set.add(r.projectId);
  for (const r of viaGroups) set.add(r.projectId);
  return [...set];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function assertReleaseWithPlannedDate(releaseId: string) {
  const release = await prisma.release.findUnique({
    where: { id: releaseId },
    select: { id: true, plannedDate: true },
  });
  if (!release) throw new AppError(404, 'Релиз не найден');
  if (!release.plannedDate) {
    throw new AppError(400, 'RELEASE_PLANNED_DATE_REQUIRED');
  }
  return { id: release.id, plannedDate: release.plannedDate };
}

async function createCheckpointsFromTypes(
  releaseId: string,
  plannedDate: Date,
  types: CheckpointType[],
): Promise<void> {
  await Promise.all(
    types.map((type) => {
      const deadline = addDays(plannedDate, type.offsetDays);
      return prisma.releaseCheckpoint.upsert({
        where: { releaseId_checkpointTypeId: { releaseId, checkpointTypeId: type.id } },
        create: {
          releaseId,
          checkpointTypeId: type.id,
          criteriaSnapshot: type.criteria as Prisma.InputJsonValue,
          offsetDaysSnapshot: type.offsetDays,
          // TTSRH-1 PR-15: snapshot на момент создания — FR-25 backward-compat.
          // Parent CheckpointType может быть изменён позже; evaluator (PR-16)
          // читает snapshot поля чтобы путь evaluation не менялся.
          ttqlSnapshot: type.ttqlCondition ?? null,
          conditionModeSnapshot: type.conditionMode,
          deadline,
        },
        update: {
          // Re-apply keeps existing state/violations — only refresh deadline if offset changed.
          deadline,
        },
      });
    }),
  );
}

async function reconcileViolationEvents(
  tx: Prisma.TransactionClient,
  releaseCheckpointId: string,
  currentViolations: CheckpointViolation[],
  now: Date,
): Promise<void> {
  const openEvents = await tx.checkpointViolationEvent.findMany({
    where: { releaseCheckpointId, resolvedAt: null },
    select: { id: true, issueId: true },
  });
  const openByIssue = new Map(openEvents.map((e) => [e.issueId, e.id]));

  const currentIssueIds = new Set(currentViolations.map((v) => v.issueId));

  // Resolve events whose issue is no longer violating.
  const toResolve = openEvents.filter((e) => !currentIssueIds.has(e.issueId)).map((e) => e.id);
  if (toResolve.length > 0) {
    await tx.checkpointViolationEvent.updateMany({
      where: { id: { in: toResolve } },
      data: { resolvedAt: now },
    });
  }

  // Open a new event for each newly-violating issue that has no open event yet.
  const toOpen = currentViolations.filter((v) => !openByIssue.has(v.issueId));
  if (toOpen.length > 0) {
    await tx.checkpointViolationEvent.createMany({
      data: toOpen.map((v) => ({
        releaseCheckpointId,
        issueId: v.issueId,
        issueKey: v.issueKey,
        reason: v.reason,
        criterionType: v.criterionType,
        occurredAt: now,
      })),
    });
  }
}

async function fetchIssueIndex(issueIds: string[]) {
  if (issueIds.length === 0) return new Map<string, { issueId: string; issueKey: string; issueTitle: string }>();
  const rows = await prisma.issue.findMany({
    where: { id: { in: issueIds } },
    select: { id: true, number: true, title: true, project: { select: { key: true } } },
  });
  const index = new Map<string, { issueId: string; issueKey: string; issueTitle: string }>();
  for (const r of rows) {
    index.set(r.id, {
      issueId: r.id,
      issueKey: `${r.project.key}-${r.number}`,
      issueTitle: r.title,
    });
  }
  return index;
}

async function invalidateReleaseCache(releaseId: string): Promise<void> {
  // Single exact key (no variants yet) — plain DEL, not a SCAN-based prefix scan.
  await delCachedJson(cacheKey(releaseId));
  // PR-10: burndown.violatedCheckpoints reads live off ReleaseCheckpoint.state, so any
  // recompute that could change violations must also blow the burndown response cache.
  await invalidateBurndownCache(releaseId);
}

function parseStringIdArray(value: Prisma.JsonValue): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
}

function parseViolations(value: Prisma.JsonValue): CheckpointViolation[] {
  if (!Array.isArray(value)) return [];
  const out: CheckpointViolation[] = [];
  for (const entry of value) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const obj = entry as Record<string, Prisma.JsonValue>;
    out.push({
      issueId: typeof obj.issueId === 'string' ? obj.issueId : '',
      issueKey: typeof obj.issueKey === 'string' ? obj.issueKey : '',
      issueTitle: typeof obj.issueTitle === 'string' ? obj.issueTitle : '',
      reason: typeof obj.reason === 'string' ? obj.reason : '',
      criterionType:
        typeof obj.criterionType === 'string'
          ? (obj.criterionType as CheckpointViolation['criterionType'])
          : 'STATUS_IN',
    });
  }
  return out;
}

function computeListIsWarning(
  rc: { state: ReleaseCheckpoint['state']; deadline: Date },
  violationsCount: number,
  warningDays: number,
): boolean {
  if (rc.state !== 'PENDING') return false;
  if (violationsCount === 0) return false;
  const msPerDay = 24 * 60 * 60 * 1000;
  const now = new Date();
  const daysUntil = Math.ceil((rc.deadline.getTime() - now.getTime()) / msPerDay);
  return daysUntil <= warningDays;
}

function addDays(base: Date, days: number): Date {
  const d = new Date(base.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function toISODate(d: Date): string {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
