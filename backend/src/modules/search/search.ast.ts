/**
 * TTSRH-1 PR-2 — AST types for TTS-QL (TaskTime Query Language).
 *
 * Grammar reference: docs/tz/TTSRH-1.md §5.1 (EBNF).
 * AST consumers: search.validator (PR-3), search.compiler (PR-4/5), search.suggest (PR-6).
 *
 * Every node carries a `span: { start, end }` pointing into the original source so
 * downstream stages (validator, suggest, CodeMirror editor) can report errors inline.
 * Spans are byte offsets into the UTF-16 source string (String.prototype.length-compatible).
 */

export interface Span {
  /** Inclusive start offset in the source string. */
  start: number;
  /** Exclusive end offset. Empty ranges use start === end. */
  end: number;
}

// ─── Top-level query ────────────────────────────────────────────────────────

export interface QueryNode {
  kind: 'Query';
  /** Boolean expression. `null` is legal for an empty query (whitespace/comments only). */
  where: BoolExpr | null;
  /** Optional ORDER BY list. Empty array = no ORDER BY. */
  orderBy: SortItem[];
  span: Span;
}

// ─── Boolean expressions ────────────────────────────────────────────────────

export type BoolExpr = OrNode | AndNode | NotNode | ClauseNode;

export interface OrNode {
  kind: 'Or';
  /** >= 2 children; a single-child OR is always simplified to its child. */
  children: BoolExpr[];
  span: Span;
}

export interface AndNode {
  kind: 'And';
  /** >= 2 children; a single-child AND is always simplified to its child. */
  children: BoolExpr[];
  span: Span;
}

export interface NotNode {
  kind: 'Not';
  child: BoolExpr;
  span: Span;
}

// ─── Clauses ────────────────────────────────────────────────────────────────

export interface ClauseNode {
  kind: 'Clause';
  field: FieldRef;
  op: ClauseOp;
  span: Span;
}

export type FieldRef =
  | { kind: 'Ident'; name: string; span: Span }
  | { kind: 'CustomField'; uuid: string; span: Span }
  | { kind: 'QuotedField'; name: string; span: Span };

export type CompareOp = '=' | '!=' | '>' | '<' | '>=' | '<=' | '~' | '!~';

export type ClauseOp =
  | { kind: 'Compare'; op: CompareOp; value: Expr; span: Span }
  | { kind: 'In'; negated: boolean; values: Expr[]; span: Span }
  | { kind: 'InFunction'; negated: boolean; func: FunctionCall; span: Span }
  | { kind: 'IsEmpty'; negated: boolean; span: Span }
  | { kind: 'History'; op: HistoryOp; value: Expr | null; span: Span };

/** Phase-2 operators (per §R5 ТЗ). Parser accepts them; validator rejects in MVP. */
export type HistoryOp =
  | 'WAS'
  | 'WAS_NOT'
  | 'WAS_IN'
  | 'WAS_NOT_IN'
  | 'CHANGED'
  | 'CHANGED_FROM'
  | 'CHANGED_TO'
  | 'CHANGED_AFTER'
  | 'CHANGED_BEFORE'
  | 'CHANGED_ON'
  | 'CHANGED_DURING'
  | 'CHANGED_BY';

// ─── Values / Expressions ───────────────────────────────────────────────────

export type Expr = Literal | FunctionCall;

export type Literal =
  | { kind: 'String'; value: string; span: Span }
  | { kind: 'Number'; value: number; span: Span }
  /** Bare relative date like `-1d`, `2w`, `3M`. Quoted forms stay as String. */
  | { kind: 'RelativeDate'; raw: string; span: Span }
  /** Bare identifier used as a value (enum constant: HIGH, OPEN, EPIC, TTMP). */
  | { kind: 'Ident'; name: string; span: Span }
  | { kind: 'Bool'; value: boolean; span: Span }
  | { kind: 'Null'; span: Span }
  | { kind: 'Empty'; span: Span };

export interface FunctionCall {
  kind: 'Function';
  name: string;
  args: Expr[];
  span: Span;
}

// ─── ORDER BY ───────────────────────────────────────────────────────────────

export interface SortItem {
  field: FieldRef;
  /** Default ASC when omitted. */
  direction: 'ASC' | 'DESC';
  span: Span;
}

// ─── Errors ─────────────────────────────────────────────────────────────────

/**
 * Error codes are stable identifiers that the frontend and CI snapshot tests rely on.
 * Keep in sync with frontend/src/lib/search/errors.ts (when it exists).
 */
export type ParseErrorCode =
  | 'UNEXPECTED_CHARACTER'
  | 'UNTERMINATED_STRING'
  | 'INVALID_ESCAPE'
  | 'INVALID_CUSTOM_FIELD'
  | 'UNEXPECTED_TOKEN'
  | 'EXPECTED_FIELD'
  | 'EXPECTED_OPERATOR'
  | 'EXPECTED_VALUE'
  | 'EXPECTED_RPAREN'
  | 'EXPECTED_LPAREN'
  | 'EMPTY_PAREN_GROUP'
  | 'EMPTY_VALUE_LIST'
  | 'TRAILING_INPUT'
  | 'EMPTY_QUERY_AFTER_ORDER_BY'
  | 'INVALID_SORT_DIRECTION'
  | 'EXPECTED_EMPTY_OR_NULL';

export interface ParseError {
  code: ParseErrorCode;
  message: string;
  /** Optional hint shown in the editor tooltip — kept short. */
  hint?: string;
  /** Byte offset in source. */
  start: number;
  end: number;
}

export interface ParseResult {
  /** Null only when parsing failed before any top-level node could be produced. */
  ast: QueryNode | null;
  errors: ParseError[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Merge two spans into one covering both. */
export function joinSpan(a: Span, b: Span): Span {
  return { start: Math.min(a.start, b.start), end: Math.max(a.end, b.end) };
}
