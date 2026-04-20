/**
 * TTSRH-1 PR-4 — pure AST → Prisma compiler for TTS-QL.
 *
 * Responsibilities per §5.5 ТЗ:
 *   - Translate AST clauses to `Prisma.IssueWhereInput`.
 *   - Add the top-level scope filter `projectId IN (accessibleProjectIds)` (R3).
 *   - Emit `CustomFieldPredicate` IR for custom-field clauses (executor resolves
 *     these via raw SQL in `search.custom-field.ts`).
 *   - Preserve booleans: each AST `Or` / `And` / `Not` becomes a
 *     `{ OR: [...] }` / `{ AND: [...] }` / `{ NOT: ... }` Prisma node.
 *   - ORDER BY → `Prisma.IssueOrderByWithRelationInput[]`.
 *
 * Security invariant (R1): **no string concatenation of values into SQL.**
 * System fields go straight into Prisma typed inputs. Custom-field raw SQL lives
 * in `search.custom-field.ts` and uses `Prisma.sql` exclusively — audited here
 * at type level: this file must not import `Prisma.sql`.
 */

import type { Prisma } from '@prisma/client';
import {
  type AndNode,
  type BoolExpr,
  type ClauseNode,
  type Expr,
  type FieldRef,
  type FunctionCall,
  type Literal,
  type NotNode,
  type OrNode,
  type QueryNode,
  type SortItem,
} from './search.ast.js';
import type { CompileContext, FunctionCallValue } from './search.compile-context.js';
import { buildFunctionCallKey, type FunctionCallArg } from './search.compile-context.js';
import { evaluatePureDateFn, parseOffset } from './search.functions.js';
import type { CustomFieldDef } from './search.schema.js';
import { resolveSystemField } from './search.schema.js';
import type { TtqlType } from './search.types.js';
import type { CustomFieldPredicate } from './search.custom-field.js';
import { compileCustomFieldClause } from './search.custom-field.js';

// ─── Result types ───────────────────────────────────────────────────────────

export type CompileIssueCode =
  | 'UNRESOLVED_FUNCTION'
  | 'UNRESOLVED_FIELD'
  | 'UNRESOLVED_VALUE'
  | 'UNSUPPORTED_OP'
  | 'AGGREGATE_NOT_SUPPORTED'
  | 'COMPUTED_FIELD_NOT_SUPPORTED'
  | 'DATE_PARSE_FAILED';

export interface CompileIssue {
  code: CompileIssueCode;
  message: string;
  hint?: string;
  /** Not a character offset — references the AST node label since the compiler
   *  has already consumed the source positions via validator errors. */
  field?: string;
}

export interface CompileResult {
  /**
   * Typed Prisma where input for system fields + function-resolved predicates.
   * Already includes the scope filter (R3). Combine with
   * `{ id: { in: customPredicateResult } }` at execution time.
   */
  where: Prisma.IssueWhereInput;
  orderBy: Prisma.IssueOrderByWithRelationInput[];
  /**
   * Custom-field predicates. Each item is an opaque `Prisma.Sql` that, when run
   * as `$queryRaw`, returns a list of matching `issues.id`. The executor (PR-5)
   * runs each once, caches, and stitches the result back into `where.AND`.
   *
   * Multiple clauses referencing the same CF produce separate predicates — the
   * compiler doesn't deduplicate, because AND/OR structure depends on boolean
   * context.
   */
  customPredicates: CustomFieldPredicate[];
  /** Non-fatal warnings (missing enum resolution, degenerate ORDER BY). */
  warnings: CompileIssue[];
  /** Fatal — the compiler returns a where-clause that matches nothing. */
  errors: CompileIssue[];
}

// ─── Entry point ────────────────────────────────────────────────────────────

/**
 * Compile a parsed+validated AST to a Prisma query. Never throws — on internal
 * trouble returns `{ where: { id: 'never' }, errors: [...] }` so downstream DB
 * work short-circuits cleanly.
 */
export function compile(ast: QueryNode, ctx: CompileContext): CompileResult {
  const builder = new Builder(ctx);
  const inner = ast.where ? builder.compileBool(ast.where) : null;
  const scope: Prisma.IssueWhereInput = {
    projectId: { in: [...ctx.accessibleProjectIds] },
  };
  const where: Prisma.IssueWhereInput =
    inner === null
      ? scope
      : { AND: [scope, inner] };
  const orderBy = ast.orderBy.flatMap((s) => builder.compileSort(s));
  return {
    where,
    orderBy,
    customPredicates: builder.customPredicates,
    warnings: builder.warnings,
    errors: builder.errors,
  };
}

// ─── Compiler state ─────────────────────────────────────────────────────────

class Builder {
  readonly customPredicates: CustomFieldPredicate[] = [];
  readonly warnings: CompileIssue[] = [];
  readonly errors: CompileIssue[] = [];
  private cfCounter = 0;

  constructor(private readonly ctx: CompileContext) {}

  compileBool(node: BoolExpr): Prisma.IssueWhereInput | null {
    switch (node.kind) {
      case 'Or': return this.compileOr(node);
      case 'And': return this.compileAnd(node);
      case 'Not': return this.compileNot(node);
      case 'Clause': return this.compileClause(node);
    }
  }

  private compileOr(node: OrNode): Prisma.IssueWhereInput {
    const children = node.children
      .map((c) => this.compileBool(c))
      .filter(nonNull);
    if (children.length === 0) return MATCH_NONE;
    if (children.length === 1) return children[0]!;
    return { OR: children };
  }

  private compileAnd(node: AndNode): Prisma.IssueWhereInput {
    const children = node.children
      .map((c) => this.compileBool(c))
      .filter(nonNull);
    if (children.length === 0) return MATCH_ALL;
    if (children.length === 1) return children[0]!;
    return { AND: children };
  }

  private compileNot(node: NotNode): Prisma.IssueWhereInput {
    const child = this.compileBool(node.child);
    if (!child) return MATCH_ALL;
    return { NOT: child };
  }

  // ─── Clause compilation ──────────────────────────────────────────────────

  private compileClause(c: ClauseNode): Prisma.IssueWhereInput | null {
    // Custom field?
    const custom = this.resolveCustomField(c.field);
    if (custom) {
      return this.compileCustomClause(c, custom);
    }
    // System field
    const systemField = this.resolveSystem(c.field);
    if (!systemField) {
      this.errors.push({
        code: 'UNRESOLVED_FIELD',
        message: `Field \`${fieldLabel(c.field)}\` is not a system field and no matching custom field was provided.`,
        field: fieldLabel(c.field),
      });
      return MATCH_NONE;
    }
    return compileSystemClause(c, systemField, this);
  }

  private compileCustomClause(c: ClauseNode, cf: CustomFieldDef): Prisma.IssueWhereInput {
    const alias = `cf_${this.cfCounter++}`;
    const compiled = compileCustomFieldClause(c, cf, alias, this.ctx, this);
    if (compiled.errors.length > 0) {
      this.errors.push(...compiled.errors);
      return MATCH_NONE;
    }
    this.customPredicates.push(compiled.predicate);
    // Placeholder: at executor time this turns into `{ id: { in: predicateIdSet } }`.
    // We keep a sentinel `{ id: { in: [alias] } }` so the shape of the where-input
    // is structurally complete; the executor replaces the alias list with real ids.
    return { [PLACEHOLDER_KEY]: alias } as unknown as Prisma.IssueWhereInput;
  }

  // ─── Field resolution helpers ────────────────────────────────────────────

  private resolveCustomField(ref: FieldRef): CustomFieldDef | null {
    if (ref.kind === 'CustomField') {
      return this.ctx.customFields.find((f) => f.id === ref.uuid) ?? null;
    }
    if (ref.kind === 'QuotedField') {
      // Prefer system over custom when a quoted name collides (system wins; validator
      // already warned about ambiguity if any).
      if (resolveSystemField(ref.name)) return null;
      const lc = ref.name.toLowerCase();
      const hits = this.ctx.customFields.filter((f) => f.name.toLowerCase() === lc);
      return hits.length === 1 ? hits[0]! : null;
    }
    return null;
  }

  private resolveSystem(ref: FieldRef) {
    if (ref.kind === 'Ident' || ref.kind === 'QuotedField') {
      return resolveSystemField(ref.kind === 'Ident' ? ref.name : ref.name);
    }
    return null;
  }

  // ─── ORDER BY ────────────────────────────────────────────────────────────

  compileSort(s: SortItem): Prisma.IssueOrderByWithRelationInput[] {
    const f = this.resolveSystem(s.field);
    if (!f || !f.sortable) return []; // validator already warned; skip silently here
    const dir = s.direction.toLowerCase() as 'asc' | 'desc';
    const col = SYSTEM_FIELD_SORT_COLUMN[f.name];
    if (!col) return [];
    return [{ [col]: dir } as Prisma.IssueOrderByWithRelationInput];
  }

  // ─── Function-call evaluation ────────────────────────────────────────────

  /** Returns a primary-key value for the given function call, or null on failure. */
  resolveFunctionCall(call: FunctionCall): FunctionCallValue {
    const lcName = call.name.toLowerCase();

    // Pure date helpers — evaluated directly.
    if (isPureDateFn(lcName)) {
      const offsetArg = call.args[0];
      let offset: ReturnType<typeof parseOffset> | null = null;
      if (offsetArg) {
        if (offsetArg.kind === 'String') offset = parseOffset(offsetArg.value);
        else if (offsetArg.kind === 'RelativeDate') offset = parseOffset(offsetArg.raw);
      }
      const value = evaluatePureDateFn(lcName, offset, { now: this.ctx.now });
      if (!value) {
        return { kind: 'resolve-failed', reason: `Date function \`${call.name}\` could not be evaluated.` };
      }
      return { kind: 'scalar-datetime', value };
    }

    // currentUser() — compiler variant maps directly to ctx.
    if (lcName === 'currentuser') {
      return { kind: 'scalar-id', id: this.ctx.resolved.currentUserId };
    }

    // Everything else — look up pre-resolved outputs.
    const key = buildFunctionCallKey(call.name, call.args.map(argToKey));
    const resolved = this.ctx.resolved.calls.get(key);
    if (!resolved) {
      return {
        kind: 'resolve-failed',
        reason: `Function \`${call.name}()\` was not pre-resolved — caller must pass it in \`ctx.resolved.calls\`.`,
      };
    }
    return resolved;
  }
}

// ─── System-field clause compiler ───────────────────────────────────────────

interface SystemContext {
  resolveFunctionCall(call: FunctionCall): FunctionCallValue;
  ctx: CompileContext;
  warnings: CompileIssue[];
  errors: CompileIssue[];
}

function compileSystemClause(
  c: ClauseNode,
  field: { name: string; type: TtqlType; sortable: boolean },
  builder: Builder,
): Prisma.IssueWhereInput | null {
  const sysCtx: SystemContext = {
    resolveFunctionCall: (call) => builder.resolveFunctionCall(call),
    ctx: (builder as unknown as { ctx: CompileContext }).ctx,
    warnings: builder.warnings,
    errors: builder.errors,
  };

  switch (c.op.kind) {
    case 'Compare':
      return compileCompare(field, c.op.op, c.op.value, sysCtx);
    case 'In':
      return compileIn(field, c.op.negated, c.op.values, sysCtx);
    case 'InFunction':
      return compileInFunction(field, c.op.negated, c.op.func, sysCtx);
    case 'IsEmpty':
      return compileIsEmpty(field, c.op.negated);
    case 'History':
      // Validator already rejected these. Defensive: compile as match-none so the
      // query stays structurally valid even if someone skips the validator.
      builder.errors.push({ code: 'UNSUPPORTED_OP', message: 'History operators (WAS/CHANGED) are not supported by the compiler yet.' });
      return MATCH_NONE;
  }
}

// ─── Compare ────────────────────────────────────────────────────────────────

function compileCompare(
  field: { name: string; type: TtqlType },
  op: string,
  valueExpr: Expr,
  ctx: SystemContext,
): Prisma.IssueWhereInput {
  const col = SYSTEM_FIELD_COLUMN[field.name];
  if (!col) {
    ctx.errors.push({ code: 'UNRESOLVED_FIELD', message: `No Prisma column mapping for \`${field.name}\`.`, field: field.name });
    return MATCH_NONE;
  }

  const value = evaluateValue(valueExpr, field.type, ctx);
  if (value.kind === 'error') {
    ctx.errors.push({ code: 'UNRESOLVED_VALUE', message: value.message, field: field.name });
    return MATCH_NONE;
  }

  // Text fields with `~` / `!~`
  if (op === '~' || op === '!~') {
    if (value.kind !== 'string') {
      ctx.errors.push({ code: 'UNRESOLVED_VALUE', message: `Operator \`${op}\` expects a string, got ${value.kind}.`, field: field.name });
      return MATCH_NONE;
    }
    // Slice to 200 chars to align with the Redis-key limit in issues.service.ts — a
    // defense against absurdly long predicates bloating the query plan.
    const predicate = {
      contains: value.value.slice(0, 200),
      mode: 'insensitive' as const,
    };
    const where = wrapColumn(col, predicate);
    return op === '~' ? where : { NOT: where };
  }

  // Comparisons
  const comparator = toPrismaComparator(op);
  if (!comparator) {
    ctx.errors.push({ code: 'UNSUPPORTED_OP', message: `Unknown comparator ${op}.`, field: field.name });
    return MATCH_NONE;
  }

  // EQ / NEQ can produce `{ col: value }` or `{ col: { not: value } }`
  const rhs = valueKindToPrisma(value, field.type, ctx);
  if (rhs === null) return MATCH_NONE;

  if (comparator === 'eq') return wrapColumn(col, rhs);
  if (comparator === 'neq') return wrapColumn(col, { not: rhs });

  // Range comparators — a generic `{ [op]: value }` filter. Prisma's IntFilter /
  // DateTimeFilter / DecimalFilter all accept this shape, so a single cast into
  // `IssueWhereInput` is safe across all numeric/date columns.
  return wrapColumn(col, { [comparator]: rhs });
}

// ─── IN ─────────────────────────────────────────────────────────────────────

function compileIn(
  field: { name: string; type: TtqlType },
  negated: boolean,
  values: Expr[],
  ctx: SystemContext,
): Prisma.IssueWhereInput {
  const col = SYSTEM_FIELD_COLUMN[field.name];
  if (!col) {
    ctx.errors.push({ code: 'UNRESOLVED_FIELD', message: `No column for \`${field.name}\`.`, field: field.name });
    return MATCH_NONE;
  }
  const resolved = values.map((v) => evaluateValue(v, field.type, ctx));
  const erroring = resolved.filter((r) => r.kind === 'error');
  if (erroring.length > 0) {
    for (const e of erroring) {
      if (e.kind === 'error') ctx.errors.push({ code: 'UNRESOLVED_VALUE', message: e.message, field: field.name });
    }
    return MATCH_NONE;
  }

  const primitives = resolved.flatMap((r) => flattenResolvedValue(r));
  if (primitives.length === 0) return MATCH_NONE;

  const where = wrapColumn(col, { in: primitives });
  return negated ? { NOT: where } : where;
}

function compileInFunction(
  field: { name: string; type: TtqlType },
  negated: boolean,
  func: FunctionCall,
  ctx: SystemContext,
): Prisma.IssueWhereInput {
  const col = SYSTEM_FIELD_COLUMN[field.name];
  if (!col) {
    ctx.errors.push({ code: 'UNRESOLVED_FIELD', message: `No column for \`${field.name}\`.`, field: field.name });
    return MATCH_NONE;
  }
  const resolved = ctx.resolveFunctionCall(func);
  if (resolved.kind === 'resolve-failed') {
    ctx.errors.push({ code: 'UNRESOLVED_FUNCTION', message: resolved.reason, field: func.name });
    return MATCH_NONE;
  }
  const ids = resolved.kind === 'id-list' ? resolved.ids : resolved.kind === 'scalar-id' && resolved.id ? [resolved.id] : [];
  if (ids.length === 0) return negated ? MATCH_ALL : MATCH_NONE;
  const where = wrapColumn(col, { in: [...ids] });
  return negated ? { NOT: where } : where;
}

// ─── IS [NOT] EMPTY ─────────────────────────────────────────────────────────

function compileIsEmpty(field: { name: string; type: TtqlType }, negated: boolean): Prisma.IssueWhereInput {
  const col = SYSTEM_FIELD_COLUMN[field.name];
  if (!col) return MATCH_NONE;
  const rhs = negated ? { not: null } : null;
  return wrapColumn(col, rhs);
}

// ─── Value evaluator ────────────────────────────────────────────────────────

/**
 * Evaluator output. Distinguishes raw value kinds so we can map to the correct
 * Prisma filter family (numeric vs date vs string vs boolean).
 */
export type EvaluatedValue =
  | { kind: 'string'; value: string }
  | { kind: 'number'; value: number }
  | { kind: 'datetime'; value: Date }
  | { kind: 'bool'; value: boolean }
  | { kind: 'null' }
  | { kind: 'id-list'; ids: readonly string[] }       // function result, multi-id
  | { kind: 'scalar-id'; id: string | null }          // function result, single id
  | { kind: 'error'; message: string };

function evaluateValue(expr: Expr, fieldType: TtqlType, ctx: SystemContext): EvaluatedValue {
  if (expr.kind === 'Function') {
    const fn = ctx.resolveFunctionCall(expr);
    switch (fn.kind) {
      case 'scalar-id':
        return { kind: 'scalar-id', id: fn.id };
      case 'id-list':
        return { kind: 'id-list', ids: fn.ids };
      case 'scalar-datetime':
        return { kind: 'datetime', value: fn.value };
      case 'resolve-failed':
        return { kind: 'error', message: fn.reason };
    }
  }
  return literalToValue(expr, fieldType, ctx);
}

function literalToValue(lit: Literal, fieldType: TtqlType, ctx: SystemContext): EvaluatedValue {
  switch (lit.kind) {
    case 'Null':
    case 'Empty':
      return { kind: 'null' };
    case 'Bool':
      return { kind: 'bool', value: lit.value };
    case 'Number':
      return { kind: 'number', value: lit.value };
    case 'String':
      // DATE/DATETIME: string might be an ISO date, a "-7d" relative offset, or a
      // date-ish token. Try ISO first, then offset-from-now.
      if (fieldType === 'DATE' || fieldType === 'DATETIME') {
        const parsed = parseDateString(lit.value, ctx.ctx.now);
        if (parsed) return { kind: 'datetime', value: parsed };
        return { kind: 'error', message: `Cannot parse \`"${lit.value}"\` as a date.` };
      }
      return { kind: 'string', value: lit.value };
    case 'RelativeDate': {
      const parsed = parseRelativeDate(lit.raw, ctx.ctx.now);
      if (parsed) return { kind: 'datetime', value: parsed };
      return { kind: 'error', message: `Cannot parse relative date \`${lit.raw}\`.` };
    }
    case 'Ident':
      return { kind: 'string', value: lit.name };
  }
}

function parseDateString(value: string, now: Date): Date | null {
  // Check for relative-date format first: `7d`, `-7d`, `2w` etc.
  const relative = parseRelativeDate(value, now);
  if (relative) return relative;
  const asDate = new Date(value);
  if (Number.isFinite(asDate.getTime())) return asDate;
  return null;
}

function parseRelativeDate(raw: string, now: Date): Date | null {
  const offset = parseOffset(raw);
  if (!offset) return null;
  const d = new Date(now.getTime());
  switch (offset.unit) {
    case 'h': d.setUTCHours(d.getUTCHours() + offset.amount); break;
    case 'm': d.setUTCMinutes(d.getUTCMinutes() + offset.amount); break;
    case 'd': d.setUTCDate(d.getUTCDate() + offset.amount); break;
    case 'w': d.setUTCDate(d.getUTCDate() + offset.amount * 7); break;
    case 'M': d.setUTCMonth(d.getUTCMonth() + offset.amount); break;
    case 'y': d.setUTCFullYear(d.getUTCFullYear() + offset.amount); break;
  }
  return d;
}

/**
 * Convert an `EvaluatedValue` to a Prisma-compatible primitive (string / number /
 * Date / boolean / null) for use as the RHS of EQ/NEQ/range comparators.
 */
function valueKindToPrisma(value: EvaluatedValue, fieldType: TtqlType, ctx: SystemContext): unknown {
  switch (value.kind) {
    case 'null': return null;
    case 'string':
      // STATUS / PRIORITY / TYPE — may need enum mapping. For MVP, pass the upper-
      // case string value directly; Prisma's String filter will match.
      if (fieldType === 'PRIORITY' || fieldType === 'AI_STATUS' || fieldType === 'AI_ASSIGNEE_TYPE' || fieldType === 'STATUS_CATEGORY') {
        return value.value.toUpperCase();
      }
      return value.value;
    case 'number': return value.value;
    case 'bool': return value.value;
    case 'datetime': return value.value;
    case 'scalar-id': return value.id;
    case 'id-list':
      ctx.errors.push({ code: 'UNRESOLVED_VALUE', message: 'A list value was used where a scalar was expected.' });
      return null;
    case 'error': return null;
  }
}

function flattenResolvedValue(v: EvaluatedValue): (string | number | Date | boolean | null)[] {
  switch (v.kind) {
    case 'null': return [null];
    case 'string': return [v.value];
    case 'number': return [v.value];
    case 'bool': return [v.value];
    case 'datetime': return [v.value];
    case 'scalar-id': return v.id ? [v.id] : [];
    case 'id-list': return [...v.ids];
    case 'error': return [];
  }
}

// ─── Prisma column map (system fields → Issue columns) ──────────────────────

/**
 * Map a TTS-QL system-field canonical name to a Prisma `IssueWhereInput` key.
 * Kept as a plain object for easy audit — every entry here is a non-derived,
 * directly-queryable column on the `issues` table. Derived fields (timeSpent,
 * timeRemaining, hasChildren) are deferred to PR-5 via raw SQL.
 */
const SYSTEM_FIELD_COLUMN: Record<string, string> = {
  project: 'projectId',
  key: 'id',
  summary: 'title',
  description: 'description',
  status: 'status',
  priority: 'priority',
  type: 'issueTypeConfigId',
  assignee: 'assigneeId',
  reporter: 'creatorId',
  sprint: 'sprintId',
  release: 'releaseId',
  parent: 'parentId',
  epic: 'parentId',
  due: 'dueDate',
  created: 'createdAt',
  updated: 'updatedAt',
  estimatedhours: 'estimatedHours',
  orderindex: 'orderIndex',
  aieligible: 'aiEligible',
  aistatus: 'aiExecutionStatus',
  aiassigneetype: 'aiAssigneeType',
  issue: 'id',
};

const SYSTEM_FIELD_SORT_COLUMN: Record<string, string> = {
  project: 'projectId',
  key: 'id',
  summary: 'title',
  status: 'status',
  priority: 'priority',
  type: 'issueTypeConfigId',
  assignee: 'assigneeId',
  reporter: 'creatorId',
  sprint: 'sprintId',
  release: 'releaseId',
  due: 'dueDate',
  created: 'createdAt',
  updated: 'updatedAt',
  estimatedhours: 'estimatedHours',
  orderindex: 'orderIndex',
};

// ─── Helpers ────────────────────────────────────────────────────────────────

const MATCH_NONE: Prisma.IssueWhereInput = { id: { in: [] } };
const MATCH_ALL: Prisma.IssueWhereInput = {};
export const PLACEHOLDER_KEY = '__ttql_custom_predicate__';

function wrapColumn(col: string, predicate: unknown): Prisma.IssueWhereInput {
  // The compiler intentionally widens predicate types to `unknown` here — by the
  // time we reach this helper, `col` is one of the audited `SYSTEM_FIELD_COLUMN`
  // keys (a static, non-user-driven set) and `predicate` is a Prisma-shaped filter
  // produced by typed paths above. Prisma validates at runtime; strict static
  // typing would require a giant per-column switch for marginal benefit.
  return { [col]: predicate } as Prisma.IssueWhereInput;
}

function toPrismaComparator(op: string): 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | null {
  switch (op) {
    case '=': return 'eq';
    case '!=': return 'neq';
    case '>': return 'gt';
    case '>=': return 'gte';
    case '<': return 'lt';
    case '<=': return 'lte';
    default: return null;
  }
}

function isPureDateFn(lcName: string): boolean {
  return (
    lcName === 'now' ||
    lcName === 'today' ||
    lcName.startsWith('startof') ||
    lcName.startsWith('endof')
  );
}

function argToKey(e: Expr): FunctionCallArg {
  switch (e.kind) {
    case 'String': return { kind: 'string', value: e.value };
    case 'Number': return { kind: 'number', value: e.value };
    case 'Bool':   return { kind: 'bool', value: e.value };
    case 'Null':
    case 'Empty':  return { kind: 'null' };
    case 'Ident':  return { kind: 'ident', name: e.name };
    case 'RelativeDate': return { kind: 'string', value: e.raw };
    case 'Function': return { kind: 'string', value: `${e.name}(...)` };
  }
}

function fieldLabel(ref: FieldRef): string {
  if (ref.kind === 'CustomField') return `cf[${ref.uuid}]`;
  if (ref.kind === 'QuotedField') return `"${ref.name}"`;
  return ref.name;
}

function nonNull<T>(x: T | null): x is T {
  return x !== null;
}
