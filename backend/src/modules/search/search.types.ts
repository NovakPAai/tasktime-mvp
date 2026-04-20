/**
 * TTSRH-1 PR-3 — shared type vocabulary for TTS-QL schema, functions, and validator.
 *
 * Grammar reference: docs/tz/TTSRH-1.md §5.2 (fields table) + §5.4 (function table).
 *
 * `TtqlType` is the semantic type system layered on top of the syntactic AST. The
 * validator uses it to reject operator/value type mismatches (e.g. `assignee > 5`
 * compares a User with a Number). Type rules are deliberately coarser than Prisma's
 * column types — we only need enough precision to catch user mistakes in the editor.
 */

export type TtqlType =
  | 'TEXT'
  | 'NUMBER'
  | 'DATE'
  | 'DATETIME'
  | 'BOOL'
  | 'USER'
  | 'PROJECT'
  | 'ISSUE'
  | 'SPRINT'
  | 'RELEASE'
  | 'STATUS'
  | 'STATUS_CATEGORY'
  | 'PRIORITY'
  | 'ISSUE_TYPE'
  | 'AI_STATUS'
  | 'AI_ASSIGNEE_TYPE'
  | 'CHECKPOINT_STATE'
  | 'CHECKPOINT_TYPE'
  | 'LABEL'   // multi-value string tag
  | 'GROUP'   // user-group name for membersOf() arg
  | 'JSON';   // opaque custom-field value when type unknown

/** Function-return type: either a scalar or a list (multi-row result). */
export type TtqlReturnType =
  | { kind: 'scalar'; type: TtqlType }
  | { kind: 'list'; type: TtqlType };

/** Operator categories — used both by field definitions and the validator. */
export type TtqlOpKind =
  | 'EQ' | 'NEQ'
  | 'GT' | 'GTE' | 'LT' | 'LTE'
  | 'CONTAINS' | 'NOT_CONTAINS'  // ~ / !~
  | 'IN' | 'NOT_IN'
  | 'IS_EMPTY' | 'IS_NOT_EMPTY'
  | 'WAS' | 'WAS_NOT' | 'WAS_IN' | 'WAS_NOT_IN'
  | 'CHANGED';

/** Feature-gate for functions: MVP (implemented now) vs Phase 2 (parser accepts, validator rejects). */
export type FunctionPhase = 'MVP' | 'PHASE_2';

/** Context variant — user search vs checkpoint-condition evaluation. §5.12.4 ТЗ. */
export type QueryVariant = 'default' | 'checkpoint';
