/**
 * TTSRH-1 PR-3 — unit tests for the TTS-QL semantic validator.
 *
 * Covers the full error-code surface (UNKNOWN_FIELD, OPERATOR_NOT_ALLOWED_FOR_FIELD,
 * VALUE_TYPE_MISMATCH, ARITY_MISMATCH, PHASE_2_OPERATOR, PHASE_2_FUNCTION,
 * FUNCTION_NOT_ALLOWED_IN_CONTEXT, CURRENTUSER_IN_CHECKPOINT, …) plus the full
 * golden-set round-trip (parse + validate, zero errors).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from '../src/modules/search/search.parser.js';
import {
  createValidatorContext,
  validate,
  type ValidationErrorCode,
  type ValidationResult,
} from '../src/modules/search/search.validator.js';
import type { CustomFieldDef } from '../src/modules/search/search.schema.js';

function runValidate(
  source: string,
  opts: { variant?: 'default' | 'checkpoint'; customFields?: CustomFieldDef[] } = {},
): ValidationResult {
  const { ast, errors: parseErrors } = parse(source);
  if (!ast) {
    throw new Error(`Parser failed for \`${source}\`: ${parseErrors.map((e) => e.code).join(', ')}`);
  }
  return validate(
    ast,
    createValidatorContext({ variant: opts.variant, customFields: opts.customFields ?? [] }),
  );
}

function expectCode(result: ValidationResult, code: ValidationErrorCode): void {
  const all = [...result.errors, ...result.warnings].map((i) => i.code);
  if (!all.includes(code)) {
    throw new Error(`expected code ${code}, got: ${all.join(', ') || '<none>'}`);
  }
}

// ─── Happy path ─────────────────────────────────────────────────────────────

describe('validator — happy path', () => {
  it.each([
    'priority = HIGH',
    'assignee = currentUser()',
    'status IN (OPEN, IN_PROGRESS)',
    'due <= "7d"',
    'assignee IS NOT EMPTY',
    'sprint IN openSprints()',
    'labels in ("backend", "security")',
    'created >= startOfMonth("-1M")',
    'hasCheckpointViolation = true',
    'myOpenIssues()',
    'issue in violatedCheckpoints()',
    'statusCategory != DONE ORDER BY priority DESC',
  ])('%s — valid', (source) => {
    const r = runValidate(source);
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual([]);
  });
});

// ─── Unknown field / function ───────────────────────────────────────────────

describe('validator — unknown symbols', () => {
  it('unknown field `bogus`', () => {
    const r = runValidate('bogus = 1');
    expectCode(r, 'UNKNOWN_FIELD');
    expect(r.valid).toBe(false);
  });

  it('unknown quoted field `"No Such Custom Field"`', () => {
    const r = runValidate('"No Such Custom Field" = 1');
    expectCode(r, 'UNKNOWN_FIELD');
  });

  it('unknown function', () => {
    const r = runValidate('assignee = noSuchFunc()');
    expectCode(r, 'UNKNOWN_FUNCTION');
  });
});

// ─── Operator × field compatibility ─────────────────────────────────────────

describe('validator — operator × field compatibility', () => {
  it('aieligible (BOOL) does not accept `>`', () => {
    const r = runValidate('aiEligible > true');
    expectCode(r, 'OPERATOR_NOT_ALLOWED_FOR_FIELD');
  });

  it('assignee (USER) does not accept `~`', () => {
    const r = runValidate('assignee ~ "Ivan"');
    expectCode(r, 'OPERATOR_NOT_ALLOWED_FOR_FIELD');
  });

  it('priority (enum) does not accept `>`', () => {
    const r = runValidate('priority > 5');
    expectCode(r, 'OPERATOR_NOT_ALLOWED_FOR_FIELD');
  });

  it('summary (TEXT) accepts `~`', () => {
    const r = runValidate('summary ~ "аутентификация"');
    expect(r.valid).toBe(true);
  });
});

// ─── Value type compatibility ───────────────────────────────────────────────

describe('validator — value type compatibility', () => {
  it('NUMBER field rejects string literal', () => {
    const r = runValidate('estimatedHours = "many"');
    expectCode(r, 'VALUE_TYPE_MISMATCH');
  });

  it('DATE field accepts relative-date string', () => {
    const r = runValidate('due <= "-1d"');
    expect(r.valid).toBe(true);
  });

  it('BOOL field rejects string literal', () => {
    const r = runValidate('aiEligible = "true"');
    expectCode(r, 'VALUE_TYPE_MISMATCH');
  });

  it('USER field rejects number literal', () => {
    const r = runValidate('assignee = 42');
    expectCode(r, 'VALUE_TYPE_MISMATCH');
  });
});

// ─── Function arity / arg types ─────────────────────────────────────────────

describe('validator — function arity and arg types', () => {
  it('currentUser() with extra arg', () => {
    const r = runValidate('assignee = currentUser("extra")');
    expectCode(r, 'ARITY_MISMATCH');
  });

  it('membersOf() with no arg', () => {
    const r = runValidate('assignee in membersOf()');
    expectCode(r, 'ARITY_MISMATCH');
  });

  it('startOfDay() with invalid offset format', () => {
    const r = runValidate('created >= startOfDay("not-an-offset")');
    expectCode(r, 'INVALID_OFFSET_FORMAT');
  });

  it('startOfDay("-7d") is valid', () => {
    const r = runValidate('created >= startOfDay("-7d")');
    expect(r.valid).toBe(true);
  });

  it('linkedIssues() with no key', () => {
    const r = runValidate('issue IN linkedIssues()');
    expectCode(r, 'ARITY_MISMATCH');
  });

  it('linkedIssues("TTMP-42", "blocks") — valid 2-arg', () => {
    const r = runValidate('issue in linkedIssues("TTMP-42", "blocks")');
    expect(r.valid).toBe(true);
  });
});

// ─── Phase 2 rejection ──────────────────────────────────────────────────────

describe('validator — Phase-2 features are rejected with clear codes', () => {
  it('WAS operator → PHASE_2_OPERATOR', () => {
    const r = runValidate('status WAS "DONE"');
    expectCode(r, 'PHASE_2_OPERATOR');
  });

  it('CHANGED → PHASE_2_OPERATOR', () => {
    const r = runValidate('status CHANGED');
    expectCode(r, 'PHASE_2_OPERATOR');
  });

  it('watchedIssues() → PHASE_2_FUNCTION', () => {
    const r = runValidate('issue in watchedIssues()');
    expectCode(r, 'PHASE_2_FUNCTION');
  });
});

// ─── Checkpoint context ─────────────────────────────────────────────────────

describe('validator — checkpoint variant', () => {
  it('currentUser() in checkpoint emits warning (not error)', () => {
    const r = runValidate('assignee = currentUser()', { variant: 'checkpoint' });
    // Still valid (currentUser IS available in checkpoint, but triggers WARNING).
    expect(r.valid).toBe(true);
    expect(r.warnings.map((w) => w.code)).toContain('CURRENTUSER_IN_CHECKPOINT');
  });

  it('releasePlannedDate() is valid only in checkpoint', () => {
    expect(runValidate('due <= releasePlannedDate()', { variant: 'checkpoint' }).valid).toBe(true);
    const r = runValidate('due <= releasePlannedDate()', { variant: 'default' });
    expectCode(r, 'FUNCTION_NOT_ALLOWED_IN_CONTEXT');
  });

  it('myOpenIssues() is NOT allowed in checkpoint context', () => {
    const r = runValidate('myOpenIssues()', { variant: 'checkpoint' });
    expectCode(r, 'FUNCTION_NOT_ALLOWED_IN_CONTEXT');
  });
});

// ─── Custom fields ──────────────────────────────────────────────────────────

describe('validator — custom fields', () => {
  const storyPoints: CustomFieldDef = {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'Story Points',
    type: 'NUMBER',
    operators: ['EQ', 'NEQ', 'GT', 'GTE', 'LT', 'LTE', 'IS_EMPTY', 'IS_NOT_EMPTY'],
    sortable: false,
    options: null,
  };

  it('resolves quoted custom field by name', () => {
    const r = runValidate('"Story Points" > 5', { customFields: [storyPoints] });
    expect(r.valid).toBe(true);
  });

  it('resolves cf[UUID]', () => {
    const r = runValidate(
      `cf[11111111-1111-1111-1111-111111111111] > 5`,
      { customFields: [storyPoints] },
    );
    expect(r.valid).toBe(true);
  });

  it('unknown custom UUID', () => {
    const r = runValidate(
      `cf[22222222-2222-2222-2222-222222222222] > 5`,
      { customFields: [storyPoints] },
    );
    expectCode(r, 'CUSTOM_FIELD_UUID_UNKNOWN');
  });

  it('ambiguous custom-field name', () => {
    const a: CustomFieldDef = { ...storyPoints, id: 'aaaaaaaa-1111-1111-1111-111111111111' };
    const b: CustomFieldDef = { ...storyPoints, id: 'bbbbbbbb-1111-1111-1111-111111111111' };
    const r = runValidate('"Story Points" > 5', { customFields: [a, b] });
    expectCode(r, 'AMBIGUOUS_CUSTOM_FIELD');
  });

  it('custom-field type propagates to value check', () => {
    const r = runValidate(`"Story Points" = "abc"`, { customFields: [storyPoints] });
    expectCode(r, 'VALUE_TYPE_MISMATCH');
  });
});

// ─── ORDER BY sortable warning ──────────────────────────────────────────────

describe('validator — ORDER BY on non-sortable field', () => {
  it('description is not sortable — ORDER_BY_NOT_SORTABLE warning', () => {
    // Use a known field to isolate the ORDER BY warning from other errors.
    const r = runValidate('description ~ "text" ORDER BY description');
    expect(r.valid).toBe(true);
    expect(r.warnings.map((w) => w.code)).toContain('ORDER_BY_NOT_SORTABLE');
  });

  it('priority IS sortable — no warning', () => {
    const r = runValidate('priority = HIGH ORDER BY priority');
    expect(r.warnings).toEqual([]);
    expect(r.valid).toBe(true);
  });

  it('custom field (always non-sortable in MVP) emits ORDER_BY_NOT_SORTABLE', () => {
    const cf: CustomFieldDef = {
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      name: 'Story Points',
      type: 'NUMBER',
      operators: ['EQ', 'NEQ', 'GT', 'GTE', 'LT', 'LTE', 'IS_EMPTY', 'IS_NOT_EMPTY'],
      sortable: false,
    };
    const r = runValidate('"Story Points" > 0 ORDER BY "Story Points"', { customFields: [cf] });
    expect(r.warnings.map((w) => w.code)).toContain('ORDER_BY_NOT_SORTABLE');
  });
});

// ─── Golden-set round trip ──────────────────────────────────────────────────

interface GoldenQuery {
  label: string;
  source: string;
  startLine: number;
}

function loadGoldenSet(): GoldenQuery[] {
  const path = resolve(__dirname, '../../docs/tz/TTSRH-1-goldenset.jql');
  const text = readFileSync(path, 'utf8');
  const lines = text.split('\n');
  const queries: GoldenQuery[] = [];
  let buf: string[] = [];
  let bufStartLine = 0;
  let lastLabel = '';
  const flush = () => {
    const source = buf.join('\n').trim();
    if (source) queries.push({ label: lastLabel, source, startLine: bufStartLine });
    buf = [];
    bufStartLine = 0;
  };
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    const line = raw.trim();
    if (line.startsWith('--')) {
      flush();
      const m = line.match(/^--\s*(\d{1,3})\b/);
      if (m) lastLabel = m[1]!;
      continue;
    }
    if (!line) { flush(); continue; }
    if (buf.length === 0) bufStartLine = i + 1;
    buf.push(raw);
  }
  flush();
  return queries;
}

// Seed a custom-field registry containing every quoted custom-field name used
// anywhere in the golden set. The validator rejects unknown names as UNKNOWN_FIELD,
// so we have to introduce them. The cf[UUID] in query #16 is a generic SELECT-style
// field holding a string, so it gets TEXT-like operators.
const GOLDEN_CUSTOM_FIELDS: CustomFieldDef[] = [
  {
    id: '12345678-1234-1234-1234-123456789abc',
    name: 'Release Status',
    type: 'TEXT',
    operators: ['EQ', 'NEQ', 'IN', 'NOT_IN', 'IS_EMPTY', 'IS_NOT_EMPTY'],
    sortable: false,
  },
  { id: '22222222-2222-2222-2222-222222222201', name: 'Story Points', type: 'NUMBER', operators: ['EQ', 'NEQ', 'GT', 'GTE', 'LT', 'LTE', 'IS_EMPTY', 'IS_NOT_EMPTY'], sortable: false },
  { id: '22222222-2222-2222-2222-222222222202', name: 'Business Value', type: 'NUMBER', operators: ['EQ', 'NEQ', 'GT', 'GTE', 'LT', 'LTE', 'IS_EMPTY', 'IS_NOT_EMPTY'], sortable: false },
  { id: '22222222-2222-2222-2222-222222222203', name: 'Effort', type: 'NUMBER', operators: ['EQ', 'NEQ', 'GT', 'GTE', 'LT', 'LTE', 'IS_EMPTY', 'IS_NOT_EMPTY'], sortable: false },
];

describe('validator — golden-set round trip', () => {
  const queries = loadGoldenSet();

  it('loaded >= 50 queries', () => {
    expect(queries.length).toBeGreaterThanOrEqual(50);
  });

  it.each(queries.map((q) => [q.label || '?', q.source.replace(/\s+/g, ' '), q] as const))(
    'query #%s: `%s`',
    (_label, _preview, q) => {
      const result = runValidate(q.source, { customFields: GOLDEN_CUSTOM_FIELDS });
      if (!result.valid) {
        const msg = result.errors
          .map((e) => `  [${e.code}] ${e.message} at [${e.start}..${e.end}]`)
          .join('\n');
        throw new Error(`Golden query #${q.label} (line ${q.startLine}) failed:\n${msg}\nSource: ${q.source}`);
      }
      expect(result.valid).toBe(true);
    },
  );
});
