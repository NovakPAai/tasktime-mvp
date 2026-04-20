/**
 * TTSRH-1 PR-4 — compile context + pre-resolved function outputs.
 *
 * The compiler is deliberately DB-agnostic: it consumes `CompileContext` with
 * everything already resolved (user id, sprint ids, release ids, issue ids from
 * `linkedIssues(...)` etc.). Async DB look-ups live in `search.function-resolver.ts`.
 *
 * This separation makes unit tests fast (no Postgres needed) and keeps the
 * compiler itself a pure function — easy to audit for the R1 (SQL-injection)
 * invariant: every identifier, every value, and every enum reaches Prisma
 * through the typed Prisma input types, never through string concatenation.
 */

import type { CustomFieldDef } from './search.schema.js';
import type { QueryVariant } from './search.types.js';

/**
 * Function call key — canonical, positional serialisation used to dedupe function
 * calls within an AST. `membersOf("team")` and `membersOf("team")` must share a key;
 * `membersOf("a")` and `membersOf("b")` must not.
 *
 * Format: `<lowercase-name>(<arg1>,<arg2>,...)` where each arg is JSON-stringified
 * into a stable form (strings quoted, idents as-is). Only applied to function calls
 * the validator has already accepted — malformed args won't reach here.
 */
export type FunctionCallKey = string;

/** Pre-resolved outputs of function calls. Populated by `search.function-resolver.ts`. */
export interface ResolvedFunctions {
  /** Current user id — `null` in checkpoint variant (§5.12.4). */
  currentUserId: string | null;
  /**
   * Map from function-call key to resolved value. Shape depends on function:
   *   - `membersOf("x")` → `string[]` of user ids
   *   - `openSprints()` → `string[]` of sprint ids
   *   - `linkedIssues("TTMP-1", "blocks")` → `string[]` of issue ids
   *   - date helpers are evaluated via `search.functions.evaluatePureDateFn` in the
   *     compiler itself — no entry needed here.
   */
  calls: ReadonlyMap<FunctionCallKey, FunctionCallValue>;
}

/** A resolved function call: either a scalar or a list of primary-key ids. */
export type FunctionCallValue =
  | { kind: 'scalar-id'; id: string | null }     // currentUser() / earliestUnreleasedVersion()
  | { kind: 'id-list'; ids: readonly string[] }  // openSprints() / linkedIssues()
  | { kind: 'scalar-datetime'; value: Date }     // only for KT-context functions (Phase 2 wiring)
  | { kind: 'resolve-failed'; reason: string };  // signals compiler to emit empty-set predicate

/**
 * Context passed to the compiler. Everything here is deterministic for a given
 * request — no ambient globals, no mutable state.
 */
export interface CompileContext {
  /**
   * Project ids the caller may see. The compiler adds `{ projectId: { in: ... } }`
   * at the top of every query (§5.5 + R3 ТЗ). Empty array = no access → compiler
   * produces a where-clause that matches nothing.
   */
  accessibleProjectIds: readonly string[];
  /** Custom-field registry (already loaded in the caller, typically via Redis cache). */
  customFields: readonly CustomFieldDef[];
  /** Pre-resolved DB-dependent function outputs. */
  resolved: ResolvedFunctions;
  /** Anchor `now` for date evaluators. Fixed per request — no Date.now() in compiler. */
  now: Date;
  /** `'default'` for user search, `'checkpoint'` for KT conditions. */
  variant: QueryVariant;
}

/**
 * Serialise a function call to its deduping key. Kept deterministic so repeated
 * references inside one AST hit the same cache entry.
 */
export function buildFunctionCallKey(name: string, args: readonly FunctionCallArg[]): FunctionCallKey {
  const encoded = args.map(encodeArg).join(',');
  return `${name.toLowerCase()}(${encoded})`;
}

export type FunctionCallArg =
  | { kind: 'string'; value: string }
  | { kind: 'number'; value: number }
  | { kind: 'ident'; name: string }
  | { kind: 'bool'; value: boolean }
  | { kind: 'null' };

function encodeArg(a: FunctionCallArg): string {
  switch (a.kind) {
    case 'string': return JSON.stringify(a.value);
    case 'number': return String(a.value);
    case 'bool': return String(a.value);
    case 'null': return 'null';
    case 'ident': return `#${a.name.toLowerCase()}`;
  }
}
