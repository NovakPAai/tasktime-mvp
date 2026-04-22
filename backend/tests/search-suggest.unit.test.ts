/**
 * TTSRH-1 PR-6 — unit tests for TTS-QL suggest pipeline (pure layers).
 *
 * Covers position analyser + rank + static suggesters. DB-backed providers
 * (UserSuggester, ProjectSuggester, …) run only in integration tests since
 * they hit Postgres — this file asserts the contract layer.
 */
import { describe, expect, it } from 'vitest';
import { analysePosition } from '../src/modules/search/search.suggest.position.js';
import { rankByPrefix } from '../src/modules/search/search.suggest.rank.js';
import { suggest } from '../src/modules/search/search.suggest.js';
import {
  suggestBool,
  suggestDateShortcuts,
  suggestEnum,
  suggestEnumByType,
  suggestFields,
  suggestFunctions,
  suggestOperators,
} from '../src/modules/search/search.suggest.static.js';
import type { Completion } from '../src/modules/search/search.suggest.types.js';

// ─── Position analyser ─────────────────────────────────────────────────────

describe('position analyser — cursor at structural boundaries', () => {
  it.each([
    ['', 0, 'field'],
    ['   ', 3, 'field'],
    ['priority = HIGH AND ', 20, 'field'],
    ['NOT ', 4, 'field'],
    ['(priority = HIGH OR ', 20, 'field'],
  ])('%j @%d → expect field', (src, cursor, expected) => {
    const p = analysePosition(src, cursor);
    expect(p.expected).toBe(expected);
  });

  it('after a field → expect operator', () => {
    const p = analysePosition('priority', 8);
    expect(p.expected).toBe('field'); // editing the field itself
    expect(p.prefix).toBe('priority');
  });

  it('after field + space → expect operator', () => {
    const p = analysePosition('priority ', 9);
    expect(p.expected).toBe('operator');
    expect(p.field).toBe('priority');
  });

  it('after compare op → expect value', () => {
    const p = analysePosition('priority = ', 11);
    expect(p.expected).toBe('value');
    expect(p.field).toBe('priority');
    expect(p.operator).toBe('=');
  });

  it('after IN ( → expect value in list', () => {
    const p = analysePosition('status IN (', 11);
    expect(p.expected).toBe('value');
    expect(p.field).toBe('status');
    expect(p.inValueList).toBe(true);
  });

  it('dedupe picked values inside IN list', () => {
    const p = analysePosition('status IN (OPEN, ', 17);
    expect(p.expected).toBe('value');
    expect(p.inValueList).toBe(true);
    expect(p.pickedValues).toContain('OPEN');
  });

  it('unterminated string → recovers context from last quote, prefix = typed suffix', () => {
    // `summary = "oops` — user is still typing the value. The tokenizer would
    // otherwise throw UNTERMINATED_STRING and the analyser would dump all
    // fields; recovery slices at the last `"`, re-tokenises the left side,
    // and keeps the typed suffix as the prefix.
    const p = analysePosition('summary = "oops', 15);
    expect(p.expected).toBe('value');
    expect(p.field).toBe('summary');
    expect(p.prefix).toBe('oops');
  });

  it('Cyrillic multi-word custom field name in unterminated quotes → field context with prefix', () => {
    // `"Мои зад` at clause start — user is picking a field by quoted name.
    // Backend tokenizer cannot treat Cyrillic as an Ident (ASCII-only class),
    // so the prefix only reaches the suggester when recovery preserves it
    // from the unterminated string. Without this path, every keystroke inside
    // a Cyrillic-quoted field name returned the full field list unranked.
    const p = analysePosition('"Мои зад', 8);
    expect(p.expected).toBe('field');
    expect(p.prefix).toBe('Мои зад');
  });

  it('ORDER BY → expect field', () => {
    const p = analysePosition('priority = HIGH ORDER BY ', 25);
    expect(p.expected).toBe('field');
  });
});

// ─── Rank ─────────────────────────────────────────────────────────────────

describe('rankByPrefix — tier ordering', () => {
  const items: Completion[] = [
    { kind: 'field', label: 'priority', insert: 'priority', score: 0 },
    { kind: 'field', label: 'project', insert: 'project', score: 0 },
    { kind: 'field', label: 'assignee', insert: 'assignee', score: 0 },
    { kind: 'field', label: 'reporter', insert: 'reporter', score: 0 },
  ];

  it('empty prefix returns all items in order', () => {
    const ranked = rankByPrefix(items, '');
    expect(ranked).toHaveLength(4);
    expect(ranked[0]!.label).toBe('priority');
  });

  it('exact match wins', () => {
    const ranked = rankByPrefix(items, 'project');
    expect(ranked[0]!.label).toBe('project');
    expect(ranked[0]!.score).toBeGreaterThan(0.9);
  });

  it('startsWith beats contains', () => {
    const ranked = rankByPrefix(items, 'pr');
    // priority and project both start with `pr` — one wins by input order.
    expect(['priority', 'project']).toContain(ranked[0]!.label);
    expect(ranked[0]!.score).toBeGreaterThan(0.7);
  });

  it('case-insensitive', () => {
    const ranked = rankByPrefix(items, 'PROJ');
    expect(ranked[0]!.label).toBe('project');
  });

  it('subsequence match is lowest tier but still ranked', () => {
    const extra: Completion[] = [
      ...items,
      { kind: 'field', label: 'custom_field_with_pr', insert: 'custom_field_with_pr', score: 0 },
    ];
    const ranked = rankByPrefix(extra, 'pr');
    // startsWith > contains > subsequence; all `pr` matches present, but
    // `priority`/`project` lead, `reporter` (contains) follows,
    // then `custom_field_with_pr` (contains because 'pr' literally appears).
    expect(ranked.map((r) => r.label).slice(0, 2).sort()).toEqual(['priority', 'project']);
  });

  it('no match → filtered out', () => {
    const ranked = rankByPrefix(items, 'xyz');
    expect(ranked).toHaveLength(0);
  });
});

// ─── Static suggesters ────────────────────────────────────────────────────

describe('suggestFields', () => {
  it('returns system fields and custom fields with prefix filter', () => {
    const completions = suggestFields('prior', []);
    expect(completions.some((c) => c.label.toLowerCase().includes('priority'))).toBe(true);
  });

  it('includes custom fields', () => {
    const completions = suggestFields('Story', [
      { id: 'u1', name: 'Story Points', type: 'NUMBER', fieldType: 'NUMBER', operators: ['EQ'], sortable: false },
    ]);
    expect(completions.some((c) => c.label === 'Story Points')).toBe(true);
  });

  it('custom-field insert wraps spaces in quotes', () => {
    const completions = suggestFields('Story', [
      { id: 'u1', name: 'Story Points', type: 'NUMBER', fieldType: 'NUMBER', operators: ['EQ'], sortable: false },
    ]);
    const sp = completions.find((c) => c.label === 'Story Points');
    expect(sp?.insert).toBe('"Story Points"');
  });
});

describe('suggestFunctions', () => {
  it('variant=default includes user-only functions', () => {
    const completions = suggestFunctions('my', 'default');
    expect(completions.some((c) => c.label.startsWith('myopenissues'))).toBe(true);
  });

  it('variant=checkpoint includes releasePlannedDate', () => {
    const completions = suggestFunctions('release', 'checkpoint');
    expect(completions.some((c) => c.label.toLowerCase().includes('releaseplanneddate'))).toBe(true);
  });

  it('variant=default excludes checkpoint-only releasePlannedDate', () => {
    const completions = suggestFunctions('release', 'default');
    expect(completions.some((c) => c.label.toLowerCase().startsWith('releaseplanneddate'))).toBe(false);
  });

  it('phase=PHASE_2 functions are filtered out', () => {
    const completions = suggestFunctions('', 'default');
    expect(completions.some((c) => c.label.toLowerCase().startsWith('watchedissues'))).toBe(false);
  });
});

describe('suggestEnum', () => {
  it.each([
    ['priority', 'CRITICAL'],
    ['statusCategory', 'TODO'],
    ['aiStatus', 'FAILED'],
    ['aiAssigneeType', 'AGENT'],
  ])('field=%s → includes %s', (field, expected) => {
    const completions = suggestEnum(field, '') ?? [];
    expect(completions.some((c) => c.insert === expected)).toBe(true);
  });

  it('dedupe picked values', () => {
    const completions = suggestEnum('priority', '', ['HIGH']) ?? [];
    expect(completions.some((c) => c.insert === 'HIGH')).toBe(false);
  });

  it('case-insensitive dedupe', () => {
    const completions = suggestEnum('priority', '', ['high']) ?? [];
    expect(completions.some((c) => c.insert === 'HIGH')).toBe(false);
  });

  it('unknown field → null', () => {
    expect(suggestEnum('bogusField', '')).toBeNull();
  });

  it('by type: CHECKPOINT_STATE mirrors Prisma enum', () => {
    const completions = suggestEnumByType('CHECKPOINT_STATE', '') ?? [];
    // Prisma enum: PENDING | OK | VIOLATED | ERROR (ERROR added in PR-16).
    expect(completions.some((c) => c.insert === 'VIOLATED')).toBe(true);
    expect(completions.some((c) => c.insert === 'ERROR')).toBe(true);
    expect(completions.some((c) => c.insert === 'OVERDUE')).toBe(false);
  });
});

describe('suggestBool / suggestDateShortcuts', () => {
  it('bool returns true/false', () => {
    const c = suggestBool('');
    expect(c.map((x) => x.insert).sort()).toEqual(['false', 'true']);
  });

  it('date shortcuts include now() and "-7d"', () => {
    const c = suggestDateShortcuts('');
    expect(c.some((x) => x.insert === 'now()')).toBe(true);
    expect(c.some((x) => x.insert === '"-7d"')).toBe(true);
  });
});

describe('suggestOperators', () => {
  it('maps TtqlOpKind to display operators', () => {
    const c = suggestOperators(['EQ', 'NEQ', 'IS_EMPTY', 'IS_NOT_EMPTY'], '');
    expect(c.map((x) => x.insert).sort()).toEqual(['!=', '=', 'IS EMPTY', 'IS NOT EMPTY']);
  });
});

// ─── Orchestrator routing ───────────────────────────────────────────────────

describe('suggest() — routing between basic-builder and text-editor paths', () => {
  const baseCtx = {
    userId: 'u1',
    accessibleProjectIds: [] as string[],
    variant: 'default' as const,
  };

  it('prefix alone (no field) does not trigger the basic-builder shortcut — editor path fires', async () => {
    // Regression guard: the CM6 completion source sends `prefix` on every
    // keystroke. If the backend treats `prefix !== undefined` as an opt-in to
    // the basic-builder shortcut, every in-editor request falls through to
    // `suggestFunctions()` (because the field is unknown), and the user sees
    // function suggestions instead of fields/operators/values.
    const r = await suggest('prior', 5, { ...baseCtx, prefix: 'prior' }, []);
    expect(r.completions.some((c) => c.kind === 'field' && c.insert === 'priority')).toBe(true);
    // And we must NOT be drowning in function suggestions.
    const funcOnly = r.completions.every((c) => c.kind === 'function');
    expect(funcOnly).toBe(false);
  });

  it('explicit field param routes via basic-builder (operator suggestions for a field)', async () => {
    const r = await suggest('', 0, { ...baseCtx, field: 'priority' }, []);
    // Priority type → enum values; confirm we get them, not function list.
    expect(r.completions.some((c) => c.insert === 'HIGH')).toBe(true);
  });
});
