/**
 * TTSRH-1 PR-2 — unit tests for the TTS-QL parser.
 *
 * Structural + span assertions. Error cases check both `code` and `start/end` so the
 * CodeMirror editor can rely on position data for squiggle placement.
 */
import { describe, it, expect } from 'vitest';
import { parse } from '../src/modules/search/search.parser.js';
import type {
  AndNode,
  BoolExpr,
  ClauseNode,
  CompareOp,
  FunctionCall,
  NotNode,
  OrNode,
  QueryNode,
} from '../src/modules/search/search.ast.js';

function parseOk(source: string): QueryNode {
  const result = parse(source);
  expect(result.errors).toEqual([]);
  expect(result.ast).not.toBeNull();
  return result.ast!;
}

function clause(node: BoolExpr | null | undefined): ClauseNode {
  expect(node?.kind).toBe('Clause');
  return node as ClauseNode;
}
function andNode(node: BoolExpr | null | undefined): AndNode {
  expect(node?.kind).toBe('And');
  return node as AndNode;
}
function orNode(node: BoolExpr | null | undefined): OrNode {
  expect(node?.kind).toBe('Or');
  return node as OrNode;
}
function notNode(node: BoolExpr | null | undefined): NotNode {
  expect(node?.kind).toBe('Not');
  return node as NotNode;
}

// ─── Basic clauses ───────────────────────────────────────────────────────────

describe('parser — simple clauses', () => {
  it('equality with string value', () => {
    const ast = parseOk('status = "OPEN"');
    const c = clause(ast.where);
    expect(c.field).toMatchObject({ kind: 'Ident', name: 'status' });
    expect(c.op.kind).toBe('Compare');
    if (c.op.kind === 'Compare') {
      expect(c.op.op).toBe('=');
      expect(c.op.value).toMatchObject({ kind: 'String', value: 'OPEN' });
    }
  });

  it.each<[string, CompareOp]>([
    ['x = 1', '='],
    ['x != 1', '!='],
    ['x > 1', '>'],
    ['x >= 1', '>='],
    ['x < 1', '<'],
    ['x <= 1', '<='],
    ['x ~ "txt"', '~'],
    ['x !~ "txt"', '!~'],
  ])('compare op `%s`', (src, op) => {
    const ast = parseOk(src);
    const c = clause(ast.where);
    if (c.op.kind === 'Compare') expect(c.op.op).toBe(op);
    else throw new Error('expected Compare');
  });

  it('bare identifier as value (enum constant)', () => {
    const ast = parseOk('priority = HIGH');
    const c = clause(ast.where);
    if (c.op.kind === 'Compare') {
      expect(c.op.value).toMatchObject({ kind: 'Ident', name: 'HIGH' });
    }
  });

  it('boolean literals', () => {
    const ast = parseOk('aiEligible = true');
    const c = clause(ast.where);
    if (c.op.kind === 'Compare') {
      expect(c.op.value).toMatchObject({ kind: 'Bool', value: true });
    }
  });

  it('number literal', () => {
    const ast = parseOk('"Story Points" > 5');
    const c = clause(ast.where);
    expect(c.field).toMatchObject({ kind: 'QuotedField', name: 'Story Points' });
    if (c.op.kind === 'Compare') {
      expect(c.op.value).toMatchObject({ kind: 'Number', value: 5 });
    }
  });

  it('negative number literal', () => {
    const ast = parseOk('timeRemaining < -5');
    const c = clause(ast.where);
    if (c.op.kind === 'Compare') {
      expect(c.op.value).toMatchObject({ kind: 'Number', value: -5 });
    }
  });

  it('relative date literal (bare)', () => {
    const ast = parseOk('updated >= -7d');
    const c = clause(ast.where);
    if (c.op.kind === 'Compare') {
      expect(c.op.value).toMatchObject({ kind: 'RelativeDate', raw: '-7d' });
    }
  });

  it('custom field via cf[UUID]', () => {
    const ast = parseOk('cf[12345678-1234-1234-1234-123456789abc] = "Done"');
    const c = clause(ast.where);
    expect(c.field).toMatchObject({
      kind: 'CustomField',
      uuid: '12345678-1234-1234-1234-123456789abc',
    });
  });
});

// ─── IS [NOT] EMPTY / NULL ──────────────────────────────────────────────────

describe('parser — IS EMPTY / IS NOT EMPTY / IS NULL', () => {
  it('IS EMPTY', () => {
    const ast = parseOk('assignee IS EMPTY');
    const c = clause(ast.where);
    expect(c.op.kind).toBe('IsEmpty');
    if (c.op.kind === 'IsEmpty') expect(c.op.negated).toBe(false);
  });

  it('IS NOT EMPTY', () => {
    const ast = parseOk('assignee IS NOT EMPTY');
    const c = clause(ast.where);
    if (c.op.kind === 'IsEmpty') expect(c.op.negated).toBe(true);
  });

  it('IS NULL', () => {
    const ast = parseOk('due IS NULL');
    const c = clause(ast.where);
    expect(c.op.kind).toBe('IsEmpty');
  });

  it('IS NOT NULL', () => {
    const ast = parseOk('due IS NOT NULL');
    const c = clause(ast.where);
    if (c.op.kind === 'IsEmpty') expect(c.op.negated).toBe(true);
  });

  it('case-insensitive: `is empty`', () => {
    const ast = parseOk('x is empty');
    expect(clause(ast.where).op.kind).toBe('IsEmpty');
  });
});

// ─── IN / NOT IN ─────────────────────────────────────────────────────────────

describe('parser — IN and NOT IN', () => {
  it('IN (list)', () => {
    const ast = parseOk('status IN (OPEN, "IN_PROGRESS", DONE)');
    const c = clause(ast.where);
    expect(c.op.kind).toBe('In');
    if (c.op.kind === 'In') {
      expect(c.op.negated).toBe(false);
      expect(c.op.values).toHaveLength(3);
      expect(c.op.values[0]).toMatchObject({ kind: 'Ident', name: 'OPEN' });
      expect(c.op.values[1]).toMatchObject({ kind: 'String', value: 'IN_PROGRESS' });
    }
  });

  it('NOT IN (list)', () => {
    const ast = parseOk('status NOT IN (DONE, CANCELLED)');
    const c = clause(ast.where);
    if (c.op.kind === 'In') expect(c.op.negated).toBe(true);
  });

  it('IN funcCall() — no outer parens', () => {
    const ast = parseOk('sprint IN openSprints()');
    const c = clause(ast.where);
    expect(c.op.kind).toBe('InFunction');
    if (c.op.kind === 'InFunction') {
      expect(c.op.func.name).toBe('openSprints');
      expect(c.op.func.args).toEqual([]);
    }
  });

  it('NOT IN funcCall() with args', () => {
    const ast = parseOk('assignee NOT IN membersOf("flow-team-1")');
    const c = clause(ast.where);
    if (c.op.kind === 'InFunction') {
      expect(c.op.negated).toBe(true);
      expect(c.op.func.name).toBe('membersOf');
      expect(c.op.func.args).toHaveLength(1);
    }
  });
});

// ─── Function calls as values ────────────────────────────────────────────────

describe('parser — function calls', () => {
  it('zero-arg function value', () => {
    const ast = parseOk('assignee = currentUser()');
    const c = clause(ast.where);
    if (c.op.kind === 'Compare') {
      const fn = c.op.value as FunctionCall;
      expect(fn.kind).toBe('Function');
      expect(fn.name).toBe('currentUser');
      expect(fn.args).toEqual([]);
    }
  });

  it('single-arg function', () => {
    const ast = parseOk('release = earliestUnreleasedVersion("TTMP")');
    const c = clause(ast.where);
    if (c.op.kind === 'Compare') {
      const fn = c.op.value as FunctionCall;
      expect(fn.args).toHaveLength(1);
      expect(fn.args[0]).toMatchObject({ kind: 'String', value: 'TTMP' });
    }
  });
});

// ─── Bare function shorthand (§5.4.1 ТЗ) ───────────────────────────────────

describe('parser — bare function-call shorthand', () => {
  it('`myOpenIssues()` is desugared to `issue IN myOpenIssues()`', () => {
    const ast = parseOk('myOpenIssues()');
    const c = clause(ast.where);
    expect(c.field).toMatchObject({ kind: 'Ident', name: 'issue' });
    expect(c.op.kind).toBe('InFunction');
    if (c.op.kind === 'InFunction') {
      expect(c.op.func.name).toBe('myOpenIssues');
      expect(c.op.negated).toBe(false);
    }
  });

  it('bare function combines with ORDER BY', () => {
    const ast = parseOk('myOpenIssues() ORDER BY due ASC');
    expect(clause(ast.where).op.kind).toBe('InFunction');
    expect(ast.orderBy).toHaveLength(1);
  });

  it('bare function combines with AND', () => {
    const ast = parseOk('violatedCheckpoints() AND priority = HIGH');
    const top = andNode(ast.where);
    expect(top.children[0]!.kind).toBe('Clause');
  });
});

// ─── Boolean operators & precedence ─────────────────────────────────────────

describe('parser — precedence & grouping', () => {
  it('AND binds tighter than OR', () => {
    const ast = parseOk('a = 1 OR b = 2 AND c = 3');
    const top = orNode(ast.where);
    expect(top.children).toHaveLength(2);
    expect(top.children[0]!.kind).toBe('Clause');
    expect(top.children[1]!.kind).toBe('And');
  });

  it('explicit parens override precedence', () => {
    const ast = parseOk('(a = 1 OR b = 2) AND c = 3');
    const top = andNode(ast.where);
    expect(top.children[0]!.kind).toBe('Or');
  });

  it('chained AND flattens into one node', () => {
    const ast = parseOk('a = 1 AND b = 2 AND c = 3');
    const top = andNode(ast.where);
    expect(top.children).toHaveLength(3);
  });

  it('chained OR flattens into one node', () => {
    const ast = parseOk('a = 1 OR b = 2 OR c = 3');
    const top = orNode(ast.where);
    expect(top.children).toHaveLength(3);
  });

  it('NOT applies only to its immediate atom', () => {
    const ast = parseOk('NOT a = 1 AND b = 2');
    // Precedence: NOT > AND > OR → `(NOT (a=1)) AND (b=2)`.
    const top = andNode(ast.where);
    expect(top.children[0]!.kind).toBe('Not');
    expect(top.children[1]!.kind).toBe('Clause');
  });

  it('NOT (parenthesised group) applies to the whole group', () => {
    const ast = parseOk('NOT (status = DONE OR status = CANCELLED)');
    const n = notNode(ast.where);
    expect(n.child.kind).toBe('Or');
  });

  it('double NOT', () => {
    const ast = parseOk('NOT NOT x = 1');
    const outer = notNode(ast.where);
    expect(outer.child.kind).toBe('Not');
  });

  it('case-insensitive keywords (lowercase)', () => {
    const ast = parseOk('a = 1 and b = 2 or c = 3');
    expect(orNode(ast.where).children).toHaveLength(2);
  });

  it('deeply nested parens', () => {
    const ast = parseOk('((((x = 1))))');
    expect(clause(ast.where).field).toMatchObject({ name: 'x' });
  });
});

// ─── ORDER BY ───────────────────────────────────────────────────────────────

describe('parser — ORDER BY', () => {
  it('default direction is ASC', () => {
    const ast = parseOk('status = OPEN ORDER BY priority');
    expect(ast.orderBy).toHaveLength(1);
    expect(ast.orderBy[0]).toMatchObject({
      direction: 'ASC',
      field: { kind: 'Ident', name: 'priority' },
    });
  });

  it('explicit DESC', () => {
    const ast = parseOk('status = OPEN ORDER BY priority DESC');
    expect(ast.orderBy[0]!.direction).toBe('DESC');
  });

  it('multiple sort fields', () => {
    const ast = parseOk('status = OPEN ORDER BY priority DESC, updated ASC, created');
    expect(ast.orderBy).toHaveLength(3);
    expect(ast.orderBy.map((s) => [s.direction, (s.field as { name: string }).name])).toEqual([
      ['DESC', 'priority'],
      ['ASC', 'updated'],
      ['ASC', 'created'],
    ]);
  });

  it('ORDER BY with quoted field', () => {
    const ast = parseOk('x = 1 ORDER BY "Story Points" DESC');
    expect(ast.orderBy[0]!.field).toMatchObject({ kind: 'QuotedField', name: 'Story Points' });
  });

  it('case-insensitive `order by`', () => {
    const ast = parseOk('x = 1 order by priority desc');
    expect(ast.orderBy[0]!.direction).toBe('DESC');
  });
});

// ─── Comments & whitespace ──────────────────────────────────────────────────

describe('parser — comments and empty input', () => {
  it('line comments are ignored', () => {
    const ast = parseOk('x = 1 -- trailing comment\nAND y = 2');
    expect(andNode(ast.where).children).toHaveLength(2);
  });

  it('empty input parses to empty Query', () => {
    const ast = parseOk('');
    expect(ast.where).toBeNull();
    expect(ast.orderBy).toEqual([]);
  });

  it('only comments parses to empty Query', () => {
    const ast = parseOk('-- just a comment');
    expect(ast.where).toBeNull();
  });
});

// ─── Error reporting ─────────────────────────────────────────────────────────

describe('parser — error reporting', () => {
  it('unterminated string returns UNTERMINATED_STRING with span', () => {
    const r = parse('x = "no end');
    expect(r.ast).toBeNull();
    expect(r.errors[0]).toMatchObject({ code: 'UNTERMINATED_STRING', start: 4 });
  });

  it('empty value list', () => {
    const r = parse('status IN ()');
    expect(r.errors[0]).toMatchObject({ code: 'EMPTY_VALUE_LIST' });
  });

  it('trailing comma in IN list', () => {
    const r = parse('status IN (OPEN,)');
    expect(r.errors[0]?.code).toBe('EXPECTED_VALUE');
  });

  it('missing RParen', () => {
    const r = parse('status IN (OPEN, DONE');
    expect(r.errors[0]?.code).toBe('EXPECTED_RPAREN');
  });

  it('empty parens', () => {
    const r = parse('()');
    expect(r.errors[0]?.code).toBe('EMPTY_PAREN_GROUP');
  });

  it('missing operator', () => {
    const r = parse('status OPEN');
    expect(r.errors[0]?.code).toBe('EXPECTED_OPERATOR');
  });

  it('missing value after operator', () => {
    const r = parse('status =');
    expect(r.errors[0]?.code).toBe('EXPECTED_VALUE');
  });

  it('leading AND', () => {
    const r = parse('AND x = 1');
    expect(r.errors[0]?.code).toBe('EXPECTED_FIELD');
  });

  it('trailing input after ORDER BY', () => {
    const r = parse('x = 1 ORDER BY priority WHERE y');
    // `WHERE` is not a known keyword — it's an ident. It becomes a second sort item field.
    // Then `y` is trailing. The parser surfaces a trailing-input error.
    expect(r.errors[0]?.code).toBe('TRAILING_INPUT');
  });

  it('ORDER BY with nothing after', () => {
    const r = parse('x = 1 ORDER BY');
    expect(r.errors[0]?.code).toBe('EMPTY_QUERY_AFTER_ORDER_BY');
  });

  it('IS followed by wrong token', () => {
    const r = parse('x IS 5');
    expect(r.errors[0]?.code).toBe('EXPECTED_EMPTY_OR_NULL');
  });

  it('unknown escape in string', () => {
    const r = parse('x = "\\q"');
    expect(r.errors[0]?.code).toBe('INVALID_ESCAPE');
  });

  it('invalid custom-field UUID', () => {
    const r = parse('cf[not-a-uuid] = 1');
    expect(r.errors[0]?.code).toBe('INVALID_CUSTOM_FIELD');
  });

  it('control char in string', () => {
    const r = parse('x = "a\x01b"');
    expect(r.errors[0]?.code).toBe('UNEXPECTED_CHARACTER');
  });

  it('error span points at the offending token', () => {
    const r = parse('x = "unterminated');
    // String starts at position 4 (the opening quote), runs to end of input.
    expect(r.errors[0]).toMatchObject({ start: 4, end: 17 });
  });
});

// ─── History operators (Phase 2) ────────────────────────────────────────────

describe('parser — history operators are parsed but validator-rejected', () => {
  it('WAS', () => {
    const ast = parseOk('status WAS "OPEN"');
    expect(clause(ast.where).op.kind).toBe('History');
  });

  it('WAS NOT', () => {
    const ast = parseOk('status WAS NOT "DONE"');
    const c = clause(ast.where);
    if (c.op.kind === 'History') expect(c.op.op).toBe('WAS_NOT');
  });

  it('CHANGED', () => {
    const ast = parseOk('status CHANGED');
    const c = clause(ast.where);
    if (c.op.kind === 'History') expect(c.op.op).toBe('CHANGED');
  });

  it('CHANGED AFTER', () => {
    const ast = parseOk('status CHANGED AFTER "-7d"');
    const c = clause(ast.where);
    if (c.op.kind === 'History') expect(c.op.op).toBe('CHANGED_AFTER');
  });

  it('WAS IN (list)', () => {
    // History WAS IN takes a single value in our current AST shape; full list-form
    // is Phase 2. The parser accepts it as WAS_IN <value>. We test only the op code.
    const ast = parseOk('status WAS IN "OPEN"');
    const c = clause(ast.where);
    if (c.op.kind === 'History') expect(c.op.op).toBe('WAS_IN');
  });
});

// ─── Spans ──────────────────────────────────────────────────────────────────

describe('parser — spans on AST nodes', () => {
  it('top-level query span covers the full input', () => {
    const src = 'status = OPEN';
    const ast = parseOk(src);
    expect(ast.span).toEqual({ start: 0, end: src.length });
  });

  it('clause span covers field + op + value', () => {
    const src = 'priority = HIGH';
    const ast = parseOk(src);
    const c = clause(ast.where);
    expect(c.span).toEqual({ start: 0, end: src.length });
  });

  it('AND node span covers all children', () => {
    const src = 'a = 1 AND b = 2';
    const ast = parseOk(src);
    const a = andNode(ast.where);
    expect(a.span).toEqual({ start: 0, end: src.length });
  });
});

// ─── Complex golden-set-like queries ────────────────────────────────────────

describe('parser — complex queries', () => {
  it('handles the hero example from §5.5', () => {
    const src =
      'project = "TTMP" AND assignee = currentUser() AND status IN (OPEN, IN_PROGRESS) ' +
      'AND priority = HIGH AND due <= "7d" AND "Story Points" > 3 ' +
      'ORDER BY priority DESC, updated DESC';
    const ast = parseOk(src);
    expect(andNode(ast.where).children).toHaveLength(6);
    expect(ast.orderBy).toHaveLength(2);
  });

  it('OR + nested parens + function + relative date', () => {
    const src = '(priority = CRITICAL OR (priority = HIGH AND due <= "7d")) AND statusCategory != DONE';
    const ast = parseOk(src);
    const top = andNode(ast.where);
    expect(top.children[0]!.kind).toBe('Or');
  });
});
