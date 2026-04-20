/**
 * TTSRH-1 PR-2 — tokenizer for TTS-QL.
 *
 * Hand-written char-by-char lexer. No external regex compilation in hot loop — each
 * recognizer reads a small prefix at the cursor. This is deliberate: fuzz-tests in
 * TTSRH-11 throw unicode, RTL, null-byte and control chars at the input, and we want
 * bounded per-char work.
 *
 * Tokens emitted:
 *   - String        "..."  '...' with \"  \\  \n \t \u{HEX} escapes
 *   - Number        -?\d+(\.\d+)?
 *   - RelativeDate  -?\d+[dwMyhm]        (bare form; quoted stays as String)
 *   - Ident         [A-Za-z_][A-Za-z0-9_\-\.]*
 *   - CustomField   cf[UUID]
 *   - Op            = != > >= < <= ~ !~
 *   - LParen / RParen / Comma
 *   - Eof (sentinel)
 *
 * Keywords (AND/OR/NOT/IN/IS/EMPTY/NULL/ORDER/BY/ASC/DESC/TRUE/FALSE/WAS/CHANGED/
 * FROM/TO/AFTER/BEFORE/ON/DURING) are emitted as Ident — parser disambiguates by
 * case-insensitive match on the value. This keeps the tokenizer value-agnostic and
 * makes it trivial to extend.
 *
 * Comments: `--` to end of line, outside of strings. Ignored (whitespace-equivalent).
 */

import type { Span } from './search.ast.js';

export type TokenKind =
  | 'String'
  | 'Number'
  | 'RelativeDate'
  | 'Ident'
  | 'CustomField'
  | 'Op'
  | 'LParen'
  | 'RParen'
  | 'Comma'
  | 'Eof';

export interface Token {
  kind: TokenKind;
  /** For String — the decoded value (escapes resolved). For all others — the raw lexeme. */
  value: string;
  span: Span;
}

export class TokenizerError extends Error {
  readonly code: 'UNEXPECTED_CHARACTER' | 'UNTERMINATED_STRING' | 'INVALID_ESCAPE' | 'INVALID_CUSTOM_FIELD';
  readonly start: number;
  readonly end: number;
  constructor(code: TokenizerError['code'], message: string, start: number, end: number) {
    super(message);
    this.code = code;
    this.start = start;
    this.end = end;
  }
}

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const RELATIVE_UNITS = new Set(['d', 'w', 'M', 'y', 'h', 'm']);

/** Tokenize a TTS-QL source string. Throws `TokenizerError` on invalid input. */
export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let pos = 0;
  const n = source.length;

  while (pos < n) {
    const ch = source[pos]!;

    // Whitespace
    if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') {
      pos++;
      continue;
    }

    // Comment: -- to end of line. Only when NOT followed by digit/unit (to avoid
    // eating a bare relative date like `-1d`). `--` is the comment; `-1d` starts
    // with `-` then digit.
    if (ch === '-' && source[pos + 1] === '-') {
      while (pos < n && source[pos] !== '\n') pos++;
      continue;
    }

    // Punctuation
    if (ch === '(') { tokens.push({ kind: 'LParen', value: '(', span: { start: pos, end: pos + 1 } }); pos++; continue; }
    if (ch === ')') { tokens.push({ kind: 'RParen', value: ')', span: { start: pos, end: pos + 1 } }); pos++; continue; }
    if (ch === ',') { tokens.push({ kind: 'Comma', value: ',', span: { start: pos, end: pos + 1 } }); pos++; continue; }

    // Two-char operators
    if (ch === '!' && source[pos + 1] === '=') {
      tokens.push({ kind: 'Op', value: '!=', span: { start: pos, end: pos + 2 } });
      pos += 2;
      continue;
    }
    if (ch === '!' && source[pos + 1] === '~') {
      tokens.push({ kind: 'Op', value: '!~', span: { start: pos, end: pos + 2 } });
      pos += 2;
      continue;
    }
    if (ch === '>' && source[pos + 1] === '=') {
      tokens.push({ kind: 'Op', value: '>=', span: { start: pos, end: pos + 2 } });
      pos += 2;
      continue;
    }
    if (ch === '<' && source[pos + 1] === '=') {
      tokens.push({ kind: 'Op', value: '<=', span: { start: pos, end: pos + 2 } });
      pos += 2;
      continue;
    }

    // Single-char operators
    if (ch === '=' || ch === '>' || ch === '<' || ch === '~') {
      tokens.push({ kind: 'Op', value: ch, span: { start: pos, end: pos + 1 } });
      pos++;
      continue;
    }

    // String
    if (ch === '"' || ch === "'") {
      const [tok, next] = readString(source, pos, ch);
      tokens.push(tok);
      pos = next;
      continue;
    }

    // CustomField: cf[UUID]. Match before Ident because `cf` alone is a valid Ident.
    // We validate the UUID shape at tokenizer level (not at parser/validator) because
    // a malformed `cf[...]` is unambiguously invalid — there's no user-facing reason to
    // defer. This is an intentional deviation from the "value-agnostic tokenizer"
    // principle documented in §5.5 ТЗ; see pre-push review.
    if (ch === 'c' && source[pos + 1] === 'f' && source[pos + 2] === '[') {
      const close = source.indexOf(']', pos + 3);
      if (close < 0) {
        throw new TokenizerError(
          'INVALID_CUSTOM_FIELD',
          'Custom field reference `cf[...]` is missing a closing `]`.',
          pos,
          n,
        );
      }
      const uuid = source.slice(pos + 3, close);
      if (!UUID_RE.test(uuid)) {
        throw new TokenizerError(
          'INVALID_CUSTOM_FIELD',
          `Custom field reference must contain a UUID, got \`${uuid}\`.`,
          pos,
          close + 1,
        );
      }
      tokens.push({ kind: 'CustomField', value: uuid, span: { start: pos, end: close + 1 } });
      pos = close + 1;
      continue;
    }

    // Number / RelativeDate (possibly negative)
    if (ch === '-' || (ch >= '0' && ch <= '9')) {
      const [tok, next] = readNumberOrRelative(source, pos);
      if (tok) {
        tokens.push(tok);
        pos = next;
        continue;
      }
      // Standalone `-` without digits — not a valid token.
      throw new TokenizerError(
        'UNEXPECTED_CHARACTER',
        `Unexpected character \`${ch}\` at position ${pos}.`,
        pos,
        pos + 1,
      );
    }

    // Ident
    if (isIdentStart(ch)) {
      const start = pos;
      pos++;
      while (pos < n && isIdentPart(source[pos]!)) pos++;
      tokens.push({ kind: 'Ident', value: source.slice(start, pos), span: { start, end: pos } });
      continue;
    }

    throw new TokenizerError(
      'UNEXPECTED_CHARACTER',
      `Unexpected character \`${ch}\` at position ${pos}.`,
      pos,
      pos + 1,
    );
  }

  tokens.push({ kind: 'Eof', value: '', span: { start: n, end: n } });
  return tokens;
}

function isIdentStart(ch: string): boolean {
  return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_';
}

function isIdentPart(ch: string): boolean {
  return isIdentStart(ch) || (ch >= '0' && ch <= '9') || ch === '-' || ch === '.';
}

/**
 * Read a double- or single-quoted string. Supports these escapes inside the quotes:
 *   \"  \'  \\  \n  \t  \r  \u{HEX}  \uHHHH
 * Any other `\X` pair is rejected with INVALID_ESCAPE — we want authors to notice
 * typos rather than silently interpreting `\n` as a literal `n`.
 *
 * Cross-quote escapes (`\'` inside `"..."` and `\"` inside `'...'`) are **accepted**.
 * This is intentionally more permissive than stock Jira JQL — they're harmless and
 * reduce friction when copy-pasting queries from documentation.
 *
 * **Rejected codepoints**: lone surrogates (U+D800–U+DFFF) and the null codepoint
 * (U+0000). The former would produce invalid UTF-8 downstream (Postgres text columns
 * reject lone surrogates); the latter is the C-string terminator and breaks Prisma's
 * parameter binding in rare cases. Pre-push review flagged both as latent hazards.
 */
function readString(source: string, pos: number, quote: string): [Token, number] {
  const start = pos;
  pos++; // skip opening quote
  let value = '';
  const n = source.length;

  while (pos < n) {
    const ch = source[pos]!;
    if (ch === quote) {
      return [{ kind: 'String', value, span: { start, end: pos + 1 } }, pos + 1];
    }
    if (ch === '\\') {
      if (pos + 1 >= n) {
        throw new TokenizerError(
          'UNTERMINATED_STRING',
          'String ended inside an escape sequence.',
          start,
          n,
        );
      }
      const esc = source[pos + 1]!;
      switch (esc) {
        case '"': value += '"'; pos += 2; break;
        case "'": value += "'"; pos += 2; break;
        case '\\': value += '\\'; pos += 2; break;
        case 'n': value += '\n'; pos += 2; break;
        case 't': value += '\t'; pos += 2; break;
        case 'r': value += '\r'; pos += 2; break;
        case 'u': {
          // \u{HEX} or \uHHHH
          if (source[pos + 2] === '{') {
            const close = source.indexOf('}', pos + 3);
            if (close < 0) {
              throw new TokenizerError(
                'INVALID_ESCAPE',
                'Unicode escape `\\u{...}` is missing a closing `}`.',
                pos,
                n,
              );
            }
            const hex = source.slice(pos + 3, close);
            const code = Number.parseInt(hex, 16);
            if (!/^[0-9a-fA-F]+$/.test(hex) || !Number.isFinite(code) || code > 0x10ffff) {
              throw new TokenizerError(
                'INVALID_ESCAPE',
                `Invalid unicode escape \`\\u{${hex}}\`.`,
                pos,
                close + 1,
              );
            }
            rejectForbiddenCodepoint(code, pos, close + 1);
            value += String.fromCodePoint(code);
            pos = close + 1;
          } else {
            const hex = source.slice(pos + 2, pos + 6);
            if (hex.length !== 4 || !/^[0-9a-fA-F]{4}$/.test(hex)) {
              throw new TokenizerError(
                'INVALID_ESCAPE',
                `Invalid unicode escape \`\\u${hex}\`.`,
                pos,
                Math.min(pos + 6, n),
              );
            }
            const code = Number.parseInt(hex, 16);
            rejectForbiddenCodepoint(code, pos, pos + 6);
            value += String.fromCharCode(code);
            pos += 6;
          }
          break;
        }
        default:
          throw new TokenizerError(
            'INVALID_ESCAPE',
            `Unknown escape sequence \`\\${esc}\`.`,
            pos,
            pos + 2,
          );
      }
      continue;
    }
    // Reject control characters other than tab (keep literal tabs for convenience)
    const code = source.charCodeAt(pos);
    if (code < 0x20 && code !== 0x09) {
      throw new TokenizerError(
        'UNEXPECTED_CHARACTER',
        `Control character U+${code.toString(16).padStart(4, '0').toUpperCase()} is not allowed in a string.`,
        pos,
        pos + 1,
      );
    }
    value += ch;
    pos++;
  }

  // Clamp the end of the reported span — underlining from the opening quote to EOF
  // spams CodeMirror with noise for long queries. One-quote span is enough for the
  // editor to place a squiggle at the offending character.
  throw new TokenizerError(
    'UNTERMINATED_STRING',
    `String starting at position ${start} is not terminated.`,
    start,
    Math.min(start + 1, n),
  );
}

/**
 * Reject codepoints that would create trouble downstream:
 *   - surrogates (U+D800..U+DFFF): Postgres UTF-8 text columns reject them;
 *   - null byte (U+0000): terminates C strings, unsafe in some binding paths.
 */
function rejectForbiddenCodepoint(code: number, start: number, end: number): void {
  if (code === 0) {
    throw new TokenizerError(
      'INVALID_ESCAPE',
      'Null codepoint (U+0000) is not allowed in a string literal.',
      start,
      end,
    );
  }
  if (code >= 0xd800 && code <= 0xdfff) {
    throw new TokenizerError(
      'INVALID_ESCAPE',
      `Codepoint U+${code.toString(16).toUpperCase()} is a surrogate and cannot appear in a string literal.`,
      start,
      end,
    );
  }
}

/**
 * Read a numeric literal. Returns RelativeDate when the digits are followed by a
 * unit suffix (d, w, M, y, h, m) at a word boundary, otherwise a plain Number.
 * Returns [null, pos] when the prefix is not a valid number (e.g. standalone `-`).
 */
function readNumberOrRelative(source: string, pos: number): [Token | null, number] {
  const start = pos;
  let end = pos;
  if (source[end] === '-') end++;
  const digitsStart = end;
  while (end < source.length && source[end]! >= '0' && source[end]! <= '9') end++;
  if (end === digitsStart) {
    // `-` with no digits after — reject.
    return [null, pos];
  }

  // Fractional part
  let hasFraction = false;
  if (source[end] === '.' && source[end + 1] !== undefined && source[end + 1]! >= '0' && source[end + 1]! <= '9') {
    hasFraction = true;
    end++;
    while (end < source.length && source[end]! >= '0' && source[end]! <= '9') end++;
  }

  // RelativeDate suffix. Must be followed by a non-ident char (or EOF) to count —
  // otherwise `5days` would be mis-tokenised as `5d` + `ays`.
  const unit = source[end];
  if (unit && RELATIVE_UNITS.has(unit) && !hasFraction) {
    const afterUnit = source[end + 1];
    if (afterUnit === undefined || !isIdentPart(afterUnit)) {
      const raw = source.slice(start, end + 1);
      return [
        { kind: 'RelativeDate', value: raw, span: { start, end: end + 1 } },
        end + 1,
      ];
    }
  }

  const raw = source.slice(start, end);
  return [
    { kind: 'Number', value: raw, span: { start, end } },
    end,
  ];
}
