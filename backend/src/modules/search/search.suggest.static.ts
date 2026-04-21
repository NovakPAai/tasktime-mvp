/**
 * TTSRH-1 PR-6 — static suggesters (no DB access).
 *
 * Covers: field names (from `SYSTEM_FIELDS` + custom-field registry), function
 * names (filtered by variant, MVP-only), enum constants (PRIORITY/STATUS_CATEGORY/
 * AI_STATUS/AI_ASSIGNEE_TYPE/CHECKPOINT_STATE), boolean literals, and offset
 * shortcuts for date fields.
 *
 * Static suggesters return results synchronously — no `await`, no cache key.
 * DB-backed providers live in `search.suggest.providers.ts`.
 */

import { SYSTEM_FIELDS, type CustomFieldDef } from './search.schema.js';
import { functionsForVariant } from './search.functions.js';
import type { QueryVariant, TtqlType } from './search.types.js';
import type { Completion } from './search.suggest.types.js';
import { rankByPrefix } from './search.suggest.rank.js';

// ─── Field suggester ────────────────────────────────────────────────────────

export function suggestFields(
  prefix: string,
  customFields: readonly CustomFieldDef[],
): Completion[] {
  const systemCompletions: Completion[] = SYSTEM_FIELDS.flatMap((f) => {
    const names = [f.name, ...f.synonyms];
    return names.map((n) => ({
      kind: 'field' as const,
      label: n === f.name ? f.label : `${f.label} (${n})`,
      insert: n,
      detail: describeType(f.type),
      score: 0,
    }));
  });

  const customCompletions: Completion[] = customFields.map((cf) => ({
    kind: 'field' as const,
    label: cf.name,
    insert: cf.name.includes(' ') ? `"${cf.name}"` : cf.name,
    detail: `custom · ${describeType(cf.type)}`,
    score: 0,
  }));

  return rankByPrefix([...systemCompletions, ...customCompletions], prefix);
}

// ─── Function suggester ────────────────────────────────────────────────────

export function suggestFunctions(prefix: string, variant: QueryVariant): Completion[] {
  const fns = functionsForVariant(variant).map((fn) => ({
    kind: 'function' as const,
    label: `${fn.name}(${fn.args.map((a) => (a.optional ? `[${a.name}]` : a.name)).join(', ')})`,
    insert: `${fn.name}(${requiredArgsPlaceholder(fn.args)})`,
    detail: fn.description,
    score: 0,
  }));
  return rankByPrefix(fns, prefix);
}

function requiredArgsPlaceholder(args: readonly { name: string; optional: boolean }[]): string {
  // For functions with no required args, insert just `()` so the user can keep
  // typing. For functions with required args, insert placeholders — the editor
  // can tab-navigate if it supports snippets.
  const required = args.filter((a) => !a.optional);
  if (required.length === 0) return '';
  return required.map((a) => `<${a.name}>`).join(', ');
}

// ─── Enum suggesters ───────────────────────────────────────────────────────

const PRIORITY_VALUES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
const STATUS_CATEGORY_VALUES = ['TODO', 'IN_PROGRESS', 'DONE'];
const AI_STATUS_VALUES = ['NOT_STARTED', 'IN_PROGRESS', 'DONE', 'FAILED'];
const AI_ASSIGNEE_TYPE_VALUES = ['HUMAN', 'AGENT', 'MIXED'];
const CHECKPOINT_STATE_VALUES = ['PENDING', 'ON_TRACK', 'WARNING', 'OVERDUE', 'ERROR', 'SATISFIED'];
const BOOL_VALUES = ['true', 'false'];

const ENUM_BY_FIELD: Record<string, readonly string[]> = {
  priority: PRIORITY_VALUES,
  statuscategory: STATUS_CATEGORY_VALUES,
  aistatus: AI_STATUS_VALUES,
  aiassigneetype: AI_ASSIGNEE_TYPE_VALUES,
  checkpointstate: CHECKPOINT_STATE_VALUES,
};

const ENUM_BY_TYPE: Partial<Record<TtqlType, readonly string[]>> = {
  PRIORITY: PRIORITY_VALUES,
  STATUS_CATEGORY: STATUS_CATEGORY_VALUES,
  AI_STATUS: AI_STATUS_VALUES,
  AI_ASSIGNEE_TYPE: AI_ASSIGNEE_TYPE_VALUES,
  CHECKPOINT_STATE: CHECKPOINT_STATE_VALUES,
};

export function suggestEnum(
  fieldName: string,
  prefix: string,
  picked: readonly string[] = [],
): Completion[] | null {
  const values = ENUM_BY_FIELD[fieldName.toLowerCase()];
  if (!values) return null;
  return enumCompletions(values, prefix, picked);
}

export function suggestEnumByType(
  type: TtqlType,
  prefix: string,
  picked: readonly string[] = [],
): Completion[] | null {
  const values = ENUM_BY_TYPE[type];
  if (!values) return null;
  return enumCompletions(values, prefix, picked);
}

function enumCompletions(values: readonly string[], prefix: string, picked: readonly string[]): Completion[] {
  const pickedLc = new Set(picked.map((p) => p.toLowerCase()));
  const filtered = values.filter((v) => !pickedLc.has(v.toLowerCase()));
  return rankByPrefix(
    filtered.map((v) => ({
      kind: 'value' as const,
      label: v,
      insert: v,
      score: 0,
    })),
    prefix,
  );
}

// ─── Boolean suggester ─────────────────────────────────────────────────────

export function suggestBool(prefix: string): Completion[] {
  return rankByPrefix(
    BOOL_VALUES.map((v) => ({ kind: 'value' as const, label: v, insert: v, score: 0 })),
    prefix,
  );
}

// ─── Relative-date / offset suggester ──────────────────────────────────────

const RELATIVE_SHORTCUTS = [
  { insert: '"-1d"', label: '"-1d" — yesterday' },
  { insert: '"-7d"', label: '"-7d" — last week' },
  { insert: '"-1M"', label: '"-1M" — last month' },
  { insert: '"1d"', label: '"1d" — tomorrow' },
  { insert: '"1w"', label: '"1w" — next week' },
  { insert: 'now()', label: 'now()' },
  { insert: 'today()', label: 'today()' },
  { insert: 'startOfDay()', label: 'startOfDay()' },
  { insert: 'startOfWeek()', label: 'startOfWeek()' },
  { insert: 'startOfMonth()', label: 'startOfMonth()' },
];

export function suggestDateShortcuts(prefix: string): Completion[] {
  return rankByPrefix(
    RELATIVE_SHORTCUTS.map((s) => ({
      kind: 'value' as const,
      label: s.label,
      insert: s.insert,
      score: 0,
    })),
    prefix,
  );
}

// ─── Operator suggester ────────────────────────────────────────────────────

const OP_BY_OP_KIND: Record<string, { label: string; insert: string }> = {
  EQ: { label: '=', insert: '=' },
  NEQ: { label: '!=', insert: '!=' },
  GT: { label: '>', insert: '>' },
  GTE: { label: '>=', insert: '>=' },
  LT: { label: '<', insert: '<' },
  LTE: { label: '<=', insert: '<=' },
  CONTAINS: { label: '~ (contains)', insert: '~' },
  NOT_CONTAINS: { label: '!~ (does not contain)', insert: '!~' },
  IN: { label: 'IN', insert: 'IN ' },
  NOT_IN: { label: 'NOT IN', insert: 'NOT IN ' },
  IS_EMPTY: { label: 'IS EMPTY', insert: 'IS EMPTY' },
  IS_NOT_EMPTY: { label: 'IS NOT EMPTY', insert: 'IS NOT EMPTY' },
};

/**
 * Operators allowed for a field. Works for system fields — custom fields get
 * their allowed ops from `CustomFieldDef.operators` directly (caller handles).
 */
export function suggestOperators(allowed: readonly string[], prefix: string): Completion[] {
  const completions = allowed
    .map((op) => OP_BY_OP_KIND[op])
    .filter((o): o is NonNullable<typeof o> => !!o)
    .map((o) => ({
      kind: 'operator' as const,
      label: o.label,
      insert: o.insert,
      score: 0,
    }));
  return rankByPrefix(completions, prefix);
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function describeType(t: TtqlType): string {
  // `AI_ASSIGNEE_TYPE` → `ai assignee type` — replace ALL underscores, not just
  // the first. Previous `.replace('_', ' ')` (string literal) missed every
  // underscore after position 0.
  return t.toLowerCase().replace(/_/g, ' ');
}
