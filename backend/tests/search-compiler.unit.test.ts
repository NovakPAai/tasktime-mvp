/**
 * TTSRH-1 PR-4 — unit tests for the pure TTS-QL compiler.
 *
 * Covers T-2 from §6 ТЗ: per-field × per-operator matrix with 60+ cases, plus
 * scope-filter (R3), boolean precedence, function-result splicing, and custom-
 * field predicate emission. All tests run without a database — function values
 * and custom fields are injected via the `CompileContext`.
 */
import { describe, expect, it } from 'vitest';
import { parse } from '../src/modules/search/search.parser.js';
import { assertNoUnresolvedPlaceholders, compile, PLACEHOLDER_KEY, type CompileResult } from '../src/modules/search/search.compiler.js';
import type { CompileContext, ResolvedFunctions } from '../src/modules/search/search.compile-context.js';
import { buildFunctionCallKey } from '../src/modules/search/search.compile-context.js';
import type { CustomFieldDef } from '../src/modules/search/search.schema.js';

const ANCHOR = new Date(Date.UTC(2026, 3, 15, 12, 0, 0, 0));
const PROJECTS: readonly string[] = ['proj-a', 'proj-b', 'proj-c'];

// Default context with no function resolutions — good for pure-field tests.
function makeCtx(overrides: Partial<CompileContext> = {}): CompileContext {
  return {
    accessibleProjectIds: PROJECTS,
    referenceValues: new Map(),
    customFields: [],
    resolved: { currentUserId: 'user-1', calls: new Map() },
    now: ANCHOR,
    variant: 'default',
    ...overrides,
  };
}

function compileFromSource(src: string, ctx?: CompileContext): CompileResult {
  const { ast, errors } = parse(src);
  if (!ast) throw new Error(`Parser failed for \`${src}\`: ${errors.map((e) => e.code).join(',')}`);
  return compile(ast, ctx ?? makeCtx());
}

function topScope(result: CompileResult): unknown {
  const where = result.where as Record<string, unknown>;
  if (Array.isArray(where.AND)) return where.AND[0];
  return where;
}

function innerWhere(result: CompileResult): unknown {
  const where = result.where as Record<string, unknown>;
  if (Array.isArray(where.AND)) return where.AND[1];
  return null;
}

// ─── Scope filter (R3) ──────────────────────────────────────────────────────

describe('compiler — scope filter (R3)', () => {
  it('empty query produces the scope filter and nothing else', () => {
    const r = compileFromSource('');
    expect(r.where).toEqual({ projectId: { in: [...PROJECTS] } });
  });

  it('scope filter is always the top-level AND prefix', () => {
    const r = compileFromSource('priority = HIGH');
    expect(topScope(r)).toEqual({ projectId: { in: [...PROJECTS] } });
  });

  it('no accessible projects → scope is empty; query matches nothing', () => {
    const r = compileFromSource('priority = HIGH', makeCtx({ accessibleProjectIds: [] }));
    expect(topScope(r)).toEqual({ projectId: { in: [] } });
  });
});

// ─── reference value → id translation ──────────────────────────────────────

describe('compiler — reference fields translate user-facing values to row ids', () => {
  const refs = (entries: Record<string, Record<string, string>>): Map<string, Map<string, string>> =>
    new Map(Object.entries(entries).map(([k, v]) => [k, new Map(Object.entries(v))]));

  it('project = "TTMP" → projectId = <uuid>', () => {
    const r = compileFromSource('project = "TTMP"', makeCtx({
      referenceValues: refs({ project: { ttmp: 'proj-a' } }),
    }));
    expect(innerWhere(r)).toEqual({ projectId: 'proj-a' });
  });

  it('assignee = "alice@x.com" → assigneeId = <uuid>', () => {
    const r = compileFromSource('assignee = "alice@x.com"', makeCtx({
      referenceValues: refs({ assignee: { 'alice@x.com': 'user-1' } }),
    }));
    expect(innerWhere(r)).toEqual({ assigneeId: 'user-1' });
  });

  it('sprint IN ("Sprint 1", "Sprint 2") → sprintId IN [<uuids>]', () => {
    const r = compileFromSource('sprint IN ("Sprint 1", "Sprint 2")', makeCtx({
      referenceValues: refs({ sprint: { 'sprint 1': 's-1', 'sprint 2': 's-2' } }),
    }));
    expect(innerWhere(r)).toEqual({ sprintId: { in: ['s-1', 's-2'] } });
  });

  it('type = BUG (ident) → issueTypeConfigId = <uuid>', () => {
    const r = compileFromSource('type = BUG', makeCtx({
      referenceValues: refs({ type: { bug: 'type-bug' } }),
    }));
    expect(innerWhere(r)).toEqual({ issueTypeConfigId: 'type-bug' });
  });

  it('parent = "TTMP-123" → parentId = <uuid>', () => {
    const r = compileFromSource('parent = "TTMP-123"', makeCtx({
      referenceValues: refs({ parent: { 'ttmp-123': 'issue-1' } }),
    }));
    expect(innerWhere(r)).toEqual({ parentId: 'issue-1' });
  });

  it('release = "v1.0" → releaseId = <uuid>', () => {
    const r = compileFromSource('release = "v1.0"', makeCtx({
      referenceValues: refs({ release: { 'v1.0': 'rel-1' } }),
    }));
    expect(innerWhere(r)).toEqual({ releaseId: 'rel-1' });
  });

  it('unknown value falls through (scope filter then yields zero rows)', () => {
    const r = compileFromSource('project = "UNKNOWN"', makeCtx({
      referenceValues: refs({ project: { ttmp: 'proj-a' } }),
    }));
    expect(innerWhere(r)).toEqual({ projectId: 'UNKNOWN' });
  });

  it('UUID literal passes through unchanged (empty map, backward compat)', () => {
    const r = compileFromSource('assignee = "user-42"', makeCtx());
    expect(innerWhere(r)).toEqual({ assigneeId: 'user-42' });
  });
});

// ─── Compare operators (system fields) ─────────────────────────────────────

describe('compiler — compare operators on system fields', () => {
  it.each([
    ['priority = HIGH', { priority: 'HIGH' }],
    ['priority != HIGH', { priority: { not: 'HIGH' } }],
    ['status = OPEN', { status: 'OPEN' }],
    ['type = EPIC', { issueTypeConfigId: 'EPIC' }],
  ])('%s → %j', (src, expected) => {
    const r = compileFromSource(src);
    expect(innerWhere(r)).toEqual(expected);
  });

  it.each([
    ['estimatedHours = 5', { estimatedHours: 5 }],
    ['estimatedHours != 5', { estimatedHours: { not: 5 } }],
    ['estimatedHours > 5', { estimatedHours: { gt: 5 } }],
    ['estimatedHours >= 5', { estimatedHours: { gte: 5 } }],
    ['estimatedHours < 5', { estimatedHours: { lt: 5 } }],
    ['estimatedHours <= 5', { estimatedHours: { lte: 5 } }],
    ['orderIndex > 100', { orderIndex: { gt: 100 } }],
  ])('numeric compare: %s', (src, expected) => {
    const r = compileFromSource(src);
    expect(innerWhere(r)).toEqual(expected);
  });

  it.each([
    ['due >= "2026-01-01"', 'dueDate', 'gte'],
    ['created < "2026-06-01"', 'createdAt', 'lt'],
  ])('date compare: %s uses Prisma filter on %s', (src, col, op) => {
    const r = compileFromSource(src);
    const inner = innerWhere(r) as Record<string, unknown>;
    expect(inner).toHaveProperty(col);
    const filter = inner[col] as Record<string, unknown>;
    expect(filter).toHaveProperty(op);
    expect(filter[op]).toBeInstanceOf(Date);
  });

  it.each([
    ['summary ~ "hello"', 'title', 'contains', 'hello'],
    ['summary !~ "hello"', 'title', 'contains', 'hello'],
    ['description ~ "world"', 'description', 'contains', 'world'],
  ])('text contains: %s', (src, col, key, val) => {
    const r = compileFromSource(src);
    let inner = innerWhere(r) as Record<string, unknown>;
    if (typeof inner === 'object' && 'NOT' in inner) inner = inner.NOT as Record<string, unknown>;
    const filter = inner[col] as Record<string, unknown>;
    expect(filter[key]).toBe(val);
    expect(filter['mode']).toBe('insensitive');
  });
});

// ─── IN / NOT IN ────────────────────────────────────────────────────────────

describe('compiler — IN / NOT IN', () => {
  it('IN with idents', () => {
    const r = compileFromSource('status IN (OPEN, IN_PROGRESS)');
    expect(innerWhere(r)).toEqual({ status: { in: ['OPEN', 'IN_PROGRESS'] } });
  });

  it('NOT IN', () => {
    const r = compileFromSource('status NOT IN (DONE, CANCELLED)');
    expect(innerWhere(r)).toEqual({ NOT: { status: { in: ['DONE', 'CANCELLED'] } } });
  });

  it('IN with strings', () => {
    const r = compileFromSource('priority IN ("HIGH", "CRITICAL")');
    expect(innerWhere(r)).toEqual({ priority: { in: ['HIGH', 'CRITICAL'] } });
  });
});

// ─── IS EMPTY / IS NOT EMPTY ────────────────────────────────────────────────

describe('compiler — IS EMPTY / IS NOT EMPTY', () => {
  it.each([
    ['assignee IS EMPTY', { assigneeId: null }],
    ['assignee IS NOT EMPTY', { assigneeId: { not: null } }],
    ['due IS EMPTY', { dueDate: null }],
    ['sprint IS NOT NULL', { sprintId: { not: null } }],
  ])('%s', (src, expected) => {
    const r = compileFromSource(src);
    expect(innerWhere(r)).toEqual(expected);
  });
});

// ─── Boolean operators ──────────────────────────────────────────────────────

describe('compiler — boolean structure', () => {
  it('AND produces Prisma AND', () => {
    const r = compileFromSource('priority = HIGH AND status = OPEN');
    const inner = innerWhere(r) as Record<string, unknown>;
    expect(inner).toHaveProperty('AND');
    expect((inner.AND as unknown[]).length).toBe(2);
  });

  it('OR produces Prisma OR', () => {
    const r = compileFromSource('priority = HIGH OR priority = CRITICAL');
    const inner = innerWhere(r) as Record<string, unknown>;
    expect(inner).toHaveProperty('OR');
  });

  it('NOT wraps child', () => {
    const r = compileFromSource('NOT status = DONE');
    const inner = innerWhere(r) as Record<string, unknown>;
    expect(inner).toHaveProperty('NOT');
    expect(inner.NOT).toEqual({ status: 'DONE' });
  });

  it('precedence: NOT a = 1 AND b = 2', () => {
    const r = compileFromSource('NOT priority = HIGH AND status = OPEN');
    const inner = innerWhere(r) as Record<string, unknown>;
    expect(inner.AND).toHaveLength(2);
    expect((inner.AND as Record<string, unknown>[])[0]).toHaveProperty('NOT');
  });

  it('parens override: NOT (a OR b)', () => {
    const r = compileFromSource('NOT (status = DONE OR status = CANCELLED)');
    const inner = innerWhere(r) as Record<string, unknown>;
    expect(inner).toHaveProperty('NOT');
    const child = inner.NOT as Record<string, unknown>;
    expect(child).toHaveProperty('OR');
  });
});

// ─── Function values ────────────────────────────────────────────────────────

describe('compiler — function values', () => {
  it('currentUser() maps to ctx.resolved.currentUserId', () => {
    const r = compileFromSource('assignee = currentUser()');
    expect(innerWhere(r)).toEqual({ assigneeId: 'user-1' });
  });

  it('pure date: due <= startOfDay("-7d")', () => {
    const r = compileFromSource('due <= startOfDay("-7d")');
    const inner = innerWhere(r) as Record<string, { lte: Date }>;
    expect(inner.dueDate.lte).toBeInstanceOf(Date);
    const expected = new Date(ANCHOR);
    expected.setUTCDate(expected.getUTCDate() - 7);
    expected.setUTCHours(0, 0, 0, 0);
    expect(inner.dueDate.lte.toISOString()).toBe(expected.toISOString());
  });

  it('relative date literal: updated >= "-1d"', () => {
    const r = compileFromSource('updated >= "-1d"');
    const inner = innerWhere(r) as Record<string, { gte: Date }>;
    const expected = new Date(ANCHOR);
    expected.setUTCDate(expected.getUTCDate() - 1);
    expect(inner.updatedAt.gte.toISOString()).toBe(expected.toISOString());
  });

  it('sprint IN openSprints() with pre-resolved ids', () => {
    const resolved: ResolvedFunctions = {
      currentUserId: 'user-1',
      calls: new Map([[buildFunctionCallKey('opensprints', []), { kind: 'id-list', ids: ['s1', 's2'] }]]),
    };
    const r = compileFromSource('sprint IN openSprints()', makeCtx({ resolved }));
    expect(innerWhere(r)).toEqual({ sprintId: { in: ['s1', 's2'] } });
  });

  it('empty id-list → MATCH_NONE', () => {
    const resolved: ResolvedFunctions = {
      currentUserId: 'user-1',
      calls: new Map([[buildFunctionCallKey('opensprints', []), { kind: 'id-list', ids: [] }]]),
    };
    const r = compileFromSource('sprint IN openSprints()', makeCtx({ resolved }));
    expect(innerWhere(r)).toEqual({ id: { in: [] } });
  });

  it('unresolved function → error + MATCH_NONE', () => {
    const r = compileFromSource('sprint IN futureSprints()'); // ctx has no resolution
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.errors[0]!.code).toBe('UNRESOLVED_FUNCTION');
    expect(innerWhere(r)).toEqual({ id: { in: [] } });
  });
});

// ─── ORDER BY ───────────────────────────────────────────────────────────────

describe('compiler — ORDER BY', () => {
  it('single DESC', () => {
    const r = compileFromSource('priority = HIGH ORDER BY priority DESC');
    expect(r.orderBy).toEqual([{ priority: 'desc' }]);
  });

  it('multiple', () => {
    const r = compileFromSource('x = 1 ORDER BY priority DESC, updated ASC');
    // `x = 1` is an unknown system field → compiler emits UNRESOLVED_FIELD error,
    // but ORDER BY still compiles (it's parsed independently).
    expect(r.orderBy).toEqual([{ priority: 'desc' }, { updatedAt: 'asc' }]);
  });

  it('non-sortable field is silently dropped (validator already warned)', () => {
    const r = compileFromSource('description ~ "x" ORDER BY description');
    expect(r.orderBy).toEqual([]);
  });
});

// ─── Custom fields ──────────────────────────────────────────────────────────

describe('compiler — custom fields', () => {
  const storyPoints: CustomFieldDef = {
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    name: 'Story Points',
    type: 'NUMBER',
    fieldType: 'NUMBER',
    operators: ['EQ', 'NEQ', 'GT', 'GTE', 'LT', 'LTE', 'IS_EMPTY', 'IS_NOT_EMPTY'],
    sortable: false,
  };

  const releaseStatus: CustomFieldDef = {
    id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    name: 'Release Status',
    type: 'TEXT',
    fieldType: 'TEXT',
    operators: ['EQ', 'NEQ', 'CONTAINS', 'NOT_CONTAINS', 'IS_EMPTY', 'IS_NOT_EMPTY'],
    sortable: false,
  };

  it('resolves by quoted name and produces a predicate', () => {
    const r = compileFromSource('"Story Points" > 5', makeCtx({ customFields: [storyPoints] }));
    expect(r.customPredicates).toHaveLength(1);
    const pred = r.customPredicates[0]!;
    expect(pred.customFieldId).toBe(storyPoints.id);
    expect(pred.negated).toBe(false);
    // The raw SQL should mention the CF id via parameterised `::uuid` cast.
    const { sql } = pred.rawSql;
    expect(sql).toMatch(/issue_custom_field_values/);
    expect(sql).toMatch(/::uuid/);
    expect(sql).toMatch(/::numeric/);
  });

  it('resolves by cf[UUID]', () => {
    const r = compileFromSource(
      `cf[aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa] = 5`,
      makeCtx({ customFields: [storyPoints] }),
    );
    expect(r.customPredicates).toHaveLength(1);
    expect(r.customPredicates[0]!.customFieldId).toBe(storyPoints.id);
  });

  it('IN (list) produces a single IN predicate', () => {
    const r = compileFromSource(
      `"Story Points" IN (3, 5, 8)`,
      makeCtx({ customFields: [storyPoints] }),
    );
    expect(r.customPredicates).toHaveLength(1);
  });

  it('NOT IN sets the negated flag', () => {
    const r = compileFromSource(
      `"Story Points" NOT IN (3, 5, 8)`,
      makeCtx({ customFields: [storyPoints] }),
    );
    expect(r.customPredicates[0]!.negated).toBe(true);
  });

  it('text ~ emits ILIKE', () => {
    const r = compileFromSource(
      `"Release Status" ~ "done"`,
      makeCtx({ customFields: [releaseStatus] }),
    );
    expect(r.customPredicates).toHaveLength(1);
    expect(r.customPredicates[0]!.rawSql.sql).toMatch(/ILIKE/);
  });

  it('IS EMPTY emits NOT EXISTS form', () => {
    const r = compileFromSource(
      `"Story Points" IS EMPTY`,
      makeCtx({ customFields: [storyPoints] }),
    );
    expect(r.customPredicates[0]!.rawSql.sql).toMatch(/NOT EXISTS/);
  });

  it('unknown cf[UUID] produces an UNRESOLVED_FIELD error', () => {
    const r = compileFromSource(
      `cf[99999999-9999-9999-9999-999999999999] = 5`,
      makeCtx({ customFields: [storyPoints] }),
    );
    expect(r.errors[0]?.code).toBe('UNRESOLVED_FIELD');
  });

  // Pre-push review found a silent bug: `value @> to_jsonb(text)` on the outer
  // wrapper `{ "v": [...] }` is always false. The fix descends into `value->'v'`.
  it('LABEL/MULTI_SELECT: JSON containment uses `value->\'v\'`, not outer wrapper', () => {
    const labelField: CustomFieldDef = {
      id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
      name: 'Priority Tags',
      type: 'LABEL',
      fieldType: 'LABEL',
      operators: ['EQ', 'NEQ', 'IN', 'NOT_IN', 'IS_EMPTY', 'IS_NOT_EMPTY'],
      sortable: false,
    };
    // `=` path
    const eq = compileFromSource(
      `"Priority Tags" = "bug"`,
      makeCtx({ customFields: [labelField] }),
    );
    expect(eq.customPredicates[0]!.rawSql.sql).toMatch(/value->'v'[^@]*@>/);
    // `IN` path
    const inRes = compileFromSource(
      `"Priority Tags" IN ("bug", "hotfix")`,
      makeCtx({ customFields: [labelField] }),
    );
    expect(inRes.customPredicates[0]!.rawSql.sql).toMatch(/value->'v'[^@]*@>/);
  });
});

// ─── Placeholder guard ──────────────────────────────────────────────────────

describe('compiler — assertNoUnresolvedPlaceholders', () => {
  it('throws when the placeholder key leaks to Prisma', () => {
    expect(() =>
      assertNoUnresolvedPlaceholders({ [PLACEHOLDER_KEY]: 'cf_0' } as unknown as Parameters<typeof assertNoUnresolvedPlaceholders>[0]),
    ).toThrow(/unresolved TTS-QL custom-field placeholder/);
  });

  it('passes for a substituted where-input', () => {
    expect(() =>
      assertNoUnresolvedPlaceholders({ id: { in: ['issue-a', 'issue-b'] } }),
    ).not.toThrow();
  });
});

// ─── Derived fields: statusCategory + labels ───────────────────────────────

describe('compiler — statusCategory (derived from Issue.status)', () => {
  it('EQ DONE expands to IssueStatus IN [DONE, CANCELLED]', () => {
    const r = compileFromSource('statusCategory = DONE');
    expect(r.errors).toEqual([]);
    const inner = innerWhere(r) as { status: { in: string[] } };
    expect(inner.status.in).toEqual(['DONE', 'CANCELLED']);
  });

  it('EQ IN_PROGRESS expands to [IN_PROGRESS, REVIEW]', () => {
    const r = compileFromSource('statusCategory = IN_PROGRESS');
    expect(r.errors).toEqual([]);
    const inner = innerWhere(r) as { status: { in: string[] } };
    expect(inner.status.in).toEqual(['IN_PROGRESS', 'REVIEW']);
  });

  it('EQ TODO expands to [OPEN]', () => {
    const r = compileFromSource('statusCategory = TODO');
    expect(r.errors).toEqual([]);
    const inner = innerWhere(r) as { status: { in: string[] } };
    expect(inner.status.in).toEqual(['OPEN']);
  });

  it('NEQ wraps in NOT', () => {
    const r = compileFromSource('statusCategory != DONE');
    expect(r.errors).toEqual([]);
    const inner = innerWhere(r) as { NOT: { status: { in: string[] } } };
    expect(inner.NOT.status.in).toEqual(['DONE', 'CANCELLED']);
  });

  it('IN (...) deduplicates across category expansions', () => {
    const r = compileFromSource('statusCategory IN (TODO, DONE)');
    expect(r.errors).toEqual([]);
    const inner = innerWhere(r) as { status: { in: string[] } };
    expect(inner.status.in).toEqual(['OPEN', 'DONE', 'CANCELLED']);
  });

  it('NOT IN wraps in NOT', () => {
    const r = compileFromSource('statusCategory NOT IN (DONE)');
    expect(r.errors).toEqual([]);
    const inner = innerWhere(r) as { NOT: { status: { in: string[] } } };
    expect(inner.NOT.status.in).toEqual(['DONE', 'CANCELLED']);
  });

  it('IS EMPTY → MATCH_NONE (status is always populated)', () => {
    const r = compileFromSource('statusCategory IS EMPTY');
    expect(r.errors).toEqual([]);
    expect(innerWhere(r)).toEqual({ id: { in: [] } });
  });

  it('IS NOT EMPTY → MATCH_ALL', () => {
    const r = compileFromSource('statusCategory IS NOT EMPTY');
    expect(r.errors).toEqual([]);
    // MATCH_ALL collapses the inner AND child to `{}`, surfacing as just the scope.
    expect(innerWhere(r)).toEqual({});
  });

  it('unknown category → UNRESOLVED_VALUE', () => {
    const r = compileFromSource('statusCategory = BOGUS');
    expect(r.errors[0]?.code).toBe('UNRESOLVED_VALUE');
    expect(innerWhere(r)).toEqual({ id: { in: [] } });
  });

  it('category synonym resolves via registry alias', () => {
    // Registry declares `category` as synonym of `statuscategory`.
    const r = compileFromSource('category = DONE');
    expect(r.errors).toEqual([]);
    const inner = innerWhere(r) as { status: { in: string[] } };
    expect(inner.status.in).toEqual(['DONE', 'CANCELLED']);
  });
});

describe('compiler — labels (routed to LABEL custom field)', () => {
  const labelCf: CustomFieldDef = {
    id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
    name: 'Labels',
    type: 'LABEL',
    fieldType: 'LABEL',
    operators: ['EQ', 'NEQ', 'IN', 'NOT_IN', 'IS_EMPTY', 'IS_NOT_EMPTY'],
    sortable: false,
  };

  it('`labels IN (...)` delegates to the first LABEL custom field → emits predicate', () => {
    const r = compileFromSource(
      'labels IN ("backend", "security")',
      makeCtx({ customFields: [labelCf] }),
    );
    expect(r.errors).toEqual([]);
    expect(r.customPredicates).toHaveLength(1);
    expect(r.customPredicates[0]!.customFieldId).toBe(labelCf.id);
  });

  it('`label = "urgent"` (singular synonym) also delegates', () => {
    const r = compileFromSource('label = "urgent"', makeCtx({ customFields: [labelCf] }));
    expect(r.errors).toEqual([]);
    expect(r.customPredicates).toHaveLength(1);
  });

  it('no LABEL custom field in workspace → MATCH_NONE + warning, no error', () => {
    const r = compileFromSource('labels IN ("a")', makeCtx({ customFields: [] }));
    expect(r.errors).toEqual([]);
    expect(r.warnings[0]?.field).toBe('labels');
    expect(innerWhere(r)).toEqual({ id: { in: [] } });
  });
});

// ─── Error paths ────────────────────────────────────────────────────────────

describe('compiler — error paths', () => {
  it('unknown field → UNRESOLVED_FIELD + MATCH_NONE', () => {
    const r = compileFromSource('bogusField = 1');
    expect(r.errors[0]?.code).toBe('UNRESOLVED_FIELD');
    expect(innerWhere(r)).toEqual({ id: { in: [] } });
  });

  it('never throws on structural corner cases', () => {
    // The compiler must be robust on any AST the parser produces. Round-trip a
    // handful of edge cases through the full pipeline.
    for (const src of [
      '',
      'NOT NOT priority = HIGH',
      '(((priority = HIGH)))',
      'status IN (OPEN) OR (priority = HIGH AND due IS NOT EMPTY)',
    ]) {
      expect(() => compileFromSource(src)).not.toThrow();
    }
  });
});

// ─── Property-based: fuzz parse → compile ───────────────────────────────────

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('compiler — property-based fuzz', () => {
  it('500 random parseable queries compile without throwing', () => {
    const rng = mulberry32(0xdecaf);
    const fields = ['priority', 'status', 'assignee', 'due', 'estimatedHours', 'summary', 'description'];
    const ops = ['=', '!=', '>', '<', '>=', '<='];
    const values = ['HIGH', 'OPEN', 'CRITICAL', '"text"', '5', '"2026-01-01"', 'currentUser()'];
    const pick = <T>(arr: readonly T[]) => arr[Math.floor(rng() * arr.length)]!;

    let failures = 0;
    for (let i = 0; i < 500; i++) {
      const clauseCount = 1 + Math.floor(rng() * 4);
      const clauses: string[] = [];
      for (let k = 0; k < clauseCount; k++) {
        clauses.push(`${pick(fields)} ${pick(ops)} ${pick(values)}`);
      }
      const connective = rng() < 0.5 ? ' AND ' : ' OR ';
      const src = clauses.join(connective);
      try {
        compileFromSource(src);
      } catch {
        failures++;
      }
    }
    expect(failures).toBe(0);
  });
});
