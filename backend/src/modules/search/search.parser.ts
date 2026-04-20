/**
 * TTSRH-1 PR-2 — recursive-descent parser for TTS-QL.
 *
 * Grammar reference: docs/tz/TTSRH-1.md §5.1. Precedence: `( ) > NOT > AND > OR > ORDER BY`.
 *
 * Public surface: `parse(source) -> ParseResult`. Never throws: tokenizer errors and
 * syntax errors are captured into `result.errors` with byte spans, and the parser
 * returns whatever partial AST it managed to build. This is required by PR-3 (suggest)
 * which calls the parser mid-edit for cursor-position analysis.
 *
 * Keywords are matched on Ident tokens case-insensitively. Ident text is compared
 * with `.toUpperCase()` to avoid locale surprises (e.g. Turkish `i` → `İ`).
 */

import {
  type Span,
  type QueryNode,
  type BoolExpr,
  type OrNode,
  type AndNode,
  type NotNode,
  type ClauseNode,
  type ClauseOp,
  type FieldRef,
  type Expr,
  type Literal,
  type FunctionCall,
  type SortItem,
  type CompareOp,
  type HistoryOp,
  type ParseError,
  type ParseErrorCode,
  type ParseResult,
  joinSpan,
} from './search.ast.js';
import { tokenize, TokenizerError, type Token } from './search.tokenizer.js';

const COMPARE_OPS = new Set<CompareOp>(['=', '!=', '>', '<', '>=', '<=', '~', '!~']);

class ParserBailout extends Error {
  readonly err: ParseError;
  constructor(err: ParseError) {
    super(err.message);
    this.err = err;
  }
}

export function parse(source: string): ParseResult {
  // Phase 1 — tokenize. Tokenizer failures short-circuit: we can't safely produce an
  // AST without at least a valid token stream.
  let tokens: Token[];
  try {
    tokens = tokenize(source);
  } catch (err) {
    if (err instanceof TokenizerError) {
      return {
        ast: null,
        errors: [
          {
            code: err.code,
            message: err.message,
            start: err.start,
            end: err.end,
          },
        ],
      };
    }
    throw err;
  }

  const parser = new Parser(tokens, source);
  try {
    const ast = parser.parseQuery();
    return { ast, errors: parser.errors };
  } catch (err) {
    if (err instanceof ParserBailout) {
      return { ast: null, errors: [...parser.errors, err.err] };
    }
    throw err;
  }
}

class Parser {
  private pos = 0;
  readonly errors: ParseError[] = [];

  constructor(private readonly tokens: Token[], private readonly source: string) {}

  // NOTE: `tok()` is a method (not a getter) so TypeScript invalidates property-based
  // narrowing across calls. When we advance the stream, the next `tok()` call returns a
  // fresh `Token` that isn't narrowed by earlier `if (tok.kind === 'X')` branches.
  private tok(): Token {
    return this.tokens[this.pos]!;
  }
  private peek(offset: number): Token | undefined {
    return this.tokens[this.pos + offset];
  }
  private advance(): Token {
    const t = this.tokens[this.pos]!;
    if (t.kind !== 'Eof') this.pos++;
    return t;
  }

  // ─── Top-level ────────────────────────────────────────────────────────────

  parseQuery(): QueryNode {
    const startSpan = this.tok().span;

    if (this.tok().kind === 'Eof') {
      return { kind: 'Query', where: null, orderBy: [], span: { start: startSpan.start, end: startSpan.end } };
    }

    let where: BoolExpr | null = null;
    if (!this.isOrderByAhead()) {
      where = this.parseOrExpr();
    }

    const orderBy: SortItem[] = [];
    if (this.isOrderByAhead()) {
      this.advance(); // ORDER
      this.advance(); // BY
      if (this.tok().kind === 'Eof') {
        this.fail('EMPTY_QUERY_AFTER_ORDER_BY', 'ORDER BY must be followed by at least one field.', this.tok().span);
      }
      orderBy.push(this.parseSortItem());
      while (this.tok().kind === 'Comma') {
        this.advance();
        orderBy.push(this.parseSortItem());
      }
    }

    if (this.tok().kind !== 'Eof') {
      this.fail(
        'TRAILING_INPUT',
        `Unexpected input after end of query: \`${this.tokenLexeme(this.tok())}\`.`,
        this.tok().span,
      );
    }

    const endSpan =
      orderBy.length > 0
        ? orderBy[orderBy.length - 1]!.span
        : where?.span ?? startSpan;
    return { kind: 'Query', where, orderBy, span: joinSpan(startSpan, endSpan) };
  }

  // ─── Boolean expressions (OR > AND > NOT > atom) ──────────────────────────

  private parseOrExpr(): BoolExpr {
    const first = this.parseAndExpr();
    if (!this.isKeyword(this.tok(), 'OR')) return first;

    const children: BoolExpr[] = [first];
    while (this.isKeyword(this.tok(), 'OR')) {
      this.advance();
      children.push(this.parseAndExpr());
    }
    const node: OrNode = {
      kind: 'Or',
      children,
      span: joinSpan(first.span, children[children.length - 1]!.span),
    };
    return node;
  }

  private parseAndExpr(): BoolExpr {
    const first = this.parseNotExpr();
    if (!this.isKeyword(this.tok(), 'AND')) return first;

    const children: BoolExpr[] = [first];
    while (this.isKeyword(this.tok(), 'AND')) {
      this.advance();
      children.push(this.parseNotExpr());
    }
    const node: AndNode = {
      kind: 'And',
      children,
      span: joinSpan(first.span, children[children.length - 1]!.span),
    };
    return node;
  }

  private parseNotExpr(): BoolExpr {
    if (this.isKeyword(this.tok(), 'NOT')) {
      const notSpan = this.tok().span;
      this.advance();
      const child = this.parseNotExpr();
      const node: NotNode = { kind: 'Not', child, span: joinSpan(notSpan, child.span) };
      return node;
    }
    return this.parseAtom();
  }

  private parseAtom(): BoolExpr {
    if (this.tok().kind === 'LParen') {
      const lparen = this.advance();
      if (this.tok().kind === 'RParen') {
        this.fail(
          'EMPTY_PAREN_GROUP',
          'Parenthesized expression cannot be empty.',
          { start: lparen.span.start, end: this.tok().span.end },
        );
      }
      const inner = this.parseOrExpr();
      this.expect('RParen', 'EXPECTED_RPAREN', 'Expected closing `)`.');
      return inner;
    }
    return this.parseClause();
  }

  // ─── Clause ───────────────────────────────────────────────────────────────

  private parseClause(): ClauseNode {
    // Bare function-call shorthand per §5.4.1 ТЗ: `funcCall()` at clause position
    // is sugar for `issue IN funcCall()`. Three equivalent forms in the TZ:
    //   issue IN violatedCheckpoints()
    //   violatedCheckpoints()               ← here
    //   hasCheckpointViolation = true
    // We synthesise a virtual `issue` FieldRef with a zero-width span at the function
    // start — downstream stages treat it the same as an explicit `issue IN ...`.
    const first = this.tok();
    if (
      first.kind === 'Ident' &&
      !KEYWORDS.has(first.value.toUpperCase()) &&
      this.peek(1)?.kind === 'LParen'
    ) {
      const func = this.parseFunctionCall();
      const field: FieldRef = {
        kind: 'Ident',
        name: 'issue',
        span: { start: func.span.start, end: func.span.start },
      };
      const op: ClauseOp = {
        kind: 'InFunction',
        negated: false,
        func,
        span: func.span,
      };
      return { kind: 'Clause', field, op, span: func.span };
    }

    const field = this.parseFieldRef();
    const opSpanStart = this.tok().span.start;

    // IS [NOT] EMPTY | NULL
    if (this.isKeyword(this.tok(), 'IS')) {
      this.advance();
      let negated = false;
      if (this.isKeyword(this.tok(), 'NOT')) {
        negated = true;
        this.advance();
      }
      if (!this.isKeyword(this.tok(), 'EMPTY') && !this.isKeyword(this.tok(), 'NULL')) {
        this.fail(
          'EXPECTED_EMPTY_OR_NULL',
          'Expected `EMPTY` or `NULL` after `IS [NOT]`.',
          this.tok().span,
        );
      }
      const endTok = this.advance();
      const op: ClauseOp = {
        kind: 'IsEmpty',
        negated,
        span: { start: opSpanStart, end: endTok.span.end },
      };
      return { kind: 'Clause', field, op, span: joinSpan(field.span, op.span) };
    }

    // IN / NOT IN
    if (this.isInClauseStart()) {
      let negated = false;
      if (this.isKeyword(this.tok(), 'NOT')) {
        negated = true;
        this.advance();
      }
      this.advance(); // consume IN
      const op = this.parseInRhs(negated, opSpanStart);
      return { kind: 'Clause', field, op, span: joinSpan(field.span, op.span) };
    }

    // WAS / CHANGED (Phase 2 per §R5 — we parse, validator rejects)
    if (this.isKeyword(this.tok(), 'WAS') || this.isKeyword(this.tok(), 'CHANGED')) {
      const op = this.parseHistoryOp(opSpanStart);
      return { kind: 'Clause', field, op, span: joinSpan(field.span, op.span) };
    }

    // Comparison
    if (this.tok().kind === 'Op' && COMPARE_OPS.has(this.tok().value as CompareOp)) {
      const opTok = this.advance();
      const value = this.parseValue();
      const op: ClauseOp = {
        kind: 'Compare',
        op: opTok.value as CompareOp,
        value,
        span: joinSpan(opTok.span, value.span),
      };
      return { kind: 'Clause', field, op, span: joinSpan(field.span, op.span) };
    }

    this.fail('EXPECTED_OPERATOR', `Expected an operator after field \`${this.fieldLabel(field)}\`.`, this.tok().span);
  }

  private isInClauseStart(): boolean {
    if (this.isKeyword(this.tok(), 'IN')) return true;
    if (this.isKeyword(this.tok(), 'NOT')) {
      const next = this.peek(1);
      return !!next && this.isKeyword(next, 'IN');
    }
    return false;
  }

  /** After `IN` / `NOT IN` is consumed, reads either a `(value_list)` or a `funcCall`. */
  private parseInRhs(negated: boolean, startOffset: number): ClauseOp {
    // `IN funcCall()` — no outer parens, RHS is a direct function call.
    if (this.tok().kind === 'Ident' && this.peek(1)?.kind === 'LParen' && !this.isReservedFunctionName(this.tok().value)) {
      const func = this.parseFunctionCall();
      return {
        kind: 'InFunction',
        negated,
        func,
        span: { start: startOffset, end: func.span.end },
      };
    }
    // `IN (value_list)`
    this.expect('LParen', 'EXPECTED_LPAREN', 'Expected `(` after `IN` / `NOT IN`.');
    const values: Expr[] = [];
    if (this.tok().kind === 'RParen') {
      this.fail('EMPTY_VALUE_LIST', 'Value list in `IN (...)` cannot be empty.', this.tok().span);
    }
    values.push(this.parseValue());
    while (this.tok().kind === 'Comma') {
      this.advance();
      values.push(this.parseValue());
    }
    const closeTok = this.expect('RParen', 'EXPECTED_RPAREN', 'Expected `)` to close value list.');
    return {
      kind: 'In',
      negated,
      values,
      span: { start: startOffset, end: closeTok.span.end },
    };
  }

  /**
   * Reserved names that are language keywords (and cannot be functions). `NOT` etc.
   * Used to avoid mis-parsing `x IN NOT something` as a function call.
   */
  private isReservedFunctionName(text: string): boolean {
    return KEYWORDS.has(text.toUpperCase());
  }

  private parseHistoryOp(startOffset: number): ClauseOp {
    // WAS [NOT] [IN] value
    if (this.isKeyword(this.tok(), 'WAS')) {
      this.advance();
      let op: HistoryOp = 'WAS';
      if (this.isKeyword(this.tok(), 'NOT')) {
        this.advance();
        if (this.isKeyword(this.tok(), 'IN')) {
          this.advance();
          op = 'WAS_NOT_IN';
        } else {
          op = 'WAS_NOT';
        }
      } else if (this.isKeyword(this.tok(), 'IN')) {
        this.advance();
        op = 'WAS_IN';
      }
      const value = this.parseValue();
      return { kind: 'History', op, value, span: { start: startOffset, end: value.span.end } };
    }
    // CHANGED [FROM|TO|AFTER|BEFORE|ON|DURING|BY value]
    this.advance(); // CHANGED
    const subOps: Record<string, HistoryOp> = {
      FROM: 'CHANGED_FROM',
      TO: 'CHANGED_TO',
      AFTER: 'CHANGED_AFTER',
      BEFORE: 'CHANGED_BEFORE',
      ON: 'CHANGED_ON',
      DURING: 'CHANGED_DURING',
      BY: 'CHANGED_BY',
    };
    if (this.tok().kind === 'Ident') {
      const upper = this.tok().value.toUpperCase();
      if (upper in subOps) {
        this.advance();
        const value = this.parseValue();
        return {
          kind: 'History',
          op: subOps[upper]!,
          value,
          span: { start: startOffset, end: value.span.end },
        };
      }
    }
    return {
      kind: 'History',
      op: 'CHANGED',
      value: null,
      span: { start: startOffset, end: this.tokens[this.pos - 1]!.span.end },
    };
  }

  // ─── Fields ───────────────────────────────────────────────────────────────

  private parseFieldRef(): FieldRef {
    const tok = this.tok();
    if (tok.kind === 'Ident' && !KEYWORDS.has(tok.value.toUpperCase())) {
      this.advance();
      return { kind: 'Ident', name: tok.value, span: tok.span };
    }
    if (tok.kind === 'CustomField') {
      this.advance();
      return { kind: 'CustomField', uuid: tok.value, span: tok.span };
    }
    if (tok.kind === 'String') {
      this.advance();
      return { kind: 'QuotedField', name: tok.value, span: tok.span };
    }
    this.fail(
      'EXPECTED_FIELD',
      `Expected a field name, got \`${this.tokenLexeme(tok)}\`.`,
      tok.span,
      'Field names can be identifiers (e.g. priority), quoted strings (e.g. "Story Points"), or custom-field references (cf[UUID]).',
    );
  }

  private fieldLabel(field: FieldRef): string {
    if (field.kind === 'CustomField') return `cf[${field.uuid}]`;
    if (field.kind === 'QuotedField') return `"${field.name}"`;
    return field.name;
  }

  // ─── Values ───────────────────────────────────────────────────────────────

  private parseValue(): Expr {
    const tok = this.tok();
    switch (tok.kind) {
      case 'String': {
        this.advance();
        const lit: Literal = { kind: 'String', value: tok.value, span: tok.span };
        return lit;
      }
      case 'Number': {
        this.advance();
        const num = Number.parseFloat(tok.value);
        const lit: Literal = { kind: 'Number', value: num, span: tok.span };
        return lit;
      }
      case 'RelativeDate': {
        this.advance();
        const lit: Literal = { kind: 'RelativeDate', raw: tok.value, span: tok.span };
        return lit;
      }
      case 'Ident': {
        if (this.peek(1)?.kind === 'LParen') {
          return this.parseFunctionCall();
        }
        const upper = tok.value.toUpperCase();
        this.advance();
        if (upper === 'TRUE') return { kind: 'Bool', value: true, span: tok.span };
        if (upper === 'FALSE') return { kind: 'Bool', value: false, span: tok.span };
        if (upper === 'NULL') return { kind: 'Null', span: tok.span };
        if (upper === 'EMPTY') return { kind: 'Empty', span: tok.span };
        return { kind: 'Ident', name: tok.value, span: tok.span };
      }
      default:
        this.fail(
          'EXPECTED_VALUE',
          `Expected a value, got \`${this.tokenLexeme(tok)}\`.`,
          tok.span,
        );
    }
  }

  private parseFunctionCall(): FunctionCall {
    const nameTok = this.advance();
    this.expect('LParen', 'EXPECTED_LPAREN', `Expected \`(\` after function name \`${nameTok.value}\`.`);
    const args: Expr[] = [];
    if (this.tok().kind !== 'RParen') {
      args.push(this.parseValue());
      while (this.tok().kind === 'Comma') {
        this.advance();
        args.push(this.parseValue());
      }
    }
    const close = this.expect('RParen', 'EXPECTED_RPAREN', `Expected \`)\` to close function call \`${nameTok.value}(...)\`.`);
    return {
      kind: 'Function',
      name: nameTok.value,
      args,
      span: { start: nameTok.span.start, end: close.span.end },
    };
  }

  // ─── ORDER BY ─────────────────────────────────────────────────────────────

  private isOrderByAhead(): boolean {
    return this.isKeyword(this.tok(), 'ORDER') && !!this.peek(1) && this.isKeyword(this.peek(1)!, 'BY');
  }

  private parseSortItem(): SortItem {
    const field = this.parseFieldRef();
    let direction: 'ASC' | 'DESC' = 'ASC';
    let endSpan: Span = field.span;
    if (this.tok().kind === 'Ident') {
      const upper = this.tok().value.toUpperCase();
      if (upper === 'ASC' || upper === 'DESC') {
        direction = upper;
        endSpan = this.tok().span;
        this.advance();
      } else if (KEYWORDS.has(upper) && upper !== 'AND' && upper !== 'OR') {
        // Guard against misplaced keywords like "ORDER BY foo WHERE". Let the trailing-
        // input check at top-level produce the friendlier error message.
      }
    }
    return { field, direction, span: joinSpan(field.span, endSpan) };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private isKeyword(tok: Token, kw: string): boolean {
    return tok.kind === 'Ident' && tok.value.toUpperCase() === kw;
  }

  private expect(kind: Token['kind'], code: ParseErrorCode, message: string): Token {
    if (this.tok().kind !== kind) {
      this.fail(code, message, this.tok().span);
    }
    return this.advance();
  }

  private tokenLexeme(tok: Token): string {
    if (tok.kind === 'Eof') return '<end of input>';
    if (tok.kind === 'String') return `"${tok.value}"`;
    return this.source.slice(tok.span.start, tok.span.end);
  }

  private fail(code: ParseErrorCode, message: string, span: Span, hint?: string): never {
    throw new ParserBailout({ code, message, hint, start: span.start, end: span.end });
  }
}

const KEYWORDS = new Set([
  'AND',
  'OR',
  'NOT',
  'IN',
  'IS',
  'EMPTY',
  'NULL',
  'ORDER',
  'BY',
  'ASC',
  'DESC',
  'TRUE',
  'FALSE',
  'WAS',
  'CHANGED',
  'FROM',
  'TO',
  'AFTER',
  'BEFORE',
  'ON',
  'DURING',
]);
