// TTMP-160 PR-2: pure per-issue criterion evaluator.
// See docs/tz/TTMP-160.md §12.4 for the algorithm.
//
// The engine is decoupled from Prisma: callers (PR-3 loaders) normalise rows into
// EvaluationIssue + EvaluationContext once per release. Keeping the function pure makes
// unit tests fast and deterministic, and lets the scheduler (PR-4) batch-evaluate without
// re-hitting the DB per criterion.

import type { StatusCategory } from '@prisma/client';
import type { CheckpointCriterion, CheckpointCriterionType } from './checkpoint.types.js';

// ─── Engine input types ──────────────────────────────────────────────────────

export interface EvaluationIssue {
  id: string;
  key: string;
  title: string;
  // systemKey of the IssueTypeConfig — null if the issue has no type (legacy rows).
  issueTypeSystemKey: string | null;
  statusCategory: StatusCategory;
  statusName: string;
  assigneeId: string | null;
  dueDate: Date | null;
  // customFieldId → parsed value. Missing keys mean "no row in issue_custom_field_values".
  customFieldValues: Map<string, unknown>;
  // customFieldId → field name, for reason strings. Optional: loader may omit to save time.
  customFieldNames?: Map<string, string>;
  subtasks: EvaluationSubtask[];
  blockers: EvaluationBlocker[];
}

export interface EvaluationSubtask {
  id: string;
  key: string;
  statusCategory: StatusCategory;
}

// One "blocker" = one outbound/inbound link (normalised by the loader) that causes
// `this` issue to be blocked. `linkTypeKey` is a stable machine key the loader assigns to
// the link type (e.g. 'BLOCKS'); criterion.linkTypeKeys filters on it.
export interface EvaluationBlocker {
  issueKey: string;
  statusCategory: StatusCategory;
  linkTypeKey: string;
}

export interface EvaluationContext {
  // Anchor for DUE_BEFORE. Date-only (no time) semantics match Release.plannedDate @db.Date.
  releasePlannedDate: Date;
}

// ─── Result ──────────────────────────────────────────────────────────────────

export type CriterionEvaluation =
  | { applicable: false }
  | { applicable: true; passed: true }
  | { applicable: true; passed: false; reason: string; criterionType: CheckpointCriterionType };

// ─── Evaluator ───────────────────────────────────────────────────────────────

export function evaluateCriterion(
  criterion: CheckpointCriterion,
  issue: EvaluationIssue,
  context: EvaluationContext,
): CriterionEvaluation {
  // issueTypes filter — if set, the criterion only applies to issues whose type systemKey
  // is in the allowlist. An issue with no systemKey (legacy rows with no IssueTypeConfig)
  // is never matched by an allowlist — spec pseudocode assumes the relation is present,
  // we fall through to applicable:false to model pre-IssueTypeConfig rows safely.
  if (criterion.issueTypes && criterion.issueTypes.length > 0) {
    if (issue.issueTypeSystemKey == null) return { applicable: false };
    if (!criterion.issueTypes.includes(issue.issueTypeSystemKey)) return { applicable: false };
  }

  switch (criterion.type) {
    case 'STATUS_IN':
      return evalStatusIn(criterion, issue);
    case 'DUE_BEFORE':
      return evalDueBefore(criterion, issue, context);
    case 'ASSIGNEE_SET':
      return evalAssigneeSet(issue);
    case 'CUSTOM_FIELD_VALUE':
      return evalCustomFieldValue(criterion, issue);
    case 'ALL_SUBTASKS_DONE':
      return evalAllSubtasksDone(issue);
    case 'NO_BLOCKING_LINKS':
      return evalNoBlockingLinks(criterion, issue);
  }
}

function evalStatusIn(
  c: Extract<CheckpointCriterion, { type: 'STATUS_IN' }>,
  issue: EvaluationIssue,
): CriterionEvaluation {
  if (c.categories.includes(issue.statusCategory)) {
    return { applicable: true, passed: true };
  }
  return {
    applicable: true,
    passed: false,
    criterionType: 'STATUS_IN',
    reason: `Статус «${issue.statusName}» не входит в ${c.categories.join('/')}`,
  };
}

function evalDueBefore(
  c: Extract<CheckpointCriterion, { type: 'DUE_BEFORE' }>,
  issue: EvaluationIssue,
  context: EvaluationContext,
): CriterionEvaluation {
  const target = addDays(context.releasePlannedDate, c.days);
  const targetStr = formatDateOnly(target);

  if (issue.dueDate == null) {
    return {
      applicable: true,
      passed: false,
      criterionType: 'DUE_BEFORE',
      reason: `Срок (dueDate) не задан, ожидается ≤ ${targetStr}`,
    };
  }
  if (issue.dueDate.getTime() <= target.getTime()) {
    return { applicable: true, passed: true };
  }
  return {
    applicable: true,
    passed: false,
    criterionType: 'DUE_BEFORE',
    reason: `Срок ${formatDateOnly(issue.dueDate)} позже ${targetStr}`,
  };
}

function evalAssigneeSet(issue: EvaluationIssue): CriterionEvaluation {
  if (issue.assigneeId != null) return { applicable: true, passed: true };
  return {
    applicable: true,
    passed: false,
    criterionType: 'ASSIGNEE_SET',
    reason: 'Исполнитель не назначен',
  };
}

function evalCustomFieldValue(
  c: Extract<CheckpointCriterion, { type: 'CUSTOM_FIELD_VALUE' }>,
  issue: EvaluationIssue,
): CriterionEvaluation {
  const fieldName = issue.customFieldNames?.get(c.customFieldId) ?? 'поле';
  const has = issue.customFieldValues.has(c.customFieldId);
  const value = has ? issue.customFieldValues.get(c.customFieldId) : undefined;

  switch (c.operator) {
    case 'NOT_EMPTY': {
      if (isNonEmpty(value)) return { applicable: true, passed: true };
      return {
        applicable: true,
        passed: false,
        criterionType: 'CUSTOM_FIELD_VALUE',
        reason: `Поле «${fieldName}» не заполнено`,
      };
    }
    case 'EQUALS': {
      // NOTE: deepEqual is order-sensitive for arrays. For MULTI_SELECT fields, the PR-3
      // loader MUST sort array values canonically before placing them in customFieldValues
      // to avoid phantom violations from non-semantic reordering of stored options.
      if (deepEqual(value ?? null, c.value ?? null)) return { applicable: true, passed: true };
      return {
        applicable: true,
        passed: false,
        criterionType: 'CUSTOM_FIELD_VALUE',
        reason: `Поле «${fieldName}»: ожидается ${stringifyValue(c.value)}, текущее ${stringifyValue(value)}`,
      };
    }
    case 'IN': {
      // Spec §12.4: `c.value.includes(val)` — SameValueZero, scalar match only. This keeps
      // IN semantically distinct from EQUALS (which does deep-equal for structured values).
      if (Array.isArray(c.value) && c.value.includes(value)) {
        return { applicable: true, passed: true };
      }
      const allowed = Array.isArray(c.value) ? c.value.map(stringifyValue).join(', ') : '[]';
      return {
        applicable: true,
        passed: false,
        criterionType: 'CUSTOM_FIELD_VALUE',
        reason: `Поле «${fieldName}»: значение ${stringifyValue(value)} не в [${allowed}]`,
      };
    }
  }
}

function evalAllSubtasksDone(issue: EvaluationIssue): CriterionEvaluation {
  if (issue.subtasks.length === 0) return { applicable: true, passed: true };
  // Spec §12.4 pseudocode uses ['DONE','CANCELLED'] but the Prisma StatusCategory enum has
  // only TODO/IN_PROGRESS/DONE — cancelled statuses are workflow statuses whose category is
  // DONE (see backend/src/prisma/seed-workflow.ts), so `!== 'DONE'` correctly treats both
  // completed and cancelled subtasks as "closed".
  const openSubtasks = issue.subtasks.filter((s) => s.statusCategory !== 'DONE');
  if (openSubtasks.length === 0) return { applicable: true, passed: true };
  const keys = openSubtasks.map((s) => s.key).slice(0, 5);
  const tail = openSubtasks.length > keys.length ? ` и ещё ${openSubtasks.length - keys.length}` : '';
  return {
    applicable: true,
    passed: false,
    criterionType: 'ALL_SUBTASKS_DONE',
    reason: `Подзадачи не закрыты: ${keys.join(', ')}${tail}`,
  };
}

function evalNoBlockingLinks(
  c: Extract<CheckpointCriterion, { type: 'NO_BLOCKING_LINKS' }>,
  issue: EvaluationIssue,
): CriterionEvaluation {
  const typeFilter =
    c.linkTypeKeys && c.linkTypeKeys.length > 0 ? new Set(c.linkTypeKeys) : null;

  const openBlockers = issue.blockers.filter((b) => {
    if (typeFilter && !typeFilter.has(b.linkTypeKey)) return false;
    // See evalAllSubtasksDone: cancelled = category DONE in the 3-value StatusCategory enum.
    return b.statusCategory !== 'DONE';
  });

  if (openBlockers.length === 0) return { applicable: true, passed: true };
  const keys = openBlockers.map((b) => b.issueKey).slice(0, 5);
  const tail = openBlockers.length > keys.length ? ` и ещё ${openBlockers.length - keys.length}` : '';
  return {
    applicable: true,
    passed: false,
    criterionType: 'NO_BLOCKING_LINKS',
    reason: `Блокируется незавершёнными: ${keys.join(', ')}${tail}`,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isNonEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return a === b;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  if (typeof a === 'object' && typeof b === 'object') {
    const ao = a as Record<string, unknown>;
    const bo = b as Record<string, unknown>;
    const aKeys = Object.keys(ao);
    const bKeys = Object.keys(bo);
    if (aKeys.length !== bKeys.length) return false;
    for (const k of aKeys) {
      if (!deepEqual(ao[k], bo[k])) return false;
    }
    return true;
  }
  return false;
}

function stringifyValue(value: unknown): string {
  if (value === undefined || value === null) return '∅';
  if (typeof value === 'string') return `«${value}»`;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function addDays(base: Date, days: number): Date {
  const d = new Date(base.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function formatDateOnly(d: Date): string {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
