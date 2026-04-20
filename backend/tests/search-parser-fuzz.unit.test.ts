/**
 * TTSRH-1 PR-2 — fuzz-harness for tokenizer + parser.
 *
 * Generates 1000+ seeded random inputs (T-7 in §6 ТЗ) and asserts that `parse(src)`
 * never throws: it must always return `{ ast, errors }` with either a QueryNode or a
 * populated errors array. This is the security-adjacent invariant — an unhandled
 * throw in the request path would bubble to a 500, so R1 (SQL-injection via JQL)
 * can't start here.
 *
 * Random inputs lean on payloads that have historically broken hand-written parsers:
 * mixed quotes, unterminated strings, unicode RTL, null bytes, control chars, nested
 * parens, binary-looking bytes, Postgres-style SQL fragments.
 */
import { describe, expect, it } from 'vitest';
import { parse } from '../src/modules/search/search.parser.js';

/** Mulberry32 — tiny seeded PRNG; deterministic across runs/platforms. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TOKENS = [
  'priority', 'status', 'assignee', 'project', 'due', 'sprint', 'release', 'key',
  '=', '!=', '>', '<', '>=', '<=', '~', '!~',
  'AND', 'OR', 'NOT', 'IN', 'IS', 'EMPTY', 'NULL', 'ORDER', 'BY', 'ASC', 'DESC', 'true', 'false',
  '(', ')', ',',
  '"open"', "'review'", '"a\\"b"', '"unterminated',
  'currentUser()', 'openSprints()', 'membersOf("team")',
  '-1d', '-7d', '3M', '"7d"',
  '5', '3.14', '-0.5',
  '1', '2', 'HIGH', 'CRITICAL',
  'cf[12345678-1234-1234-1234-123456789abc]',
];

const NASTY_CHARS = [
  '\0',       // null byte
  '\x01',     // control
  '\x7f',     // DEL
  '\u200F',   // RTL mark
  '\u{1F600}',// emoji
  '\\',       // stray backslash
  '-',        // dangling minus
  '--',       // starts a comment
  ';', '{', '}', '[', ']', '|', '&', '$', '!',
  '\n', '\r', '\t',
];

const SQL_PAYLOADS = [
  "'; DROP TABLE issues; --",
  "' OR 1=1 --",
  '\\x27;--',
  '") OR ("1"="1',
  'UNION SELECT * FROM users',
];

function pickFrom<T>(rng: () => number, pool: readonly T[]): T {
  return pool[Math.floor(rng() * pool.length)]!;
}

function randomInput(rng: () => number): string {
  const length = 1 + Math.floor(rng() * 30);
  const parts: string[] = [];
  for (let i = 0; i < length; i++) {
    const roll = rng();
    if (roll < 0.7) parts.push(pickFrom(rng, TOKENS));
    else if (roll < 0.85) parts.push(pickFrom(rng, NASTY_CHARS));
    else if (roll < 0.95) parts.push(pickFrom(rng, SQL_PAYLOADS));
    else {
      // Random codepoint across BMP to exercise unicode paths.
      const cp = Math.floor(rng() * 0x10000);
      parts.push(String.fromCodePoint(cp));
    }
    if (rng() < 0.6) parts.push(' ');
  }
  return parts.join('');
}

describe('parser — fuzz harness (T-7)', () => {
  it('1000 random inputs — no throw, always returns a ParseResult', () => {
    const rng = mulberry32(0xcafe_babe);
    const failures: Array<{ input: string; error: unknown }> = [];

    for (let i = 0; i < 1000; i++) {
      const input = randomInput(rng);
      try {
        const result = parse(input);
        // Invariant: result must have both fields; if ast is null, errors must be non-empty.
        expect(result).toHaveProperty('ast');
        expect(result).toHaveProperty('errors');
        if (result.ast === null) expect(result.errors.length).toBeGreaterThan(0);
        // Every error must have a well-formed span within the source.
        for (const err of result.errors) {
          expect(err.start).toBeGreaterThanOrEqual(0);
          expect(err.end).toBeGreaterThanOrEqual(err.start);
          expect(err.end).toBeLessThanOrEqual(input.length);
        }
      } catch (err) {
        failures.push({ input, error: err });
      }
    }

    if (failures.length > 0) {
      const sample = failures.slice(0, 5).map(
        (f) => `  input=${JSON.stringify(f.input)}\n  err=${String(f.error)}`,
      );
      throw new Error(
        `parse() threw on ${failures.length}/1000 inputs. First 5:\n${sample.join('\n')}`,
      );
    }
    expect(failures).toHaveLength(0);
  });

  it('targeted payloads — SQL-injection style strings parse or error cleanly', () => {
    const payloads = [
      `project = "'; DROP TABLE issues; --"`,
      `summary ~ "' OR 1=1 --"`,
      `description ~ "${'\\'.repeat(100)}"`,
      `status IN ("${'A'.repeat(10000)}")`,
      `x = 1 ${'AND y = 2 '.repeat(500)}`,
      `${'('.repeat(200)}x = 1${')'.repeat(200)}`,
    ];
    for (const p of payloads) {
      expect(() => parse(p)).not.toThrow();
    }
  });
});
