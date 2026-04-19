/**
 * TTMP-160 PR-2 — unit tests for the checkpoint engine.
 *
 * Coverage:
 *   - evaluateCriterion: 6 types × (applicable / inapplicable / passed / failed / edge) cases
 *   - evaluateCheckpoint: state transitions (OK / PENDING / VIOLATED) + isWarning window
 *                        + applicable/passed/violated breakdown + violationsHash stability
 *   - computeReleaseRisk: empty, all-ok, weight-weighted bands (LOW/MEDIUM/HIGH/CRITICAL)
 *
 * No DB, no HTTP — fully deterministic, fast.
 */
import { describe, expect, it } from 'vitest';
import type { CheckpointCriterion } from '../src/modules/releases/checkpoints/checkpoint.types.js';
import { evaluateCriterion } from '../src/modules/releases/checkpoints/evaluate-criterion.js';
import type {
  EvaluationContext,
  EvaluationIssue,
} from '../src/modules/releases/checkpoints/evaluate-criterion.js';
import {
  computeReleaseRisk,
  computeViolationsHash,
  evaluateCheckpoint,
} from '../src/modules/releases/checkpoints/checkpoint-engine.service.js';

type CheckpointForRiskLocal = Parameters<typeof computeReleaseRisk>[0][number];

// ─── Fixtures ────────────────────────────────────────────────────────────────

const RELEASE_DATE = new Date('2026-05-30T00:00:00Z');
const CONTEXT: EvaluationContext = { releasePlannedDate: RELEASE_DATE };

function issue(overrides: Partial<EvaluationIssue> = {}): EvaluationIssue {
  return {
    id: overrides.id ?? 'i1',
    key: overrides.key ?? 'TTMP-1',
    title: overrides.title ?? 'Task',
    issueTypeSystemKey: overrides.issueTypeSystemKey ?? 'TASK',
    statusCategory: overrides.statusCategory ?? 'IN_PROGRESS',
    statusName: overrides.statusName ?? 'В работе',
    assigneeId: overrides.assigneeId === undefined ? 'u1' : overrides.assigneeId,
    dueDate: overrides.dueDate === undefined ? null : overrides.dueDate,
    customFieldValues: overrides.customFieldValues ?? new Map(),
    customFieldNames: overrides.customFieldNames,
    subtasks: overrides.subtasks ?? [],
    blockers: overrides.blockers ?? [],
  };
}

// ─── issueTypes filter ───────────────────────────────────────────────────────

describe('evaluateCriterion — issueTypes filter', () => {
  const c: CheckpointCriterion = {
    type: 'ASSIGNEE_SET',
    issueTypes: ['BUG'],
  };

  it('returns applicable=false when issueTypes is set and issue type is not in list', () => {
    const r = evaluateCriterion(c, issue({ issueTypeSystemKey: 'TASK' }), CONTEXT);
    expect(r.applicable).toBe(false);
  });

  it('returns applicable=false when issue has no systemKey but filter is set', () => {
    const r = evaluateCriterion(c, issue({ issueTypeSystemKey: null }), CONTEXT);
    expect(r.applicable).toBe(false);
  });

  it('evaluates normally when issueTypes is undefined', () => {
    const nc: CheckpointCriterion = { type: 'ASSIGNEE_SET' };
    const r = evaluateCriterion(nc, issue({ issueTypeSystemKey: null, assigneeId: null }), CONTEXT);
    expect(r.applicable).toBe(true);
    if (r.applicable) expect(r.passed).toBe(false);
  });
});

// ─── STATUS_IN ───────────────────────────────────────────────────────────────

describe('evaluateCriterion — STATUS_IN', () => {
  const c: CheckpointCriterion = { type: 'STATUS_IN', categories: ['DONE'] };

  it('passes when status category is in the list', () => {
    const r = evaluateCriterion(c, issue({ statusCategory: 'DONE' }), CONTEXT);
    expect(r).toEqual({ applicable: true, passed: true });
  });

  it('fails with a human-readable reason when status is outside the list', () => {
    const r = evaluateCriterion(
      c,
      issue({ statusCategory: 'IN_PROGRESS', statusName: 'В работе' }),
      CONTEXT,
    );
    if (!r.applicable || r.passed !== false) throw new Error('expected failure');
    expect(r.criterionType).toBe('STATUS_IN');
    expect(r.reason).toContain('В работе');
    expect(r.reason).toContain('DONE');
  });

  it('multiple categories: passes if issue is in any of them', () => {
    const multi: CheckpointCriterion = {
      type: 'STATUS_IN',
      categories: ['DONE', 'IN_PROGRESS'],
    };
    const r = evaluateCriterion(multi, issue({ statusCategory: 'IN_PROGRESS' }), CONTEXT);
    expect(r.applicable && r.passed).toBe(true);
  });

  it('multiple categories: fails if issue is TODO', () => {
    const multi: CheckpointCriterion = {
      type: 'STATUS_IN',
      categories: ['DONE', 'IN_PROGRESS'],
    };
    const r = evaluateCriterion(multi, issue({ statusCategory: 'TODO' }), CONTEXT);
    expect(r.applicable && r.passed === false).toBe(true);
  });
});

// ─── DUE_BEFORE ──────────────────────────────────────────────────────────────

describe('evaluateCriterion — DUE_BEFORE', () => {
  it('passes when dueDate equals plannedDate + days', () => {
    const c: CheckpointCriterion = { type: 'DUE_BEFORE', days: -3 };
    const r = evaluateCriterion(c, issue({ dueDate: new Date('2026-05-27T00:00:00Z') }), CONTEXT);
    expect(r).toEqual({ applicable: true, passed: true });
  });

  it('passes when dueDate is earlier than plannedDate + days', () => {
    const c: CheckpointCriterion = { type: 'DUE_BEFORE', days: 0 };
    const r = evaluateCriterion(c, issue({ dueDate: new Date('2026-05-01T00:00:00Z') }), CONTEXT);
    expect(r.applicable && r.passed).toBe(true);
  });

  it('fails when dueDate is later than plannedDate + days', () => {
    const c: CheckpointCriterion = { type: 'DUE_BEFORE', days: 0 };
    const r = evaluateCriterion(c, issue({ dueDate: new Date('2026-06-10T00:00:00Z') }), CONTEXT);
    if (!r.applicable || r.passed !== false) throw new Error('expected failure');
    expect(r.reason).toMatch(/2026-06-10/);
    expect(r.reason).toMatch(/2026-05-30/);
  });

  it('fails with explicit reason when dueDate is null', () => {
    const c: CheckpointCriterion = { type: 'DUE_BEFORE', days: -7 };
    const r = evaluateCriterion(c, issue({ dueDate: null }), CONTEXT);
    if (!r.applicable || r.passed !== false) throw new Error('expected failure');
    expect(r.reason).toContain('не задан');
    expect(r.reason).toContain('2026-05-23');
  });

  it('handles positive day offsets (post-release windows)', () => {
    const c: CheckpointCriterion = { type: 'DUE_BEFORE', days: 7 };
    const r = evaluateCriterion(c, issue({ dueDate: new Date('2026-06-06T00:00:00Z') }), CONTEXT);
    expect(r.applicable && r.passed).toBe(true);
  });
});

// ─── ASSIGNEE_SET ────────────────────────────────────────────────────────────

describe('evaluateCriterion — ASSIGNEE_SET', () => {
  const c: CheckpointCriterion = { type: 'ASSIGNEE_SET' };

  it('passes when assigneeId is non-null', () => {
    expect(evaluateCriterion(c, issue({ assigneeId: 'u1' }), CONTEXT)).toEqual({
      applicable: true,
      passed: true,
    });
  });

  it('fails when assigneeId is null', () => {
    const r = evaluateCriterion(c, issue({ assigneeId: null }), CONTEXT);
    if (!r.applicable || r.passed !== false) throw new Error('expected failure');
    expect(r.reason).toContain('Исполнитель');
  });
});

// ─── CUSTOM_FIELD_VALUE ──────────────────────────────────────────────────────

describe('evaluateCriterion — CUSTOM_FIELD_VALUE', () => {
  const FIELD_ID = '11111111-1111-1111-1111-111111111111';

  describe('NOT_EMPTY', () => {
    const c: CheckpointCriterion = {
      type: 'CUSTOM_FIELD_VALUE',
      customFieldId: FIELD_ID,
      operator: 'NOT_EMPTY',
    };

    it('passes for a non-empty string', () => {
      const r = evaluateCriterion(
        c,
        issue({ customFieldValues: new Map([[FIELD_ID, 'x']]) }),
        CONTEXT,
      );
      expect(r.applicable && r.passed).toBe(true);
    });

    it('fails for missing key', () => {
      const r = evaluateCriterion(c, issue({ customFieldValues: new Map() }), CONTEXT);
      expect(r.applicable && r.passed === false).toBe(true);
    });

    it('fails for null value', () => {
      const r = evaluateCriterion(
        c,
        issue({ customFieldValues: new Map([[FIELD_ID, null]]) }),
        CONTEXT,
      );
      expect(r.applicable && r.passed === false).toBe(true);
    });

    it('fails for empty string', () => {
      const r = evaluateCriterion(
        c,
        issue({ customFieldValues: new Map([[FIELD_ID, '']]) }),
        CONTEXT,
      );
      expect(r.applicable && r.passed === false).toBe(true);
    });

    it('fails for empty array (MULTI_SELECT)', () => {
      const r = evaluateCriterion(
        c,
        issue({ customFieldValues: new Map([[FIELD_ID, []]]) }),
        CONTEXT,
      );
      expect(r.applicable && r.passed === false).toBe(true);
    });

    it('passes for boolean false (FR: present ≠ empty)', () => {
      const r = evaluateCriterion(
        c,
        issue({ customFieldValues: new Map([[FIELD_ID, false]]) }),
        CONTEXT,
      );
      expect(r.applicable && r.passed).toBe(true);
    });

    it('uses the field name in the reason when provided', () => {
      const r = evaluateCriterion(
        c,
        issue({
          customFieldValues: new Map([[FIELD_ID, null]]),
          customFieldNames: new Map([[FIELD_ID, 'Regression Status']]),
        }),
        CONTEXT,
      );
      if (!r.applicable || r.passed !== false) throw new Error('expected failure');
      expect(r.reason).toContain('Regression Status');
    });
  });

  describe('EQUALS', () => {
    it('passes for primitive match', () => {
      const c: CheckpointCriterion = {
        type: 'CUSTOM_FIELD_VALUE',
        customFieldId: FIELD_ID,
        operator: 'EQUALS',
        value: 'PASSED',
      };
      const r = evaluateCriterion(
        c,
        issue({ customFieldValues: new Map([[FIELD_ID, 'PASSED']]) }),
        CONTEXT,
      );
      expect(r.applicable && r.passed).toBe(true);
    });

    it('fails for primitive mismatch', () => {
      const c: CheckpointCriterion = {
        type: 'CUSTOM_FIELD_VALUE',
        customFieldId: FIELD_ID,
        operator: 'EQUALS',
        value: 'PASSED',
      };
      const r = evaluateCriterion(
        c,
        issue({ customFieldValues: new Map([[FIELD_ID, 'FAILED']]) }),
        CONTEXT,
      );
      expect(r.applicable && r.passed === false).toBe(true);
    });

    it('passes for array match (same order)', () => {
      const c: CheckpointCriterion = {
        type: 'CUSTOM_FIELD_VALUE',
        customFieldId: FIELD_ID,
        operator: 'EQUALS',
        value: ['a', 'b'],
      };
      const r = evaluateCriterion(
        c,
        issue({ customFieldValues: new Map([[FIELD_ID, ['a', 'b']]]) }),
        CONTEXT,
      );
      expect(r.applicable && r.passed).toBe(true);
    });

    it('fails for array mismatch (different order, strict deep-equals)', () => {
      const c: CheckpointCriterion = {
        type: 'CUSTOM_FIELD_VALUE',
        customFieldId: FIELD_ID,
        operator: 'EQUALS',
        value: ['a', 'b'],
      };
      const r = evaluateCriterion(
        c,
        issue({ customFieldValues: new Map([[FIELD_ID, ['b', 'a']]]) }),
        CONTEXT,
      );
      expect(r.applicable && r.passed === false).toBe(true);
    });
  });

  describe('IN', () => {
    const c: CheckpointCriterion = {
      type: 'CUSTOM_FIELD_VALUE',
      customFieldId: FIELD_ID,
      operator: 'IN',
      value: ['PASSED', 'SKIPPED'],
    };

    it('passes when value is in the allowed list', () => {
      const r = evaluateCriterion(
        c,
        issue({ customFieldValues: new Map([[FIELD_ID, 'SKIPPED']]) }),
        CONTEXT,
      );
      expect(r.applicable && r.passed).toBe(true);
    });

    it('fails when value is not in the allowed list', () => {
      const r = evaluateCriterion(
        c,
        issue({ customFieldValues: new Map([[FIELD_ID, 'FAILED']]) }),
        CONTEXT,
      );
      expect(r.applicable && r.passed === false).toBe(true);
    });

    it('fails with a readable reason when value is missing', () => {
      const r = evaluateCriterion(c, issue({ customFieldValues: new Map() }), CONTEXT);
      if (!r.applicable || r.passed !== false) throw new Error('expected failure');
      expect(r.reason).toContain('PASSED');
      expect(r.reason).toContain('SKIPPED');
    });

    it('uses === (SameValueZero) semantics, not deep-equal, for array members', () => {
      // Spec: `c.value.includes(val)`. Object values in the allowlist require reference
      // equality, not structural equality — EQUALS is the operator for structural match.
      const objC: CheckpointCriterion = {
        type: 'CUSTOM_FIELD_VALUE',
        customFieldId: FIELD_ID,
        operator: 'IN',
        value: [{ id: 'opt1' }],
      };
      const r = evaluateCriterion(
        objC,
        issue({ customFieldValues: new Map([[FIELD_ID, { id: 'opt1' }]]) }),
        CONTEXT,
      );
      // Different object references, so `.includes` returns false.
      expect(r.applicable && r.passed === false).toBe(true);
    });
  });
});

// ─── ALL_SUBTASKS_DONE ───────────────────────────────────────────────────────

describe('evaluateCriterion — ALL_SUBTASKS_DONE', () => {
  const c: CheckpointCriterion = { type: 'ALL_SUBTASKS_DONE' };

  it('passes when there are no subtasks', () => {
    const r = evaluateCriterion(c, issue({ subtasks: [] }), CONTEXT);
    expect(r.applicable && r.passed).toBe(true);
  });

  it('passes when every subtask is DONE', () => {
    const r = evaluateCriterion(
      c,
      issue({
        subtasks: [
          { id: 's1', key: 'S-1', statusCategory: 'DONE' },
          { id: 's2', key: 'S-2', statusCategory: 'DONE' },
        ],
      }),
      CONTEXT,
    );
    expect(r.applicable && r.passed).toBe(true);
  });

  it('fails when any subtask is not DONE', () => {
    const r = evaluateCriterion(
      c,
      issue({
        subtasks: [
          { id: 's1', key: 'S-1', statusCategory: 'DONE' },
          { id: 's2', key: 'S-2', statusCategory: 'IN_PROGRESS' },
        ],
      }),
      CONTEXT,
    );
    if (!r.applicable || r.passed !== false) throw new Error('expected failure');
    expect(r.reason).toContain('S-2');
  });

  it('truncates the list in the reason to 5 keys + "и ещё N"', () => {
    const subtasks = Array.from({ length: 8 }).map((_, i) => ({
      id: `s${i}`,
      key: `S-${i}`,
      statusCategory: 'TODO' as const,
    }));
    const r = evaluateCriterion(c, issue({ subtasks }), CONTEXT);
    if (!r.applicable || r.passed !== false) throw new Error('expected failure');
    expect(r.reason).toContain('и ещё 3');
  });
});

// ─── NO_BLOCKING_LINKS ───────────────────────────────────────────────────────

describe('evaluateCriterion — NO_BLOCKING_LINKS', () => {
  const c: CheckpointCriterion = { type: 'NO_BLOCKING_LINKS' };

  it('passes when there are no blockers', () => {
    const r = evaluateCriterion(c, issue({ blockers: [] }), CONTEXT);
    expect(r.applicable && r.passed).toBe(true);
  });

  it('passes when all blockers are DONE', () => {
    const r = evaluateCriterion(
      c,
      issue({
        blockers: [
          { issueKey: 'TTMP-2', statusCategory: 'DONE', linkTypeKey: 'BLOCKS' },
          { issueKey: 'TTMP-3', statusCategory: 'DONE', linkTypeKey: 'BLOCKS' },
        ],
      }),
      CONTEXT,
    );
    expect(r.applicable && r.passed).toBe(true);
  });

  it('fails when any blocker is open', () => {
    const r = evaluateCriterion(
      c,
      issue({
        blockers: [{ issueKey: 'TTMP-5', statusCategory: 'IN_PROGRESS', linkTypeKey: 'BLOCKS' }],
      }),
      CONTEXT,
    );
    if (!r.applicable || r.passed !== false) throw new Error('expected failure');
    expect(r.reason).toContain('TTMP-5');
  });

  it('applies linkTypeKeys filter to ignore non-matching types', () => {
    const filtered: CheckpointCriterion = {
      type: 'NO_BLOCKING_LINKS',
      linkTypeKeys: ['BLOCKS'],
    };
    const r = evaluateCriterion(
      filtered,
      issue({
        blockers: [
          // Open blocker under a non-filtered type — ignored.
          { issueKey: 'TTMP-7', statusCategory: 'IN_PROGRESS', linkTypeKey: 'RELATES' },
        ],
      }),
      CONTEXT,
    );
    expect(r.applicable && r.passed).toBe(true);
  });

  it('truncates blocker list to 5 keys + "и ещё N"', () => {
    const blockers = Array.from({ length: 7 }).map((_, i) => ({
      issueKey: `TTMP-${100 + i}`,
      statusCategory: 'IN_PROGRESS' as const,
      linkTypeKey: 'BLOCKS',
    }));
    const r = evaluateCriterion(c, issue({ blockers }), CONTEXT);
    if (!r.applicable || r.passed !== false) throw new Error('expected failure');
    expect(r.reason).toContain('и ещё 2');
  });
});

// ─── evaluateCheckpoint — integration of criteria + state ────────────────────

describe('evaluateCheckpoint', () => {
  const STATUS_IN_DONE: CheckpointCriterion = { type: 'STATUS_IN', categories: ['DONE'] };

  it('empty applicable set, pre-deadline → PENDING with zero breakdown', () => {
    const r = evaluateCheckpoint(
      {
        criteria: [{ type: 'ASSIGNEE_SET', issueTypes: ['BUG'] }],
        deadline: new Date('2026-05-23T00:00:00Z'),
        warningDays: 3,
        issues: [issue({ issueTypeSystemKey: 'TASK' })],
        context: CONTEXT,
      },
      new Date('2026-05-20T00:00:00Z'),
    );
    // Before the deadline every КТ is PENDING — "still in flight". Issues may still be
    // added / re-opened, so even an empty applicable set is not yet a verdict.
    expect(r.state).toBe('PENDING');
    expect(r.breakdown).toEqual({ applicable: 0, passed: 0, violated: 0 });
    expect(r.isWarning).toBe(false);
    expect(r.violationsHash).toBe('');
  });

  it('empty applicable set, post-deadline → OK with zero breakdown', () => {
    const r = evaluateCheckpoint(
      {
        criteria: [{ type: 'ASSIGNEE_SET', issueTypes: ['BUG'] }],
        deadline: new Date('2026-05-23T00:00:00Z'),
        warningDays: 3,
        issues: [issue({ issueTypeSystemKey: 'TASK' })],
        context: CONTEXT,
      },
      new Date('2026-05-25T00:00:00Z'),
    );
    expect(r.state).toBe('OK');
    expect(r.breakdown).toEqual({ applicable: 0, passed: 0, violated: 0 });
    expect(r.isWarning).toBe(false);
  });

  it('all applicable issues pass, pre-deadline → PENDING (final verdict only after deadline)', () => {
    const r = evaluateCheckpoint(
      {
        criteria: [STATUS_IN_DONE],
        deadline: new Date('2026-05-23T00:00:00Z'),
        warningDays: 3,
        issues: [
          issue({ id: 'a', key: 'A-1', statusCategory: 'DONE' }),
          issue({ id: 'b', key: 'B-1', statusCategory: 'DONE' }),
        ],
        context: CONTEXT,
      },
      new Date('2026-05-20T00:00:00Z'),
    );
    expect(r.state).toBe('PENDING');
    expect(r.breakdown).toEqual({ applicable: 2, passed: 2, violated: 0 });
    expect(r.passedIssueIds).toEqual(['a', 'b']);
  });

  it('all applicable issues pass, post-deadline → OK', () => {
    const r = evaluateCheckpoint(
      {
        criteria: [STATUS_IN_DONE],
        deadline: new Date('2026-05-23T00:00:00Z'),
        warningDays: 3,
        issues: [
          issue({ id: 'a', key: 'A-1', statusCategory: 'DONE' }),
          issue({ id: 'b', key: 'B-1', statusCategory: 'DONE' }),
        ],
        context: CONTEXT,
      },
      new Date('2026-05-25T00:00:00Z'),
    );
    expect(r.state).toBe('OK');
    expect(r.breakdown).toEqual({ applicable: 2, passed: 2, violated: 0 });
  });

  it('pre-deadline with violations → PENDING (not yet VIOLATED)', () => {
    const r = evaluateCheckpoint(
      {
        criteria: [STATUS_IN_DONE],
        deadline: new Date('2026-05-23T00:00:00Z'),
        warningDays: 3,
        issues: [issue({ id: 'x', key: 'X-1', statusCategory: 'IN_PROGRESS' })],
        context: CONTEXT,
      },
      new Date('2026-05-10T00:00:00Z'),
    );
    expect(r.state).toBe('PENDING');
    expect(r.violations).toHaveLength(1);
    expect(r.violations[0]!.issueKey).toBe('X-1');
  });

  it('post-deadline with violations → VIOLATED', () => {
    const r = evaluateCheckpoint(
      {
        criteria: [STATUS_IN_DONE],
        deadline: new Date('2026-05-23T00:00:00Z'),
        warningDays: 3,
        issues: [issue({ id: 'x', key: 'X-1', statusCategory: 'IN_PROGRESS' })],
        context: CONTEXT,
      },
      new Date('2026-05-25T00:00:00Z'),
    );
    expect(r.state).toBe('VIOLATED');
    expect(r.isWarning).toBe(false);
  });

  it('isWarning=true: PENDING + within warningDays + violations exist', () => {
    const r = evaluateCheckpoint(
      {
        criteria: [STATUS_IN_DONE],
        deadline: new Date('2026-05-23T00:00:00Z'),
        warningDays: 3,
        issues: [issue({ statusCategory: 'IN_PROGRESS' })],
        context: CONTEXT,
      },
      new Date('2026-05-22T00:00:00Z'), // 1 day before
    );
    expect(r.state).toBe('PENDING');
    expect(r.isWarning).toBe(true);
  });

  it('isWarning=false when outside warningDays window', () => {
    const r = evaluateCheckpoint(
      {
        criteria: [STATUS_IN_DONE],
        deadline: new Date('2026-05-23T00:00:00Z'),
        warningDays: 3,
        issues: [issue({ statusCategory: 'IN_PROGRESS' })],
        context: CONTEXT,
      },
      new Date('2026-05-15T00:00:00Z'), // 8 days before
    );
    expect(r.isWarning).toBe(false);
  });

  it('AND across criteria: one failing criterion marks the issue violated', () => {
    const r = evaluateCheckpoint(
      {
        criteria: [STATUS_IN_DONE, { type: 'ASSIGNEE_SET' }],
        deadline: new Date('2026-05-23T00:00:00Z'),
        warningDays: 3,
        issues: [
          // status OK, assignee null → violates because of ASSIGNEE_SET
          issue({ id: 'x', key: 'X', statusCategory: 'DONE', assigneeId: null }),
        ],
        context: CONTEXT,
      },
      new Date('2026-05-20T00:00:00Z'),
    );
    expect(r.breakdown).toEqual({ applicable: 1, passed: 0, violated: 1 });
    expect(r.violations[0]!.criterionType).toBe('ASSIGNEE_SET');
  });

  it('concatenates reasons when multiple criteria fail on the same issue', () => {
    const r = evaluateCheckpoint(
      {
        criteria: [STATUS_IN_DONE, { type: 'ASSIGNEE_SET' }],
        deadline: new Date('2026-05-23T00:00:00Z'),
        warningDays: 3,
        issues: [
          issue({ id: 'x', key: 'X', statusCategory: 'IN_PROGRESS', assigneeId: null }),
        ],
        context: CONTEXT,
      },
      new Date('2026-05-20T00:00:00Z'),
    );
    expect(r.violations[0]!.reason).toContain(';');
    expect(r.violations[0]!.reason).toMatch(/Статус|Исполнитель/);
  });

  it('excludes inapplicable issues from the applicable set', () => {
    const r = evaluateCheckpoint(
      {
        criteria: [{ type: 'ASSIGNEE_SET', issueTypes: ['BUG'] }],
        deadline: new Date('2026-05-23T00:00:00Z'),
        warningDays: 3,
        issues: [
          issue({ id: 'bug1', issueTypeSystemKey: 'BUG', assigneeId: 'u1' }),
          issue({ id: 'task1', issueTypeSystemKey: 'TASK', assigneeId: null }),
        ],
        context: CONTEXT,
      },
      new Date('2026-05-20T00:00:00Z'),
    );
    expect(r.applicableIssueIds).toEqual(['bug1']);
    expect(r.passedIssueIds).toEqual(['bug1']);
  });
});

// ─── violationsHash stability ────────────────────────────────────────────────

describe('computeViolationsHash', () => {
  it('returns an empty string for no violations', () => {
    expect(computeViolationsHash([])).toBe('');
  });

  it('is stable across permutations of the input', () => {
    const a = {
      issueId: 'i1',
      issueKey: 'A',
      issueTitle: 'T',
      reason: 'r',
      criterionType: 'STATUS_IN' as const,
    };
    const b = {
      issueId: 'i2',
      issueKey: 'B',
      issueTitle: 'T',
      reason: 'r',
      criterionType: 'STATUS_IN' as const,
    };
    expect(computeViolationsHash([a, b])).toBe(computeViolationsHash([b, a]));
  });

  it('differs when the reason text changes', () => {
    const base = {
      issueId: 'i1',
      issueKey: 'A',
      issueTitle: 'T',
      reason: 'r',
      criterionType: 'STATUS_IN' as const,
    };
    const mutated = { ...base, reason: 'different' };
    expect(computeViolationsHash([base])).not.toBe(computeViolationsHash([mutated]));
  });

  it('is insensitive to issueKey/issueTitle changes (avoid spurious writes on rename)', () => {
    const base = {
      issueId: 'i1',
      issueKey: 'OLD-1',
      issueTitle: 'Old title',
      reason: 'r',
      criterionType: 'STATUS_IN' as const,
    };
    const renamed = { ...base, issueKey: 'NEW-42', issueTitle: 'New title' };
    expect(computeViolationsHash([base])).toBe(computeViolationsHash([renamed]));
  });
});

// ─── computeReleaseRisk ──────────────────────────────────────────────────────

describe('computeReleaseRisk', () => {
  it('empty checkpoint set → LOW, score 0', () => {
    expect(computeReleaseRisk([])).toEqual({ score: 0, level: 'LOW' });
  });

  it('all OK → LOW, score 0', () => {
    expect(
      computeReleaseRisk([
        { weight: 'CRITICAL', state: 'OK' },
        { weight: 'HIGH', state: 'OK' },
      ]),
    ).toEqual({ score: 0, level: 'LOW' });
  });

  it('PENDING without VIOLATED → LOW', () => {
    expect(
      computeReleaseRisk([
        { weight: 'HIGH', state: 'PENDING' },
        { weight: 'MEDIUM', state: 'OK' },
      ]),
    ).toEqual({ score: 0, level: 'LOW' });
  });

  it('any non-zero violation ratio exits LOW (single LOW violation in 100 LOW checkpoints)', () => {
    const many: CheckpointForRiskLocal[] = Array.from({ length: 100 }).map(() => ({
      weight: 'LOW',
      state: 'OK',
    }));
    many[0]!.state = 'VIOLATED';
    const r = computeReleaseRisk(many);
    expect(r.score).toBe(0.01);
    expect(r.level).toBe('MEDIUM');
  });

  it('MEDIUM band: a low-weight violation inside a heavy set', () => {
    // total = 8 + 1 = 9; violated = 1; score ≈ 0.111 → MEDIUM
    const r = computeReleaseRisk([
      { weight: 'CRITICAL', state: 'OK' },
      { weight: 'LOW', state: 'VIOLATED' },
    ]);
    expect(r.level).toBe('MEDIUM');
    expect(r.score).toBeCloseTo(1 / 9, 5);
  });

  it('HIGH band: violation ratio inside (0.30, 0.70]', () => {
    // total = 4 + 2 = 6; violated = 2; score ≈ 0.333 → HIGH
    const r = computeReleaseRisk([
      { weight: 'HIGH', state: 'OK' },
      { weight: 'MEDIUM', state: 'VIOLATED' },
    ]);
    expect(r.level).toBe('HIGH');
  });

  it('CRITICAL band: violation ratio > 0.70', () => {
    const r = computeReleaseRisk([
      { weight: 'CRITICAL', state: 'VIOLATED' },
      { weight: 'LOW', state: 'OK' },
    ]);
    // 8 / 9 ≈ 0.888 → CRITICAL
    expect(r.level).toBe('CRITICAL');
  });

  it('CRITICAL band: all checkpoints violated → score 1.0', () => {
    const r = computeReleaseRisk([
      { weight: 'HIGH', state: 'VIOLATED' },
      { weight: 'LOW', state: 'VIOLATED' },
    ]);
    expect(r.score).toBe(1);
    expect(r.level).toBe('CRITICAL');
  });

  it('boundary: score exactly 0.30 lands in MEDIUM, 0.70 in HIGH', () => {
    // 2 MEDIUM + 2 HIGH + 1 CRITICAL — violated: one MEDIUM → 2/18 = 0.111 (MEDIUM).
    // Explicit exact boundary test: need score === 0.30. 3/10 = 0.30.
    // Weight LOW=1, MEDIUM=2. Build 10 LOWs with 3 VIOLATED.
    const ten = Array.from({ length: 10 }).map<CheckpointForRiskLocal>(() => ({
      weight: 'LOW',
      state: 'OK',
    }));
    for (let i = 0; i < 3; i++) ten[i]!.state = 'VIOLATED';
    expect(computeReleaseRisk(ten).level).toBe('MEDIUM');

    // 7/10 = 0.70 → HIGH
    for (let i = 3; i < 7; i++) ten[i]!.state = 'VIOLATED';
    expect(computeReleaseRisk(ten).level).toBe('HIGH');
  });
});
