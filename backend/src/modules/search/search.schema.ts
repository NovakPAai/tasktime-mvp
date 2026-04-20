/**
 * TTSRH-1 PR-3 — field registry for TTS-QL (pure-core).
 *
 * Two layers:
 *   1. System fields: immutable, listed in §5.2 ТЗ. Canonical name + synonyms.
 *   2. Custom fields: dynamic. The **loader** lives in `search.schema.loader.ts`
 *      — it depends on Prisma + Redis. Keeping those imports out of this file lets
 *      the validator + tests run without touching the database layer.
 *
 * Lookups are case-insensitive. The registry is read-only from the validator's
 * perspective — it never mutates.
 */

import type { CustomFieldType } from '@prisma/client';
import type { TtqlOpKind, TtqlType } from './search.types.js';

// ─── System field definitions ───────────────────────────────────────────────

export interface FieldDef {
  /** Canonical lowercase name — what `resolveField` returns. */
  name: string;
  type: TtqlType;
  synonyms: string[];
  operators: readonly TtqlOpKind[];
  sortable: boolean;
  /** Human-readable label for the schema endpoint — shown in chip pickers. */
  label: string;
  /** Short description — tooltip material. */
  description?: string;
}

const CMP_NUM: readonly TtqlOpKind[] = ['EQ', 'NEQ', 'GT', 'GTE', 'LT', 'LTE', 'IS_EMPTY', 'IS_NOT_EMPTY'];
const CMP_DATE: readonly TtqlOpKind[] = ['EQ', 'NEQ', 'GT', 'GTE', 'LT', 'LTE', 'IS_EMPTY', 'IS_NOT_EMPTY'];
const CMP_REF: readonly TtqlOpKind[] = ['EQ', 'NEQ', 'IN', 'NOT_IN', 'IS_EMPTY', 'IS_NOT_EMPTY'];
const CMP_ENUM: readonly TtqlOpKind[] = ['EQ', 'NEQ', 'IN', 'NOT_IN'];
const CMP_TEXT: readonly TtqlOpKind[] = ['CONTAINS', 'NOT_CONTAINS', 'EQ', 'NEQ', 'IS_EMPTY', 'IS_NOT_EMPTY'];
const CMP_BOOL: readonly TtqlOpKind[] = ['EQ'];
const CMP_LABEL: readonly TtqlOpKind[] = ['EQ', 'NEQ', 'IN', 'NOT_IN', 'IS_EMPTY', 'IS_NOT_EMPTY'];

export const SYSTEM_FIELDS: readonly FieldDef[] = [
  // Identity
  { name: 'project', synonyms: ['proj'], type: 'PROJECT', operators: CMP_REF, sortable: true, label: 'Project', description: 'Проект (по key или id)' },
  { name: 'key', synonyms: ['issuekey'], type: 'ISSUE', operators: ['EQ', 'NEQ', 'IN', 'NOT_IN'], sortable: true, label: 'Key', description: 'Ключ задачи, напр. TTMP-123' },
  // Text fields
  { name: 'summary', synonyms: ['title'], type: 'TEXT', operators: CMP_TEXT, sortable: true, label: 'Summary' },
  { name: 'description', synonyms: [], type: 'TEXT', operators: ['CONTAINS', 'NOT_CONTAINS', 'IS_EMPTY', 'IS_NOT_EMPTY'], sortable: false, label: 'Description' },
  { name: 'comment', synonyms: [], type: 'TEXT', operators: ['CONTAINS'], sortable: false, label: 'Comment' },
  // Status
  { name: 'status', synonyms: [], type: 'STATUS', operators: [...CMP_REF, 'WAS', 'WAS_NOT', 'WAS_IN', 'WAS_NOT_IN', 'CHANGED'] as readonly TtqlOpKind[], sortable: true, label: 'Status' },
  { name: 'statuscategory', synonyms: ['category'], type: 'STATUS_CATEGORY', operators: CMP_ENUM, sortable: false, label: 'Status Category' },
  // Priority
  { name: 'priority', synonyms: [], type: 'PRIORITY', operators: CMP_ENUM, sortable: true, label: 'Priority' },
  // Type
  { name: 'type', synonyms: ['issuetype'], type: 'ISSUE_TYPE', operators: CMP_REF, sortable: true, label: 'Type' },
  // Users
  { name: 'assignee', synonyms: [], type: 'USER', operators: CMP_REF, sortable: true, label: 'Assignee' },
  { name: 'reporter', synonyms: ['creator'], type: 'USER', operators: CMP_REF, sortable: true, label: 'Reporter' },
  // Planning
  { name: 'sprint', synonyms: [], type: 'SPRINT', operators: CMP_REF, sortable: true, label: 'Sprint' },
  { name: 'release', synonyms: ['fixversion'], type: 'RELEASE', operators: CMP_REF, sortable: true, label: 'Release' },
  // Hierarchy
  { name: 'parent', synonyms: [], type: 'ISSUE', operators: CMP_REF, sortable: false, label: 'Parent' },
  { name: 'epic', synonyms: [], type: 'ISSUE', operators: ['EQ', 'IN'], sortable: false, label: 'Epic' },
  { name: 'haschildren', synonyms: ['hassubtasks'], type: 'BOOL', operators: CMP_BOOL, sortable: false, label: 'Has children' },
  // Dates
  { name: 'due', synonyms: ['duedate'], type: 'DATE', operators: CMP_DATE, sortable: true, label: 'Due' },
  { name: 'created', synonyms: [], type: 'DATETIME', operators: CMP_DATE, sortable: true, label: 'Created' },
  { name: 'updated', synonyms: [], type: 'DATETIME', operators: CMP_DATE, sortable: true, label: 'Updated' },
  { name: 'resolvedat', synonyms: [], type: 'DATETIME', operators: CMP_DATE, sortable: true, label: 'Resolved at' },
  // Estimates / time
  { name: 'estimatedhours', synonyms: ['originalestimate'], type: 'NUMBER', operators: CMP_NUM, sortable: true, label: 'Estimated hours' },
  { name: 'timespent', synonyms: ['worklog'], type: 'NUMBER', operators: CMP_NUM, sortable: true, label: 'Time spent' },
  { name: 'timeremaining', synonyms: [], type: 'NUMBER', operators: CMP_NUM, sortable: true, label: 'Time remaining' },
  { name: 'orderindex', synonyms: [], type: 'NUMBER', operators: CMP_NUM, sortable: true, label: 'Order index' },
  // AI flags
  { name: 'aieligible', synonyms: [], type: 'BOOL', operators: CMP_BOOL, sortable: false, label: 'AI Eligible' },
  { name: 'aistatus', synonyms: [], type: 'AI_STATUS', operators: CMP_ENUM, sortable: false, label: 'AI Status' },
  { name: 'aiassigneetype', synonyms: [], type: 'AI_ASSIGNEE_TYPE', operators: CMP_ENUM, sortable: false, label: 'AI Assignee Type' },
  // Labels / links (special LHS for violatedCheckpoints shorthand — see §5.4.1)
  { name: 'labels', synonyms: ['label'], type: 'LABEL', operators: CMP_LABEL, sortable: false, label: 'Labels' },
  { name: 'linkedissue', synonyms: [], type: 'ISSUE', operators: ['EQ', 'IN'], sortable: false, label: 'Linked Issue' },
  // Pseudo-field `issue` — used by `issue IN funcCall()` and by the bare-function
  // shorthand rewriter in the parser (§5.4.1 ТЗ). It accepts only IN / NOT IN.
  { name: 'issue', synonyms: [], type: 'ISSUE', operators: ['IN', 'NOT_IN'], sortable: false, label: 'Issue (for IN funcCall())' },
  // Checkpoint-related fields (§5.2 extensions, TTSRH-37)
  { name: 'hascheckpointviolation', synonyms: ['hasviolation'], type: 'BOOL', operators: CMP_BOOL, sortable: false, label: 'Has checkpoint violation' },
  { name: 'checkpointviolationtype', synonyms: ['violationtype'], type: 'CHECKPOINT_TYPE', operators: CMP_REF, sortable: false, label: 'Violation type' },
  { name: 'checkpointviolationreason', synonyms: [], type: 'TEXT', operators: ['CONTAINS', 'NOT_CONTAINS'], sortable: false, label: 'Violation reason' },
];

// ─── Lookup index (case-insensitive, includes synonyms) ─────────────────────

const FIELD_INDEX: Map<string, FieldDef> = (() => {
  const map = new Map<string, FieldDef>();
  for (const f of SYSTEM_FIELDS) {
    map.set(f.name.toLowerCase(), f);
    for (const syn of f.synonyms) map.set(syn.toLowerCase(), f);
  }
  return map;
})();

/** Case-insensitive system-field lookup. Returns `null` if the name is not a system field. */
export function resolveSystemField(name: string): FieldDef | null {
  return FIELD_INDEX.get(name.toLowerCase()) ?? null;
}

// ─── Custom fields ──────────────────────────────────────────────────────────

export interface CustomFieldDef {
  id: string;
  name: string;
  /** TTS-QL type derived from the Prisma `CustomFieldType`. */
  type: TtqlType;
  operators: readonly TtqlOpKind[];
  /** Options for SELECT/MULTI_SELECT — exposed to suggest but not used by validator. */
  options?: unknown;
}

/**
 * Build a case-insensitive lookup for a batch of custom fields. Resolves BOTH by
 * canonical name (`"Story Points"` → the field) AND by UUID. When multiple fields
 * share the same case-insensitive name, resolution returns `'ambiguous'` so the
 * validator can emit an R7 warning and the compiler can require a scoping clause.
 */
export function buildCustomFieldIndex(defs: CustomFieldDef[]): CustomFieldIndex {
  const byName = new Map<string, CustomFieldDef | 'ambiguous'>();
  const byId = new Map<string, CustomFieldDef>();
  for (const def of defs) {
    byId.set(def.id, def);
    const key = def.name.toLowerCase();
    const existing = byName.get(key);
    if (existing === undefined) {
      byName.set(key, def);
    } else if (existing !== 'ambiguous' && existing.id !== def.id) {
      byName.set(key, 'ambiguous');
    }
  }
  return {
    resolveByName: (name) => byName.get(name.toLowerCase()) ?? null,
    resolveById: (id) => byId.get(id) ?? null,
    all: defs,
  };
}

export interface CustomFieldIndex {
  resolveByName(name: string): CustomFieldDef | 'ambiguous' | null;
  resolveById(id: string): CustomFieldDef | null;
  all: readonly CustomFieldDef[];
}

// ─── Mappers ────────────────────────────────────────────────────────────────

export function customFieldTypeToTtql(ft: CustomFieldType): TtqlType {
  switch (ft) {
    case 'TEXT':
    case 'TEXTAREA':
    case 'URL':
      return 'TEXT';
    case 'NUMBER':
    case 'DECIMAL':
      return 'NUMBER';
    case 'DATE':
      return 'DATE';
    case 'DATETIME':
      return 'DATETIME';
    case 'CHECKBOX':
      return 'BOOL';
    case 'SELECT':
    case 'MULTI_SELECT':
      return 'TEXT'; // options matched as strings (case-insensitive); validator doesn't
                     // enumerate options here — suggest layer handles that
    case 'LABEL':
      return 'LABEL';
    case 'USER':
      return 'USER';
    case 'REFERENCE':
      return 'JSON'; // target-type unknown at this layer; compiler resolves
    default: {
      const exhaustive: never = ft;
      void exhaustive;
      return 'JSON';
    }
  }
}

export function operatorsForCustomField(ft: CustomFieldType): readonly TtqlOpKind[] {
  switch (ft) {
    case 'TEXT':
    case 'TEXTAREA':
    case 'URL':
      return ['CONTAINS', 'NOT_CONTAINS', 'EQ', 'NEQ', 'IS_EMPTY', 'IS_NOT_EMPTY'];
    case 'NUMBER':
    case 'DECIMAL':
      return CMP_NUM;
    case 'DATE':
    case 'DATETIME':
      return CMP_DATE;
    case 'CHECKBOX':
      return CMP_BOOL;
    case 'SELECT':
      return ['EQ', 'NEQ', 'IN', 'NOT_IN', 'IS_EMPTY', 'IS_NOT_EMPTY'];
    case 'MULTI_SELECT':
    case 'LABEL':
      return CMP_LABEL;
    case 'USER':
      return CMP_REF;
    case 'REFERENCE':
      return ['EQ', 'NEQ', 'IN', 'IS_EMPTY', 'IS_NOT_EMPTY'];
    default: {
      const exhaustive: never = ft;
      void exhaustive;
      return ['EQ', 'NEQ'];
    }
  }
}
