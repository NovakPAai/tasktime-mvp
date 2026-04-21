/**
 * TTSRH-1 PR-16 — unit tests для evaluateCheckpoint в TTQL / COMBINED режимах
 * + ERROR fast-path + backward-compat STRUCTURED.
 *
 * Pure-unit. Не требует Postgres. Регистрируется в `test:parser`.
 */
import { describe, expect, it } from 'vitest';

import { evaluateCheckpoint } from '../src/modules/releases/checkpoints/checkpoint-engine.service.js';
import type { CheckpointCriterion } from '../src/modules/releases/checkpoints/checkpoint.types.js';
import type { EvaluationContext, EvaluationIssue } from '../src/modules/releases/checkpoints/evaluate-criterion.js';

const now = new Date('2026-05-15T10:00:00Z');
const deadlinePast = new Date('2026-05-10T00:00:00Z'); // in the past — verdict finalises
const deadlineFuture = new Date('2026-06-15T00:00:00Z');

const baseIssue = (id: string, extras: Partial<EvaluationIssue> = {}): EvaluationIssue => ({
  id,
  key: `X-${id}`,
  title: `Issue ${id}`,
  issueTypeSystemKey: 'TASK',
  statusCategory: 'DONE',
  statusName: 'Done',
  assigneeId: 'u1',
  dueDate: null,
  customFieldValues: new Map(),
  subtasks: [],
  blockers: [],
  ...extras,
});

const context: EvaluationContext = { releasePlannedDate: deadlineFuture };

const criteriaAssignee: CheckpointCriterion[] = [{ type: 'ASSIGNEE_SET' }];

describe('evaluateCheckpoint — STRUCTURED (default, backward-compat)', () => {
  it('no conditionMode specified → behaves as STRUCTURED', () => {
    const issues = [baseIssue('1'), baseIssue('2', { assigneeId: null })];
    const res = evaluateCheckpoint(
      { criteria: criteriaAssignee, deadline: deadlinePast, warningDays: 3, issues, context },
      now,
    );
    expect(res.state).toBe('VIOLATED');
    expect(res.applicableIssueIds).toEqual(['1', '2']);
    expect(res.passedIssueIds).toEqual(['1']);
    expect(res.breakdown).toEqual({ applicable: 2, passed: 1, violated: 1 });
  });

  it('ttqlMatchedIds is ignored when mode is STRUCTURED', () => {
    const issues = [baseIssue('1')];
    const res = evaluateCheckpoint(
      {
        criteria: criteriaAssignee,
        deadline: deadlinePast,
        warningDays: 3,
        issues,
        context,
        conditionMode: 'STRUCTURED',
        ttqlMatchedIds: new Set(),
      },
      now,
    );
    expect(res.state).toBe('OK');
    expect(res.passedIssueIds).toEqual(['1']);
  });
});

describe('evaluateCheckpoint — TTQL mode', () => {
  it('all issues applicable; passed iff in ttqlMatchedIds', () => {
    const issues = [baseIssue('1'), baseIssue('2'), baseIssue('3')];
    const res = evaluateCheckpoint(
      {
        criteria: [],
        deadline: deadlinePast,
        warningDays: 3,
        issues,
        context,
        conditionMode: 'TTQL',
        ttqlMatchedIds: new Set(['1', '3']),
      },
      now,
    );
    expect(res.state).toBe('VIOLATED');
    expect(res.applicableIssueIds.sort()).toEqual(['1', '2', '3']);
    expect(res.passedIssueIds.sort()).toEqual(['1', '3']);
    expect(res.violations).toHaveLength(1);
    expect(res.violations[0]?.criterionType).toBe('TTQL_MISMATCH');
    expect(res.violations[0]?.issueId).toBe('2');
  });

  it('empty ttqlMatchedIds → all issues fail TTQL_MISMATCH', () => {
    const issues = [baseIssue('1'), baseIssue('2')];
    const res = evaluateCheckpoint(
      {
        criteria: [],
        deadline: deadlinePast,
        warningDays: 3,
        issues,
        context,
        conditionMode: 'TTQL',
        ttqlMatchedIds: new Set(),
      },
      now,
    );
    expect(res.state).toBe('VIOLATED');
    expect(res.violations).toHaveLength(2);
  });

  it('null ttqlMatchedIds (not evaluated) → all issues fail', () => {
    const issues = [baseIssue('1')];
    const res = evaluateCheckpoint(
      {
        criteria: [],
        deadline: deadlinePast,
        warningDays: 3,
        issues,
        context,
        conditionMode: 'TTQL',
        ttqlMatchedIds: null,
      },
      now,
    );
    expect(res.state).toBe('VIOLATED');
  });

  it('ttqlError → state=ERROR with single TTQL_ERROR violation', () => {
    const issues = [baseIssue('1'), baseIssue('2')];
    const res = evaluateCheckpoint(
      {
        criteria: [],
        deadline: deadlinePast,
        warningDays: 3,
        issues,
        context,
        conditionMode: 'TTQL',
        ttqlMatchedIds: null,
        ttqlError: 'compile: UNRESOLVED_FIELD `foo`',
      },
      now,
    );
    expect(res.state).toBe('ERROR');
    expect(res.violations).toHaveLength(1);
    expect(res.violations[0]?.criterionType).toBe('TTQL_ERROR');
    expect(res.violations[0]?.reason).toContain('UNRESOLVED_FIELD');
    expect(res.applicableIssueIds).toEqual([]);
    expect(res.passedIssueIds).toEqual([]);
  });

  it('violationsHash stable across two evaluations with identical TTQL matches', () => {
    const issues = [baseIssue('1'), baseIssue('2'), baseIssue('3')];
    const a = evaluateCheckpoint(
      {
        criteria: [],
        deadline: deadlinePast,
        warningDays: 3,
        issues,
        context,
        conditionMode: 'TTQL',
        ttqlMatchedIds: new Set(['1']),
      },
      now,
    );
    const b = evaluateCheckpoint(
      {
        criteria: [],
        deadline: deadlinePast,
        warningDays: 3,
        issues: [...issues].reverse(), // re-order input
        context,
        conditionMode: 'TTQL',
        ttqlMatchedIds: new Set(['1']),
      },
      now,
    );
    expect(a.violationsHash).toBe(b.violationsHash);
  });
});

describe('evaluateCheckpoint — COMBINED mode', () => {
  it('issue must pass BOTH structured + TTQL to be counted as passed', () => {
    const issues = [
      baseIssue('a'),
      baseIssue('b', { assigneeId: null }), // fails structured ASSIGNEE_SET
      baseIssue('c'), // passes structured
    ];
    const res = evaluateCheckpoint(
      {
        criteria: criteriaAssignee,
        deadline: deadlinePast,
        warningDays: 3,
        issues,
        context,
        conditionMode: 'COMBINED',
        ttqlMatchedIds: new Set(['a']), // only 'a' passes TTQL
      },
      now,
    );
    expect(res.state).toBe('VIOLATED');
    expect(res.passedIssueIds).toEqual(['a']);
    // 'b' fails structured, 'c' passes structured but fails TTQL → both in violations.
    const violationIds = res.violations.map((v) => v.issueId).sort();
    expect(violationIds).toEqual(['b', 'c']);
    // Ensure 'b' was NOT double-counted (structured fail short-circuits TTQL check).
    expect(res.violations.filter((v) => v.issueId === 'b')).toHaveLength(1);
  });

  it('pending deadline → state PENDING regardless of violations', () => {
    const issues = [baseIssue('1')];
    const res = evaluateCheckpoint(
      {
        criteria: criteriaAssignee,
        deadline: deadlineFuture,
        warningDays: 3,
        issues,
        context,
        conditionMode: 'COMBINED',
        ttqlMatchedIds: new Set(), // fails TTQL
      },
      now,
    );
    expect(res.state).toBe('PENDING');
  });
});
