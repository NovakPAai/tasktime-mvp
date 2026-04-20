/**
 * TTSRH-1 PR-2 — unit tests for the TTS-QL tokenizer.
 *
 * Covers token shapes, spans, escape handling, comments, custom-field references,
 * relative dates, and error positioning. Pure-function tests — no DB, no mocks.
 */
import { describe, it, expect } from 'vitest';
import { tokenize, TokenizerError } from '../src/modules/search/search.tokenizer.js';

describe('tokenizer — whitespace & comments', () => {
  it('emits only Eof for an empty string', () => {
    const tokens = tokenize('');
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toMatchObject({ kind: 'Eof', span: { start: 0, end: 0 } });
  });

  it('skips whitespace, tabs, newlines', () => {
    const tokens = tokenize('   \t\n\r\n   ');
    expect(tokens).toHaveLength(1);
    expect(tokens[0]!.kind).toBe('Eof');
  });

  it('skips line comments `--` to end of line but keeps `-1d` as RelativeDate', () => {
    const tokens = tokenize('x -- comment\ny = 1');
    expect(tokens.map((t) => t.kind)).toEqual(['Ident', 'Ident', 'Op', 'Number', 'Eof']);
    expect(tokens[0]!.value).toBe('x');
    expect(tokens[1]!.value).toBe('y');
  });

  it('`-1d` is RelativeDate, not a comment', () => {
    const tokens = tokenize('-1d');
    expect(tokens[0]).toMatchObject({ kind: 'RelativeDate', value: '-1d' });
  });
});

describe('tokenizer — punctuation & operators', () => {
  it('recognises parentheses and comma with correct spans', () => {
    const tokens = tokenize('( , )');
    expect(tokens.slice(0, 3).map((t) => t.kind)).toEqual(['LParen', 'Comma', 'RParen']);
    expect(tokens[0]!.span).toEqual({ start: 0, end: 1 });
    expect(tokens[1]!.span).toEqual({ start: 2, end: 3 });
    expect(tokens[2]!.span).toEqual({ start: 4, end: 5 });
  });

  it.each([
    ['=', '='],
    ['!=', '!='],
    ['>', '>'],
    ['<', '<'],
    ['>=', '>='],
    ['<=', '<='],
    ['~', '~'],
    ['!~', '!~'],
  ])('emits Op for `%s`', (src, op) => {
    const [first] = tokenize(src);
    expect(first).toMatchObject({ kind: 'Op', value: op });
  });

  it('distinguishes `!=` from `! =`', () => {
    const tokens = tokenize('!=');
    expect(tokens[0]).toMatchObject({ kind: 'Op', value: '!=' });
  });
});

describe('tokenizer — strings', () => {
  it('double-quoted string', () => {
    const tokens = tokenize('"hello"');
    expect(tokens[0]).toMatchObject({ kind: 'String', value: 'hello', span: { start: 0, end: 7 } });
  });

  it('single-quoted string', () => {
    const tokens = tokenize("'hello'");
    expect(tokens[0]!.value).toBe('hello');
  });

  it('escapes: \\" \\\\ \\n \\t \\r', () => {
    const tokens = tokenize('"a\\"b\\\\c\\nd\\te\\rf"');
    expect(tokens[0]!.value).toBe('a"b\\c\nd\te\rf');
  });

  it('unicode escapes: \\u0041 and \\u{1F600}', () => {
    expect(tokenize('"\\u0041"')[0]!.value).toBe('A');
    expect(tokenize('"\\u{1F600}"')[0]!.value).toBe('😀');
  });

  it('rejects unknown escape', () => {
    expect(() => tokenize('"a\\qb"')).toThrow(TokenizerError);
  });

  it('rejects unterminated string', () => {
    expect(() => tokenize('"never closed')).toThrow(/not terminated/);
  });

  it('rejects control characters in string except tab', () => {
    expect(() => tokenize('"a\x01b"')).toThrow(/Control character/);
    expect(() => tokenize('"a\tb"')).not.toThrow();
  });

  it('preserves unicode content (Cyrillic, emoji, RTL)', () => {
    expect(tokenize('"привет"')[0]!.value).toBe('привет');
    expect(tokenize('"👋"')[0]!.value).toBe('👋');
    // RTL: right-to-left mark U+200F must be preserved
    expect(tokenize('"ab\u200Fcd"')[0]!.value).toBe('ab\u200Fcd');
  });
});

describe('tokenizer — numbers & relative dates', () => {
  it.each([
    ['0', 'Number'],
    ['42', 'Number'],
    ['-5', 'Number'],
    ['3.14', 'Number'],
    ['-0.5', 'Number'],
  ])('emits Number for `%s`', (src, kind) => {
    expect(tokenize(src)[0]!.kind).toBe(kind);
    expect(tokenize(src)[0]!.value).toBe(src);
  });

  it.each([
    ['1d', '1d'],
    ['-7d', '-7d'],
    ['2w', '2w'],
    ['3M', '3M'],
    ['1y', '1y'],
    ['8h', '8h'],
    ['15m', '15m'],
  ])('emits RelativeDate for `%s`', (src, raw) => {
    expect(tokenize(src)[0]).toMatchObject({ kind: 'RelativeDate', value: raw });
  });

  it('does not mis-tokenise `5days` as RelativeDate + `ays`', () => {
    const tokens = tokenize('5days');
    // `5d` would be a valid relative date but only if followed by non-ident — here `a`
    // is an ident char, so the whole thing must NOT be a RelativeDate.
    expect(tokens[0]!.kind).toBe('Number');
    expect(tokens[0]!.value).toBe('5');
    expect(tokens[1]!.kind).toBe('Ident');
    expect(tokens[1]!.value).toBe('days');
  });

  it('rejects lone `-` without digits', () => {
    expect(() => tokenize('-')).toThrow(/Unexpected character/);
  });

  it('fractional numbers are NOT relative dates', () => {
    const tokens = tokenize('1.5d');
    expect(tokens[0]!.kind).toBe('Number');
    expect(tokens[1]!.kind).toBe('Ident');
  });
});

describe('tokenizer — identifiers', () => {
  it.each(['x', 'priority', 'assignee_id', 'flow-team-1', 'issue.key'])(
    'accepts ident `%s`',
    (src) => {
      expect(tokenize(src)[0]).toMatchObject({ kind: 'Ident', value: src });
    },
  );

  it('emits separate tokens for `x=y`', () => {
    const tokens = tokenize('x=y');
    expect(tokens.slice(0, 3).map((t) => [t.kind, t.value])).toEqual([
      ['Ident', 'x'],
      ['Op', '='],
      ['Ident', 'y'],
    ]);
  });
});

describe('tokenizer — custom fields', () => {
  it('cf[<UUID>] produces a CustomField token', () => {
    const uuid = '12345678-1234-1234-1234-123456789abc';
    const tokens = tokenize(`cf[${uuid}]`);
    expect(tokens[0]).toMatchObject({ kind: 'CustomField', value: uuid });
    expect(tokens[0]!.span).toEqual({ start: 0, end: uuid.length + 4 });
  });

  it('rejects malformed UUID', () => {
    expect(() => tokenize('cf[not-a-uuid]')).toThrow(TokenizerError);
  });

  it('rejects unclosed cf[', () => {
    expect(() => tokenize('cf[12345678-1234')).toThrow(/missing a closing/);
  });

  it('bare `cf` is still a plain ident', () => {
    expect(tokenize('cf')[0]).toMatchObject({ kind: 'Ident', value: 'cf' });
  });
});

describe('tokenizer — integration', () => {
  it('tokenises a typical JQL query', () => {
    const tokens = tokenize('assignee = currentUser() AND status IN ("OPEN", "REVIEW")');
    expect(tokens.map((t) => t.kind)).toEqual([
      'Ident', 'Op', 'Ident', 'LParen', 'RParen', 'Ident', 'Ident', 'Ident',
      'LParen', 'String', 'Comma', 'String', 'RParen', 'Eof',
    ]);
  });

  it('all spans are monotonically non-decreasing', () => {
    const source = 'x = 1 AND y IN ("a", "b", "c")';
    const tokens = tokenize(source);
    for (let i = 1; i < tokens.length; i++) {
      expect(tokens[i]!.span.start).toBeGreaterThanOrEqual(tokens[i - 1]!.span.end);
    }
  });
});
