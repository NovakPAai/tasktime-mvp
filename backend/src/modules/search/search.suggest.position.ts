/**
 * TTSRH-1 PR-6 — position analyser for the TTS-QL suggest pipeline.
 *
 * Given the raw JQL text and a cursor offset, determine what the user is trying
 * to type: a field? an operator? a value? a function name? The parser recovers
 * gracefully from incomplete input, so this module walks the tokenizer output
 * up to the cursor position and applies heuristic rules.
 *
 * The heuristics match the §5.11 ТЗ contract — callers expect:
 *   - After `{nothing}` / `AND` / `OR` / `NOT` / `(` → **field**.
 *   - After a field → **operator** compatible with its type.
 *   - After an operator (`=`/`!=`/`>`/`<`/`IN`/`IS`) → **value**.
 *   - After `,` inside `IN (…)` → **value**, and dedupe picked values.
 *   - After `ORDER BY` → **field** (sortable only — enforced in suggester).
 *
 * We fail open: if the input is irrecoverable, we return `{ expected: 'field' }`
 * so the editor still shows something useful.
 */

import { resolveSystemField } from './search.schema.js';
import { tokenize, type Token } from './search.tokenizer.js';
import type { PositionContext } from './search.suggest.types.js';

const BOOLEAN_CONTINUATION = new Set(['AND', 'OR', 'NOT']);

/**
 * Analyse `source` with a cursor at byte offset `cursor`. Returns a
 * `PositionContext` describing what kind of completion is expected and the
 * prefix the user has typed so far.
 */
export function analysePosition(source: string, cursor: number): PositionContext {
  // Guard — cursor out of bounds normalises to end.
  const pos = Math.max(0, Math.min(cursor, source.length));
  const before = source.slice(0, pos);

  // Tokenize the text up to the cursor. On tokenizer errors (e.g. unterminated
  // string), try a recovery pass — the common case is a user still typing
  // inside a quoted string, especially for non-ASCII field names like
  // `"Мои задачи"`. Treat everything after the last unclosed quote as the
  // prefix being typed, and analyse the tokens before it as context.
  // Without this, the tokenizer throws UNTERMINATED_STRING and the fallback
  // to `emptyField()` drops the user's partially-typed prefix, returning an
  // unfiltered dump of every field.
  let tokens: Token[];
  try {
    tokens = tokenize(before);
  } catch {
    return recoverFromUnterminatedString(before);
  }

  // Strip trailing Eof token for easier last-token access.
  const real = tokens.filter((t) => t.kind !== 'Eof');
  if (real.length === 0) return emptyField();

  // Compute the "prefix" — characters from the start of the last ident/string
  // to the cursor. If the cursor is inside whitespace, prefix is empty.
  const prefix = extractPrefix(source, pos, real);

  // If the cursor touches the end of an *editable* token (ident/string/number/
  // relative-date/custom-field), treat that token as being typed and analyse
  // the context before it. Structural delimiters (`(`, `,`, `)`, operators,
  // `=`) are not edited in place, so we keep them as context.
  const lastToken = real[real.length - 1]!;
  const editableKinds = new Set(['Ident', 'String', 'Number', 'RelativeDate', 'CustomField']);
  const editingLastToken = pos === lastToken.span.end && editableKinds.has(lastToken.kind);
  const effectiveTokens = editingLastToken ? real.slice(0, -1) : real;

  if (effectiveTokens.length === 0) return withPrefix(emptyField(), prefix);

  return analyseAfterTokens(effectiveTokens, prefix);
}

/**
 * Recover position analysis when the tokenizer failed — most often because
 * the cursor sits inside an unclosed string literal (user typing a quoted
 * field name or value, including non-ASCII like Cyrillic). Finds the last
 * unescaped `"` / `'` before the cursor, re-tokenises the pre-quote portion,
 * and treats the suffix as the typed prefix. Bails to `emptyField()` if the
 * pre-quote prefix is itself malformed — a rare case we accept degrades to
 * an unfiltered list, same as before the recovery.
 */
function recoverFromUnterminatedString(before: string): PositionContext {
  const lastQuote = Math.max(before.lastIndexOf('"'), before.lastIndexOf("'"));
  if (lastQuote < 0) return emptyField();
  const pre = before.slice(0, lastQuote);
  const partialPrefix = before.slice(lastQuote + 1);
  let preTokens: Token[];
  try {
    preTokens = tokenize(pre);
  } catch {
    return withPrefix(emptyField(), partialPrefix);
  }
  const real = preTokens.filter((t) => t.kind !== 'Eof');
  if (real.length === 0) return withPrefix(emptyField(), partialPrefix);
  return analyseAfterTokens(real, partialPrefix);
}

// ─── Heuristics ─────────────────────────────────────────────────────────────

function analyseAfterTokens(tokens: readonly Token[], prefix: string): PositionContext {
  const last = tokens[tokens.length - 1]!;

  // Case 1 — inside an IN value list. Check FIRST, so `(` after `IN` is not
  // mis-classified as a grouping boundary.
  const inListCtx = detectInList(tokens);
  if (inListCtx) {
    return {
      expected: 'value',
      prefix,
      field: inListCtx.field,
      operator: 'IN',
      inValueList: true,
      pickedValues: inListCtx.picked,
    };
  }

  // Case 2 — after a boolean connective / grouping paren / NOT: expect field.
  if (isBooleanBoundary(last)) {
    return { expected: 'field', prefix, inValueList: false, pickedValues: [] };
  }

  // Case 3 — after `ORDER BY` or a comma inside sort list.
  if (isAfterOrderBy(tokens)) {
    return { expected: 'field', prefix, inValueList: false, pickedValues: [] };
  }

  // Case 4 — after a field (next token is a comparison op or expected op).
  const fieldThenOp = detectFieldThenOp(tokens);
  if (fieldThenOp) {
    return {
      expected: 'value',
      prefix,
      field: fieldThenOp.field,
      operator: fieldThenOp.op,
      inValueList: false,
      pickedValues: [],
    };
  }

  // Case 5 — field just named, next expected is operator.
  if (last.kind === 'Ident' && isLikelyField(last.value)) {
    return {
      expected: 'operator',
      prefix,
      field: last.value.toLowerCase(),
      inValueList: false,
      pickedValues: [],
    };
  }

  // Case 6 — fallback: field.
  return { expected: 'field', prefix, inValueList: false, pickedValues: [] };
}

function isBooleanBoundary(t: Token): boolean {
  if (t.kind === 'LParen') return true;
  if (t.kind === 'Ident' && BOOLEAN_CONTINUATION.has(t.value.toUpperCase())) return true;
  return false;
}

/**
 * Look back through tokens to see if we're inside an `IN (...)` list.
 * Returns the field name and the values already picked (for dedup).
 */
function detectInList(tokens: readonly Token[]): { field: string; picked: readonly string[] } | null {
  // Find the closest unmatched LParen working backwards.
  let depth = 0;
  let lparenIdx = -1;
  for (let i = tokens.length - 1; i >= 0; i--) {
    const t = tokens[i]!;
    if (t.kind === 'RParen') depth++;
    else if (t.kind === 'LParen') {
      if (depth === 0) {
        lparenIdx = i;
        break;
      }
      depth--;
    }
  }
  if (lparenIdx < 1) return null;

  // Check what's before the LParen — must be IN or NOT IN.
  const prev = tokens[lparenIdx - 1];
  if (!prev || prev.kind !== 'Ident') return null;
  if (prev.value.toUpperCase() !== 'IN') return null;

  // Find field: prev-prev ident (skipping over NOT).
  let fieldIdx = lparenIdx - 2;
  if (fieldIdx >= 0 && tokens[fieldIdx]!.kind === 'Ident' && tokens[fieldIdx]!.value.toUpperCase() === 'NOT') {
    fieldIdx--;
  }
  if (fieldIdx < 0) return null;
  const fieldTok = tokens[fieldIdx]!;
  if (fieldTok.kind !== 'Ident' && fieldTok.kind !== 'String' && fieldTok.kind !== 'CustomField') return null;

  // Collect picked values inside the list (String/Number/Ident tokens separated
  // by commas).
  const picked: string[] = [];
  for (let i = lparenIdx + 1; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (t.kind === 'String' || t.kind === 'Number' || t.kind === 'Ident') {
      picked.push(t.value);
    }
  }

  return {
    field:
      fieldTok.kind === 'Ident'
        ? fieldTok.value.toLowerCase()
        : fieldTok.kind === 'String'
          ? fieldTok.value
          : fieldTok.value,
    picked,
  };
}

function isAfterOrderBy(tokens: readonly Token[]): boolean {
  const last = tokens[tokens.length - 1]!;
  if (last.kind === 'Comma' || (last.kind === 'Ident' && last.value.toUpperCase() === 'BY')) {
    // Also confirm `ORDER BY` preceded this region.
    for (let i = tokens.length - 1; i >= 0; i--) {
      if (tokens[i]!.kind === 'Ident' && tokens[i]!.value.toUpperCase() === 'ORDER') return true;
    }
  }
  return false;
}

function detectFieldThenOp(tokens: readonly Token[]): { field: string; op: string } | null {
  if (tokens.length < 2) return null;
  const last = tokens[tokens.length - 1]!;
  const prev = tokens[tokens.length - 2]!;
  // Case: `priority =` → expect value.
  if (last.kind === 'Op' && (prev.kind === 'Ident' || prev.kind === 'CustomField' || prev.kind === 'String')) {
    return {
      field: fieldName(prev),
      op: last.value,
    };
  }
  // Case: `assignee IN` → expect value (without outer paren — bare `IN` case).
  if (last.kind === 'Ident' && last.value.toUpperCase() === 'IN' && (prev.kind === 'Ident' || prev.kind === 'CustomField' || prev.kind === 'String')) {
    return { field: fieldName(prev), op: 'IN' };
  }
  return null;
}

function isLikelyField(name: string): boolean {
  const upper = name.toUpperCase();
  // Keywords aren't fields.
  if (BOOLEAN_CONTINUATION.has(upper)) return false;
  if (upper === 'IN' || upper === 'IS' || upper === 'EMPTY' || upper === 'NULL' || upper === 'ORDER' || upper === 'BY') return false;
  // System fields are definitely fields.
  if (resolveSystemField(name)) return true;
  // Unknown idents at clause-start are still likely fields (user is typing a
  // custom-field name or an unknown identifier) — suggester will filter.
  return true;
}

function fieldName(t: Token): string {
  if (t.kind === 'Ident') return t.value.toLowerCase();
  if (t.kind === 'CustomField') return t.value;
  if (t.kind === 'String') return t.value;
  return '';
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function emptyField(): PositionContext {
  return { expected: 'field', prefix: '', inValueList: false, pickedValues: [] };
}

function withPrefix(ctx: PositionContext, prefix: string): PositionContext {
  return { ...ctx, prefix };
}

function extractPrefix(source: string, cursor: number, tokens: readonly Token[]): string {
  const last = tokens[tokens.length - 1]!;
  // Cursor sits right at end of last token → prefix = that token's lexeme.
  if (cursor === last.span.end) {
    if (last.kind === 'Ident') return last.value;
    if (last.kind === 'String') {
      // Strip surrounding quotes from prefix.
      return last.value;
    }
    return '';
  }
  // Cursor past the last token (whitespace after) → empty prefix.
  return '';
}
