// TTMP-160 PR-2: per-checkpoint evaluator + release-risk aggregator.
// Pure functions over pre-loaded data — no Prisma / Redis / Express dependencies here.
// PR-3 wires DB loading + persistence; PR-4 drives scheduling.
//
// See docs/tz/TTMP-160.md §12.4 for the state machine and risk formula.

import { createHash } from 'node:crypto';
import type { CheckpointState, CheckpointWeight } from '@prisma/client';

import type {
  CheckpointCriterion,
  CheckpointViolation,
  CheckpointBreakdown,
  ReleaseRisk,
} from './checkpoint.types.js';
import type { EvaluationContext, EvaluationIssue } from './evaluate-criterion.js';
import { evaluateCriterion } from './evaluate-criterion.js';

// ─── Checkpoint evaluation ───────────────────────────────────────────────────

export interface CheckpointEvaluationInput {
  // Checkpoint identity is the caller's concern — the engine works on the snapshotted
  // criteria + deadline only (FR-15 keeps instance evaluation decoupled from the CheckpointType
  // row, which may be edited after the checkpoint was applied).
  criteria: CheckpointCriterion[];
  deadline: Date;
  warningDays: number;
  issues: EvaluationIssue[];
  context: EvaluationContext;
}

export interface CheckpointEvaluationResult {
  state: CheckpointState;
  // YELLOW tile on the traffic light: PENDING + deadline within warningDays + violations exist.
  isWarning: boolean;
  applicableIssueIds: string[];
  passedIssueIds: string[];
  violations: CheckpointViolation[];
  // sha1 of the sorted-by-issueId violations payload — used by PR-3 to skip writes when a
  // recompute yields the same result (§4 R-7 dedup).
  violationsHash: string;
  breakdown: CheckpointBreakdown;
}

export function evaluateCheckpoint(
  input: CheckpointEvaluationInput,
  now: Date,
): CheckpointEvaluationResult {
  const applicableIssueIds: string[] = [];
  const passedIssueIds: string[] = [];
  const violations: CheckpointViolation[] = [];

  for (const issue of input.issues) {
    const results = input.criteria.map((c) => evaluateCriterion(c, issue, input.context));
    const applicableResults = results.filter((r) => r.applicable);
    if (applicableResults.length === 0) continue;

    applicableIssueIds.push(issue.id);

    const failed = applicableResults.filter((r) => r.applicable && r.passed === false) as Array<
      Extract<ReturnType<typeof evaluateCriterion>, { applicable: true; passed: false }>
    >;

    if (failed.length === 0) {
      passedIssueIds.push(issue.id);
      continue;
    }

    violations.push({
      issueId: issue.id,
      issueKey: issue.key,
      issueTitle: issue.title,
      // Concatenate human reasons so the violation row carries the full "why" in one field.
      // criterionType takes the first failing criterion — good enough for filtering/analytics;
      // the joined reason preserves detail.
      reason: failed.map((f) => f.reason).join('; '),
      criterionType: failed[0]!.criterionType,
    });
  }

  const state = computeState(violations.length, input.deadline, now);
  const isWarning = computeIsWarning(state, violations.length, input.deadline, input.warningDays, now);
  const violationsHash = computeViolationsHash(violations);

  return {
    state,
    isWarning,
    applicableIssueIds,
    passedIssueIds,
    violations,
    violationsHash,
    breakdown: {
      applicable: applicableIssueIds.length,
      passed: passedIssueIds.length,
      violated: violations.length,
    },
  };
}

function computeState(
  violationsCount: number,
  deadline: Date,
  now: Date,
): CheckpointState {
  // Semantic: OK/VIOLATED are *final* verdicts that kick in only after the deadline has
  // passed. Before the deadline the КТ is PENDING — "still in flight" — regardless of
  // whether current issues satisfy the criteria, because tasks can still be re-opened
  // or added to the release. Showing "OK" (passed) for a checkpoint whose deadline is
  // two weeks away misleads the release manager into thinking the checkpoint is done.
  if (now.getTime() < deadline.getTime()) return 'PENDING';
  return violationsCount === 0 ? 'OK' : 'VIOLATED';
}

function computeIsWarning(
  state: CheckpointState,
  violationsCount: number,
  deadline: Date,
  warningDays: number,
  now: Date,
): boolean {
  if (state !== 'PENDING') return false;
  if (violationsCount === 0) return false;
  // Compare in whole days. `Math.ceil` ensures a 2h-before-deadline moment (0.083 days)
  // rounds up to 1 day, so `1 <= warningDays` stays deterministic and matches the spec's
  // integer-day intent. Fractional comparisons would flicker in/out of the warning band
  // across sub-minute scheduler ticks.
  const msPerDay = 24 * 60 * 60 * 1000;
  const daysUntil = Math.ceil((deadline.getTime() - now.getTime()) / msPerDay);
  return daysUntil <= warningDays;
}

/**
 * Deterministic fingerprint of a violation set — used by PR-3 to skip DB writes when a
 * recompute produces the same semantic result (R-7 skip-write without diff).
 *
 * Only stable, user-meaningful fields contribute: `{ issueId, reason, criterionType }`.
 * `issueKey` and `issueTitle` are intentionally excluded so that renaming an issue does not
 * force a spurious write with no semantic change.
 *
 * An empty array returns `''` — same sentinel as the schema default on `violations_hash`.
 * Callers MUST NOT use hash equality alone to infer "never evaluated"; use
 * `lastEvaluatedAt IS NULL` for that.
 */
export function computeViolationsHash(violations: CheckpointViolation[]): string {
  if (violations.length === 0) return '';
  const sorted = [...violations].sort((a, b) => (a.issueId < b.issueId ? -1 : a.issueId > b.issueId ? 1 : 0));
  const payload = JSON.stringify(
    sorted.map((v) => ({
      issueId: v.issueId,
      reason: v.reason,
      criterionType: v.criterionType,
    })),
  );
  return createHash('sha1').update(payload).digest('hex');
}

// ─── Release-level risk ──────────────────────────────────────────────────────

const WEIGHT_VALUES: Record<CheckpointWeight, number> = {
  CRITICAL: 8,
  HIGH: 4,
  MEDIUM: 2,
  LOW: 1,
};

export interface CheckpointForRisk {
  weight: CheckpointWeight;
  state: CheckpointState;
}

export function computeReleaseRisk(checkpoints: CheckpointForRisk[]): ReleaseRisk {
  if (checkpoints.length === 0) return { score: 0, level: 'LOW' };

  let total = 0;
  let violated = 0;
  for (const cp of checkpoints) {
    const w = WEIGHT_VALUES[cp.weight];
    total += w;
    if (cp.state === 'VIOLATED') violated += w;
  }

  if (total === 0) return { score: 0, level: 'LOW' };
  const score = violated / total;

  let level: ReleaseRisk['level'];
  if (score === 0) level = 'LOW';
  else if (score <= 0.3) level = 'MEDIUM';
  else if (score <= 0.7) level = 'HIGH';
  else level = 'CRITICAL';

  return { score, level };
}
