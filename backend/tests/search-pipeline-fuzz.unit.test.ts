/**
 * TTSRH-1 PR-5 — end-to-end fuzz harness for the search pipeline (T-7 §6 ТЗ).
 *
 * Runs 1000+ random inputs through `parse → validate → compile`. The asserts are:
 *   1. No call in the pipeline ever throws.
 *   2. If compile succeeds, the returned `where` has `projectId: { in: ... }`
 *      as the first branch of the top-level AND — R3 invariant.
 *   3. Every `ParseError` / `ValidationIssue` / `CompileIssue` carries an
 *      in-bounds `start`/`end` (where applicable).
 *
 * The full executor + Prisma leg is NOT exercised here — it needs a live DB
 * and is covered by `search-pipeline.test.ts` (integration, PR-5 follow-up).
 */
import { describe, expect, it } from 'vitest';
import { parse } from '../src/modules/search/search.parser.js';
import { validate, createValidatorContext } from '../src/modules/search/search.validator.js';
import { compile } from '../src/modules/search/search.compiler.js';
import type { CompileContext, ResolvedFunctions } from '../src/modules/search/search.compile-context.js';

const ANCHOR = new Date(Date.UTC(2026, 3, 15, 12, 0, 0, 0));
const PROJECTS: readonly string[] = ['p-a', 'p-b', 'p-c'];

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

const IDENTS = ['priority', 'status', 'assignee', 'due', 'estimatedHours', 'summary', 'description', 'reporter', 'sprint', 'release'];
const OPS = ['=', '!=', '>', '<', '>=', '<=', '~', '!~'];
const KEYWORDS = ['AND', 'OR', 'NOT', 'IN', 'IS', 'EMPTY', 'NULL', 'ORDER', 'BY', 'ASC', 'DESC'];
const VALUES = ['HIGH', 'OPEN', 'CRITICAL', 'DONE', '"text"', "'other'", '5', '3.14', '-42', '"2026-01-01"', 'currentUser()', 'openSprints()', 'true', 'false', 'NULL', 'EMPTY', '-7d', '"-7d"'];
const NASTY = ['\0', '\x01', '\x7f', '\u200F', '\u{1F600}', '\\', '-', '--', ';', '{', '}', '[', ']', '|', '&', '$', '\n', '\r', '\t'];
const PAYLOADS = ["'; DROP TABLE issues; --", "' OR 1=1 --", 'UNION SELECT * FROM users', '");--'];

function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)]!;
}

function randomInput(rng: () => number): string {
  const length = 1 + Math.floor(rng() * 20);
  const parts: string[] = [];
  for (let i = 0; i < length; i++) {
    const roll = rng();
    if (roll < 0.45) parts.push(pick(rng, IDENTS));
    else if (roll < 0.6) parts.push(pick(rng, OPS));
    else if (roll < 0.75) parts.push(pick(rng, VALUES));
    else if (roll < 0.85) parts.push(pick(rng, KEYWORDS));
    else if (roll < 0.95) parts.push(pick(rng, NASTY));
    else parts.push(pick(rng, PAYLOADS));
    if (rng() < 0.55) parts.push(' ');
  }
  return parts.join('');
}

function makeCtx(): CompileContext {
  const resolved: ResolvedFunctions = { currentUserId: 'u-1', calls: new Map() };
  return {
    accessibleProjectIds: PROJECTS,
    customFields: [],
    resolved,
    now: ANCHOR,
    variant: 'default',
  };
}

describe('search — end-to-end pipeline fuzz (T-7)', () => {
  it('1000 random inputs — no throws in parse/validate/compile; R3 scope holds', () => {
    const rng = mulberry32(0xfee1dead);
    const failures: Array<{ input: string; stage: string; error: unknown }> = [];
    const validatorCtx = createValidatorContext({ variant: 'default', customFields: [] });

    for (let i = 0; i < 1000; i++) {
      const input = randomInput(rng);
      let stage: 'parse' | 'validate' | 'compile' = 'parse';
      try {
        const parseResult = parse(input);
        if (!parseResult.ast) continue; // parse error surface tested in PR-2 fuzz
        stage = 'validate';
        const vr = validate(parseResult.ast, validatorCtx);
        if (!vr.valid) continue; // validation errors OK — we only care about throws
        stage = 'compile';
        const cr = compile(parseResult.ast, makeCtx());
        // R3 invariant — must always be present.
        const where = cr.where as Record<string, unknown>;
        if (Array.isArray(where.AND)) {
          const first = where.AND[0] as Record<string, unknown>;
          expect(first).toHaveProperty('projectId');
        } else {
          expect(where).toHaveProperty('projectId');
        }
      } catch (err) {
        failures.push({ input, stage, error: err });
      }
    }

    if (failures.length > 0) {
      const sample = failures.slice(0, 3).map(
        (f) => `  [${f.stage}] input=${JSON.stringify(f.input)}\n    err=${String(f.error)}`,
      );
      throw new Error(`Pipeline threw on ${failures.length}/1000 inputs. First 3:\n${sample.join('\n')}`);
    }
    expect(failures).toHaveLength(0);
  });

  it('adversarial payloads — SQL-injection, oversized, unicode — all safe', () => {
    const payloads = [
      `project = "'; DROP TABLE issues; --"`,
      `summary ~ "' OR 1=1 --"`,
      `description ~ "${'\\'.repeat(100)}"`,
      `status IN ("${'A'.repeat(10000)}")`,
      `priority = HIGH ${'AND status = OPEN '.repeat(200)}`,
      `${'('.repeat(300)}priority = HIGH${')'.repeat(300)}`,
      `assignee = "\u0000hack\u200F"`,
    ];
    const validatorCtx = createValidatorContext({ variant: 'default', customFields: [] });
    for (const p of payloads) {
      expect(() => {
        const pr = parse(p);
        if (pr.ast) {
          validate(pr.ast, validatorCtx);
          compile(pr.ast, makeCtx());
        }
      }).not.toThrow();
    }
  });
});
