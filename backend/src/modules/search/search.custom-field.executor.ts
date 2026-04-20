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

import type { Prisma } from '@prisma/client';
import { prisma } from '../../prisma/client.js';
import type { CustomFieldPredicate } from './search.custom-field.js';
import {
  assertNoUnresolvedPlaceholders,
  PLACEHOLDER_KEY,
} from './search.compiler.js';

/**
 * Run every CF predicate via `$queryRaw`, then substitute placeholders in the
 * where-input. Returns a new where-input — the input is not mutated.
 */
export async function executeCustomFieldPredicates(
  where: Prisma.IssueWhereInput,
  predicates: readonly CustomFieldPredicate[],
): Promise<Prisma.IssueWhereInput> {
  if (predicates.length === 0) {
    // Still assert — defensively catches bugs where an alias would be emitted
    // without a corresponding predicate (which should be impossible but the
    // assertion keeps the invariant honest).
    assertNoUnresolvedPlaceholders(where);
    return where;
  }

  // Run every predicate in parallel. Each returns `{ issue_id: string }[]`.
  const results = await Promise.all(
    predicates.map(async (pred) => {
      const rows = await prisma.$queryRaw<Array<{ issue_id: string }>>(pred.rawSql);
      return { pred, ids: rows.map((r) => r.issue_id) };
    }),
  );

  const substitutions = new Map<string, Prisma.IssueWhereInput>();
  for (const { pred, ids } of results) {
    const clause: Prisma.IssueWhereInput = { id: { in: ids } };
    substitutions.set(pred.alias, pred.negated ? { NOT: clause } : clause);
  }

  const substituted = substituteAliases(where, substitutions);
  assertNoUnresolvedPlaceholders(substituted);
  return substituted;
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
