/**
 * TTSRH-1 PR-6 — public types for the TTS-QL suggest pipeline.
 *
 * Matches §5.11 ТЗ contract. Shape is stable across versions — frontend
 * consumers (CodeMirror autocomplete, Basic-builder chip popovers) bind to it.
 */

import type { QueryVariant, TtqlType } from './search.types.js';

export type CompletionKind = 'field' | 'operator' | 'function' | 'value' | 'keyword';

/** Visual indicator next to a completion item. */
export interface CompletionIcon {
  kind: 'avatar' | 'color-dot' | 'svg' | 'emoji';
  /** URL for avatar, hex for color-dot, identifier for svg/emoji. */
  value: string;
}

export interface Completion {
  kind: CompletionKind;
  /** What the user sees in the popup row. */
  label: string;
  /** What gets inserted on Tab/Enter — pre-escaped, with quotes if needed. */
  insert: string;
  /** Optional secondary text (email for users, category for statuses, etc.). */
  detail?: string;
  icon?: CompletionIcon;
  /** 0..1 ranking score — higher = more relevant. Callers sort DESC. */
  score: number;
}

export type ExpectedKind =
  | 'field'
  | 'operator'
  | 'value'
  | 'keyword'
  | 'function-arg';

/** Snapshot of what the cursor is looking at. Output of the position analyser. */
export interface PositionContext {
  expected: ExpectedKind;
  /** Text from the last significant boundary to the cursor — the partial word. */
  prefix: string;
  /** Resolved field when `expected === 'value' | 'operator'`. */
  field?: string;
  /** Resolved operator when `expected === 'value'`. */
  operator?: string;
  /** True when cursor is inside an `IN (…)` list — caller may want to dedupe. */
  inValueList: boolean;
  /** Values already picked inside the current `IN (…)` — used to dedupe. */
  pickedValues: readonly string[];
}

/** Context passed to the suggest pipeline. */
export interface SuggestContext {
  userId: string;
  accessibleProjectIds: readonly string[];
  variant: QueryVariant;
  /**
   * Optional explicit overrides — used by the Basic-builder chip popover, which
   * provides `field`/`operator`/`prefix` directly instead of asking the position
   * analyser to derive them from raw JQL.
   */
  field?: string;
  operator?: string;
  prefix?: string;
}

export interface SuggestResponse {
  completions: Completion[];
  context: {
    expectedField?: string;
    expectedType?: TtqlType | 'OFFSET' | 'ISSUE_KEY';
    inValueList: boolean;
  };
}
