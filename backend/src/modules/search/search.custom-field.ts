/**
 * TTSRH-1 PR-4 — custom-field clause compiler.
 *
 * Custom-field values live in `issue_custom_field_values.value` (JSONB). Prisma
 * can't express JSON comparisons typed-fully, so we emit parameterised `Prisma.sql`
 * fragments that the executor runs via `$queryRaw` to get matching `issue_id`s,
 * then stitches into the parent query via `{ id: { in: ... } }`.
 *
 * Security invariant (R1): every value reaches the SQL through `${...}` Prisma
 * interpolation, which quotes with PG-native escape rules. **No string concat of
 * user input.** Custom-field IDs are UUIDs from `ctx.customFields[].id` — also
 * parameterised, never interpolated.
 */

import { Prisma, type CustomFieldType } from '@prisma/client';
import type { ClauseNode, Expr, FunctionCall } from './search.ast.js';
import type { CompileContext, FunctionCallValue } from './search.compile-context.js';
import type { CustomFieldDef } from './search.schema.js';
import type { CompileIssue } from './search.compiler.js';

/**
 * Intermediate representation of a custom-field predicate. The executor (PR-5)
 * interprets these: runs `rawSql` with `$queryRaw`, gets a list of `issue_id`s,
 * and replaces `{ __ttql_custom_predicate__: alias }` placeholders in the
 * Prisma where-input with `{ id: { in: theseIds } }`.
 */
export interface CustomFieldPredicate {
  alias: string;
  customFieldId: string;
  /** If true, executor wraps the id-set in `{ NOT: { id: { in: ... } } }`. */
  negated: boolean;
  /** Ready-to-execute `SELECT issue_id FROM issue_custom_field_values WHERE ...`. */
  rawSql: Prisma.Sql;
}

export interface CustomClauseCompiled {
  predicate: CustomFieldPredicate;
  errors: CompileIssue[];
}

/**
 * Compile a single clause whose LHS is a custom field into a `Prisma.Sql`
 * fragment. Returns a predicate + any non-fatal errors (fatal errors produce an
 * empty predicate that matches nothing).
 */
/**
 * Function-call resolver interface. Typed as a small shape to avoid a circular
 * import with `search.compiler.ts` (where the concrete resolver lives).
 */
export interface FunctionResolver {
  resolveFunctionCall(fn: FunctionCall): FunctionCallValue;
}

export function compileCustomFieldClause(
  c: ClauseNode,
  cf: CustomFieldDef,
  alias: string,
  ctx: CompileContext,
  builder: FunctionResolver,
): CustomClauseCompiled {
  const errors: CompileIssue[] = [];
  const empty = (reason: string): CustomClauseCompiled => {
    errors.push({ code: 'UNRESOLVED_VALUE', message: reason, field: cf.name });
    return {
      predicate: {
        alias,
        customFieldId: cf.id,
        negated: false,
        rawSql: Prisma.sql`SELECT NULL::text WHERE FALSE`,
      },
      errors,
    };
  };

  switch (c.op.kind) {
    case 'Compare': {
      const sql = buildCompareSql(cf, c.op.op, c.op.value, builder);
      if (!sql) return empty(`Cannot compile ${c.op.op} on custom field \`${cf.name}\`.`);
      return wrap(sql, alias, cf.id, false, errors);
    }
    case 'In': {
      const sql = buildInSql(cf, c.op.values, builder);
      if (!sql) return empty(`Cannot compile IN on custom field \`${cf.name}\`.`);
      return wrap(sql, alias, cf.id, c.op.negated, errors);
    }
    case 'InFunction': {
      // cf IN funcCall() — not a real-world pattern for custom fields in MVP.
      return empty(`IN funcCall() on a custom field is not supported in MVP.`);
    }
    case 'IsEmpty': {
      // IS EMPTY = there is no row in issue_custom_field_values for this CF.
      // We compile this as a positive SELECT that returns all issues WITHOUT a row
      // for this CF. Negation is applied by the executor.
      const sql = c.op.negated
        ? Prisma.sql`SELECT icfv.issue_id FROM issue_custom_field_values icfv WHERE icfv.custom_field_id = ${cf.id}::uuid`
        : Prisma.sql`SELECT i.id AS issue_id FROM issues i WHERE NOT EXISTS (SELECT 1 FROM issue_custom_field_values icfv WHERE icfv.issue_id = i.id AND icfv.custom_field_id = ${cf.id}::uuid)`;
      return wrap(sql, alias, cf.id, false, errors); // negation already baked in
    }
    case 'History':
      return empty(`History operators (WAS/CHANGED) are not yet supported on custom fields.`);
  }
  // Unreachable — all ClauseOp kinds are covered above. TypeScript's exhaustiveness
  // check prevents new kinds from silently falling through.
  return empty(`Unhandled custom-field clause.`);
}

// CompileContext may be needed later for timezone/locale-aware operations; keep
// the import alive even though the current builders don't consume it.
void ({} as CompileContext);

function wrap(rawSql: Prisma.Sql, alias: string, cfId: string, negated: boolean, errors: CompileIssue[]): CustomClauseCompiled {
  return {
    predicate: { alias, customFieldId: cfId, negated, rawSql },
    errors,
  };
}

// ─── Per-op SQL builders ────────────────────────────────────────────────────

function buildCompareSql(
  cf: CustomFieldDef,
  op: string,
  valueExpr: Expr,
  builder: FunctionResolver,
): Prisma.Sql | null {
  // Resolve value into a SQL-embeddable form.
  const value = literalToSqlValue(valueExpr, cf.fieldType, builder);
  if (value === null) return null;

  // `~` / `!~` — string contains (case-insensitive) on JSON-extracted text.
  if (op === '~' || op === '!~') {
    if (typeof value !== 'string') return null;
    const like = Prisma.sql`${'%' + value.slice(0, 200) + '%'}`;
    const body = valueJsonText(cf.fieldType);
    const filter = op === '~'
      ? Prisma.sql`${body} ILIKE ${like}`
      : Prisma.sql`(${body} IS NULL OR ${body} NOT ILIKE ${like})`;
    return selectWhere(cf.id, filter);
  }

  // For LABEL / MULTI_SELECT — EQ / NEQ checks membership in the JSON array.
  if ((cf.fieldType === 'LABEL' || cf.fieldType === 'MULTI_SELECT') && (op === '=' || op === '!=')) {
    const containment = Prisma.sql`icfv.value @> to_jsonb(${value}::text)`;
    const body = op === '=' ? containment : Prisma.sql`NOT (${containment})`;
    return selectWhere(cf.id, body);
  }

  // Default: comparator on typed body.
  const body = valueTypedForCompare(cf.fieldType, value);
  if (!body) return null;
  const comparator = sqlComparator(op);
  if (!comparator) return null;
  const filter = Prisma.sql`${body} ${Prisma.raw(comparator)} ${value}`;
  return selectWhere(cf.id, filter);
}

function buildInSql(
  cf: CustomFieldDef,
  values: Expr[],
  builder: FunctionResolver,
): Prisma.Sql | null {
  if (values.length === 0) return null;
  const resolved: unknown[] = [];
  for (const v of values) {
    const r = literalToSqlValue(v, cf.fieldType, builder);
    if (r === null) return null;
    resolved.push(r);
  }
  // LABEL/MULTI_SELECT — match if any of the values is contained in the array.
  if (cf.fieldType === 'LABEL' || cf.fieldType === 'MULTI_SELECT') {
    const orParts = resolved.map((v) => Prisma.sql`icfv.value @> to_jsonb(${v as string}::text)`);
    const joined = Prisma.join(orParts, ' OR ');
    return selectWhere(cf.id, joined);
  }
  const body = valueTypedForCompare(cf.fieldType, resolved[0]);
  if (!body) return null;
  const filter = Prisma.sql`${body} IN (${Prisma.join(resolved)})`;
  return selectWhere(cf.id, filter);
}

// ─── JSON-extract helpers ───────────────────────────────────────────────────

/** Text extraction for `~` / `!~`. Always uses ->>'v' or falls back to text(value). */
function valueJsonText(ft: CustomFieldType): Prisma.Sql {
  switch (ft) {
    case 'TEXT':
    case 'TEXTAREA':
    case 'URL':
      return Prisma.sql`(icfv.value->>'v')`;
    case 'SELECT':
      return Prisma.sql`(icfv.value->>'v')`;
    default:
      return Prisma.sql`(icfv.value::text)`;
  }
}

/**
 * Typed JSON extraction for comparator predicates. Returns the correct cast so
 * `=`, `>` etc. use PG's native ordering for the data type.
 */
function valueTypedForCompare(ft: CustomFieldType, sample: unknown): Prisma.Sql | null {
  switch (ft) {
    case 'TEXT':
    case 'TEXTAREA':
    case 'URL':
    case 'SELECT':
      if (typeof sample !== 'string') return null;
      return Prisma.sql`(icfv.value->>'v')`;
    case 'NUMBER':
    case 'DECIMAL':
      if (typeof sample !== 'number') return null;
      return Prisma.sql`((icfv.value->>'n')::numeric)`;
    case 'DATE':
      if (!(sample instanceof Date)) return null;
      return Prisma.sql`((icfv.value->>'d')::date)`;
    case 'DATETIME':
      if (!(sample instanceof Date)) return null;
      return Prisma.sql`((icfv.value->>'d')::timestamp)`;
    case 'CHECKBOX':
      if (typeof sample !== 'boolean') return null;
      return Prisma.sql`((icfv.value->>'b')::boolean)`;
    case 'USER':
    case 'REFERENCE':
      if (typeof sample !== 'string') return null;
      return Prisma.sql`(icfv.value->>'v')`;
    default:
      return null;
  }
}

function sqlComparator(op: string): string | null {
  switch (op) {
    case '=': return '=';
    case '!=': return '<>';
    case '>': return '>';
    case '>=': return '>=';
    case '<': return '<';
    case '<=': return '<=';
    default: return null;
  }
}

function selectWhere(cfId: string, filter: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`SELECT icfv.issue_id FROM issue_custom_field_values icfv WHERE icfv.custom_field_id = ${cfId}::uuid AND (${filter})`;
}

// ─── Value conversion from AST ──────────────────────────────────────────────

function literalToSqlValue(expr: Expr, ft: CustomFieldType, builder: FunctionResolver): string | number | Date | boolean | null | undefined {
  if (expr.kind === 'Function') {
    const r = builder.resolveFunctionCall(expr);
    if (r.kind === 'scalar-id') return r.id ?? undefined;
    if (r.kind === 'scalar-datetime') return r.value;
    // id-list and resolve-failed → not a scalar, caller rejects.
    return undefined;
  }
  switch (expr.kind) {
    case 'Null': case 'Empty': return null;
    case 'Bool': return expr.value;
    case 'Number': return expr.value;
    case 'String':
      if (ft === 'DATE' || ft === 'DATETIME') {
        const d = new Date(expr.value);
        return Number.isFinite(d.getTime()) ? d : undefined;
      }
      return expr.value;
    case 'RelativeDate': {
      // Not supported directly on custom-field values in MVP (compiler lacks `now`
      // here). Caller should switch to `startOfDay("-7d")` or explicit ISO date.
      return undefined;
    }
    case 'Ident':
      return expr.name;
  }
}
