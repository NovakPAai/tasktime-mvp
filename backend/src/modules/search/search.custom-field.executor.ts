/**
 * TTSRH-1 PR-5 — executor for custom-field raw-SQL predicates.
 *
 * The compiler (PR-4) emits each custom-field clause as a `CustomFieldPredicate`
 * with a parameterised `Prisma.Sql` fragment and an `alias` placeholder inside
 * the returned `where`. This module runs every predicate's raw SELECT via
 * `$queryRaw`, collects the matching `issue.id` sets, and substitutes the
 * placeholders in the where-input with real `{ id: { in: [...] } }` clauses.
 *
 * Ordering matters: placeholders must be substituted **before** the assembled
 * where reaches `prisma.issue.findMany`, or Prisma will either silently ignore
 * the unknown key (dropping the CF filter — correctness bug) or throw at
 * runtime. `assertNoUnresolvedPlaceholders` is called as a defensive net before
 * every query.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '../../prisma/client.js';
import type { CustomFieldPredicate } from './search.custom-field.js';
import type { CompileIssue } from './search.compiler.js';
import {
  assertNoUnresolvedPlaceholders,
  PLACEHOLDER_KEY,
} from './search.compiler.js';

export interface ExecuteResult {
  where: Prisma.IssueWhereInput;
  /** Per-predicate failures (bad SQL, DB error) surfaced to the service layer. */
  errors: CompileIssue[];
}

/**
 * Run every CF predicate via `$queryRaw`, then substitute placeholders in the
 * where-input. Returns a new where-input — the input is not mutated.
 *
 * **R3 scope enforcement at raw-SQL layer.** We wrap each predicate's inner
 * `SELECT issue_id` with an outer filter joining against the `issues` table's
 * `project_id`. Without this, a broad CF filter would materialise ids from
 * projects the caller can't see into Node memory (even though the compiler's
 * top-level AND would strip them from the final result). The wrap also
 * bounds memory on pathological CF queries.
 *
 * Uses `Promise.allSettled` (not `Promise.all`) — one bad predicate shouldn't
 * kill the whole search. Rejected predicates are surfaced as `CompileIssue`s
 * with the offending alias, so the service can return 422 with context.
 */
export async function executeCustomFieldPredicates(
  where: Prisma.IssueWhereInput,
  predicates: readonly CustomFieldPredicate[],
  accessibleProjectIds: readonly string[],
): Promise<ExecuteResult> {
  if (predicates.length === 0) {
    // Still assert — defensively catches bugs where an alias would be emitted
    // without a corresponding predicate (which should be impossible but the
    // assertion keeps the invariant honest).
    assertNoUnresolvedPlaceholders(where);
    return { where, errors: [] };
  }

  // Empty accessible-projects → every CF predicate returns no rows, short-circuit.
  if (accessibleProjectIds.length === 0) {
    const substitutions = new Map<string, Prisma.IssueWhereInput>();
    for (const pred of predicates) {
      substitutions.set(pred.alias, { id: { in: [] } });
    }
    return { where: substituteAliases(where, substitutions), errors: [] };
  }

  const settled = await Promise.allSettled(
    predicates.map(async (pred) => {
      const scoped = Prisma.sql`
        SELECT q.issue_id FROM (${pred.rawSql}) q
        WHERE q.issue_id IN (
          SELECT id FROM issues WHERE project_id IN (${Prisma.join([...accessibleProjectIds])})
        )`;
      const rows = await prisma.$queryRaw<Array<{ issue_id: string }>>(scoped);
      return { pred, ids: rows.map((r) => r.issue_id) };
    }),
  );

  const substitutions = new Map<string, Prisma.IssueWhereInput>();
  const errors: CompileIssue[] = [];
  for (let i = 0; i < settled.length; i++) {
    const result = settled[i]!;
    const pred = predicates[i]!;
    if (result.status === 'fulfilled') {
      const clause: Prisma.IssueWhereInput = { id: { in: result.value.ids } };
      substitutions.set(pred.alias, pred.negated ? { NOT: clause } : clause);
    } else {
      // Predicate failed — replace with match-none so the rest of the query
      // still runs, and surface the error to the service.
      substitutions.set(pred.alias, { id: { in: [] } });
      const reason = result.reason instanceof Error ? result.reason.message : String(result.reason);
      errors.push({
        code: 'UNRESOLVED_VALUE',
        message: `Custom-field predicate \`${pred.alias}\` (cf=${pred.customFieldId}) failed: ${reason}`,
      });
    }
  }

  const substituted = substituteAliases(where, substitutions);
  assertNoUnresolvedPlaceholders(substituted);
  return { where: substituted, errors };
}

/**
 * Recursively walk a where-input and replace every `{ [PLACEHOLDER_KEY]: alias }`
 * node with the pre-computed `{ id: { in: ids } }` clause.
 */
function substituteAliases(
  input: unknown,
  substitutions: Map<string, Prisma.IssueWhereInput>,
): Prisma.IssueWhereInput {
  if (Array.isArray(input)) {
    return (input.map((item) => substituteAliases(item, substitutions)) as unknown) as Prisma.IssueWhereInput;
  }
  if (input === null || typeof input !== 'object') {
    return input as Prisma.IssueWhereInput;
  }
  const obj = input as Record<string, unknown>;
  // Placeholder node: `{ __ttql_custom_predicate__: alias }` — replace with the
  // precomputed substitution.
  if (PLACEHOLDER_KEY in obj && Object.keys(obj).length === 1) {
    const alias = obj[PLACEHOLDER_KEY];
    if (typeof alias === 'string') {
      const hit = substitutions.get(alias);
      if (hit) return hit;
      throw new Error(`BUG: placeholder \`${alias}\` has no substitution; compiler emitted it without a matching CustomFieldPredicate.`);
    }
  }
  // Regular object — recurse into each value.
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = substituteAliases(v, substitutions);
  }
  return out as Prisma.IssueWhereInput;
}
