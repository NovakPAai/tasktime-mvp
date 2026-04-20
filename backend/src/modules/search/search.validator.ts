/**
 * TTSRH-1 PR-3 — semantic validator for TTS-QL AST.
 *
 * Responsibilities per §5.5 ТЗ: resolve field references, check operator-to-type
 * compatibility, check function arity/types, reject Phase-2 operators, and flag
 * checkpoint-context-only functions when used outside KT.
 *
 * Invariant: `validate()` **never throws**. On structural parser errors upstream
 * we still run the validator on whatever partial AST was produced so the editor
 * can surface as many issues as possible in one pass. Errors are accumulated —
 * validation never short-circuits on first failure.
 *
 * Error codes are stable and exposed to the frontend via the `/search/validate`
 * contract. Add new codes to `ValidationErrorCode` and keep the frontend in sync.
 */

import type {
  BoolExpr,
  ClauseNode,
  ClauseOp,
  Expr,
  FieldRef,
  FunctionCall,
  Literal,
  QueryNode,
  Span,
} from './search.ast.js';
import {
  type CustomFieldDef,
  type CustomFieldIndex,
  type FieldDef,
  buildCustomFieldIndex,
  resolveSystemField,
} from './search.schema.js';
import {
  type FunctionDef,
  parseOffset,
  resolveFunction,
} from './search.functions.js';
import type { QueryVariant, TtqlOpKind, TtqlType } from './search.types.js';

// ─── Errors ─────────────────────────────────────────────────────────────────

export type ValidationErrorCode =
  | 'UNKNOWN_FIELD'
  | 'UNKNOWN_FUNCTION'
  | 'OPERATOR_NOT_ALLOWED_FOR_FIELD'
  | 'VALUE_TYPE_MISMATCH'
  | 'ARITY_MISMATCH'
  | 'PHASE_2_OPERATOR'
  | 'PHASE_2_FUNCTION'
  | 'FUNCTION_NOT_ALLOWED_IN_CONTEXT'
  | 'AMBIGUOUS_CUSTOM_FIELD'
  | 'CUSTOM_FIELD_UUID_UNKNOWN'
  | 'CURRENTUSER_IN_CHECKPOINT'
  | 'INVALID_OFFSET_FORMAT'
  | 'ORDER_BY_NOT_SORTABLE';

export type ValidationSeverity = 'error' | 'warning';

export interface ValidationIssue {
  code: ValidationErrorCode;
  severity: ValidationSeverity;
  message: string;
  hint?: string;
  start: number;
  end: number;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

// ─── Validator context ──────────────────────────────────────────────────────

export interface ValidatorContext {
  variant: QueryVariant;
  customFields: readonly CustomFieldDef[];
}

export function createValidatorContext(input: Partial<ValidatorContext> = {}): ValidatorContext {
  return {
    variant: input.variant ?? 'default',
    customFields: input.customFields ?? [],
  };
}

// ─── Entry point ────────────────────────────────────────────────────────────

export function validate(ast: QueryNode, ctx: ValidatorContext): ValidationResult {
  const v = new Validator(ctx);
  if (ast.where) v.visitBool(ast.where);
  for (const s of ast.orderBy) {
    // ORDER BY resolves fields but doesn't match an operator — just ensure field exists
    // and is sortable. Non-sortable field → warning, not error (compiler may fall back).
    // Custom fields are never sortable in MVP (§R13 ТЗ); the check covers both kinds.
    const fd = v.resolveField(s.field);
    if ((fd.kind === 'system' || fd.kind === 'custom') && !fd.def.sortable) {
      v.warn(
        'ORDER_BY_NOT_SORTABLE',
        `Field \`${v.fieldLabel(s.field)}\` is not sortable; ORDER BY will be ignored by the compiler.`,
        s.field.span,
      );
    }
  }
  const errors = v.issues.filter((i) => i.severity === 'error');
  const warnings = v.issues.filter((i) => i.severity === 'warning');
  return { valid: errors.length === 0, errors, warnings };
}

// ─── Implementation ─────────────────────────────────────────────────────────

type ResolvedField =
  | { kind: 'system'; def: FieldDef; ref: FieldRef }
  | { kind: 'custom'; def: CustomFieldDef; ref: FieldRef }
  | { kind: 'unknown'; ref: FieldRef };

class Validator {
  readonly issues: ValidationIssue[] = [];
  private readonly customIdx: CustomFieldIndex;

  constructor(private readonly ctx: ValidatorContext) {
    this.customIdx = buildCustomFieldIndex([...ctx.customFields]);
  }

  visitBool(node: BoolExpr): void {
    switch (node.kind) {
      case 'Or':
      case 'And':
        for (const ch of node.children) this.visitBool(ch);
        return;
      case 'Not':
        this.visitBool(node.child);
        return;
      case 'Clause':
        this.visitClause(node);
        return;
    }
  }

  visitClause(c: ClauseNode): void {
    const resolved = this.resolveField(c.field);
    this.checkClauseOp(c.op, resolved);
  }

  // ─── Field resolution ─────────────────────────────────────────────────────

  resolveField(ref: FieldRef): ResolvedField {
    if (ref.kind === 'CustomField') {
      const def = this.customIdx.resolveById(ref.uuid);
      if (!def) {
        this.err('CUSTOM_FIELD_UUID_UNKNOWN', `Custom field \`cf[${ref.uuid}]\` is not known or disabled.`, ref.span);
        return { kind: 'unknown', ref };
      }
      return { kind: 'custom', def, ref };
    }
    if (ref.kind === 'QuotedField') {
      const sys = resolveSystemField(ref.name);
      if (sys) return { kind: 'system', def: sys, ref };
      const hit = this.customIdx.resolveByName(ref.name);
      if (hit === 'ambiguous') {
        this.err(
          'AMBIGUOUS_CUSTOM_FIELD',
          `Custom field name \`${ref.name}\` is defined more than once; add a scoping \`project = ...\` clause to disambiguate.`,
          ref.span,
          'See R7 in docs/tz/TTSRH-1.md — cross-project name collisions must be scoped.',
        );
        return { kind: 'unknown', ref };
      }
      if (hit) return { kind: 'custom', def: hit, ref };
      this.err('UNKNOWN_FIELD', `Unknown field \`"${ref.name}"\`.`, ref.span);
      return { kind: 'unknown', ref };
    }
    // Ident
    const sys = resolveSystemField(ref.name);
    if (sys) return { kind: 'system', def: sys, ref };
    this.err('UNKNOWN_FIELD', `Unknown field \`${ref.name}\`.`, ref.span);
    return { kind: 'unknown', ref };
  }

  fieldLabel(ref: FieldRef): string {
    if (ref.kind === 'CustomField') return `cf[${ref.uuid}]`;
    if (ref.kind === 'QuotedField') return `"${ref.name}"`;
    return ref.name;
  }

  // ─── Op / value compatibility ─────────────────────────────────────────────

  checkClauseOp(op: ClauseOp, field: ResolvedField): void {
    switch (op.kind) {
      case 'Compare':
        this.checkOpAllowed(compareToKind(op.op), field, op.span);
        this.checkValue(op.value, field, op.span);
        return;
      case 'In': {
        this.checkOpAllowed(op.negated ? 'NOT_IN' : 'IN', field, op.span);
        for (const v of op.values) this.checkValue(v, field, op.span);
        return;
      }
      case 'InFunction': {
        this.checkOpAllowed(op.negated ? 'NOT_IN' : 'IN', field, op.span);
        this.checkFunctionCall(op.func, expectedListReturnType(field));
        return;
      }
      case 'IsEmpty':
        this.checkOpAllowed(op.negated ? 'IS_NOT_EMPTY' : 'IS_EMPTY', field, op.span);
        return;
      case 'History':
        // Phase 2 — parser accepts, we reject with a pointer to documentation.
        this.err(
          'PHASE_2_OPERATOR',
          `History operators (WAS/CHANGED) are not implemented in MVP.`,
          op.span,
          'Planned for Phase 2 (TTSRH-23) after FieldChangeLog is added to the schema.',
        );
        if (op.value) this.checkValue(op.value, field, op.span);
    }
  }

  private checkOpAllowed(wanted: TtqlOpKind, field: ResolvedField, span: Span): void {
    if (field.kind === 'unknown') return; // already reported
    // `FieldDef` (system) and `CustomFieldDef` both expose `.operators`, so a single
    // access works for both kinds. Don't re-split by `kind` — it creates copy-paste
    // drift the moment one structure gains an extra permission axis.
    const allowed = field.def.operators;
    if (!allowed.includes(wanted)) {
      this.err(
        'OPERATOR_NOT_ALLOWED_FOR_FIELD',
        `Operator \`${displayOp(wanted)}\` is not allowed for field \`${this.fieldLabel(field.ref)}\`.`,
        span,
        `Allowed operators: ${allowed.map(displayOp).join(', ')}.`,
      );
    }
  }

  // ─── Value type checks ────────────────────────────────────────────────────

  private checkValue(expr: Expr, field: ResolvedField, span: Span): void {
    if (expr.kind === 'Function') {
      const ret = field.kind === 'unknown' ? undefined : expectedScalarOrListReturnType(field);
      this.checkFunctionCall(expr, ret);
      return;
    }
    // Literals — coarse compatibility check. Parser accepted the literal; we only
    // reject pairings that are clearly wrong (e.g. USER = "-7d" relative date).
    if (field.kind === 'unknown') return;
    const fieldType = resolvedFieldType(field);
    if (!literalTypeCompatible(expr, fieldType)) {
      this.err(
        'VALUE_TYPE_MISMATCH',
        `Value ${describeLiteral(expr)} is not compatible with field \`${this.fieldLabel(field.ref)}\` (${fieldType}).`,
        span,
      );
    }
  }

  // ─── Function-call validation ─────────────────────────────────────────────

  checkFunctionCall(call: FunctionCall, expectedReturnHint?: { kind: 'scalar' | 'list'; type: TtqlType }): void {
    const def = resolveFunction(call.name);
    if (!def) {
      this.err('UNKNOWN_FUNCTION', `Unknown function \`${call.name}()\`.`, call.span);
      return;
    }
    if (def.phase === 'PHASE_2') {
      this.err(
        'PHASE_2_FUNCTION',
        `Function \`${call.name}()\` is Phase-2 and not yet available.`,
        call.span,
        def.description,
      );
      return;
    }
    if (!def.availableIn.includes(this.ctx.variant)) {
      const where = def.availableIn.join('/') || 'nowhere';
      this.err(
        'FUNCTION_NOT_ALLOWED_IN_CONTEXT',
        `Function \`${call.name}()\` is not available in variant \`${this.ctx.variant}\` (only in ${where}).`,
        call.span,
      );
      return;
    }
    this.checkFunctionArity(call, def);
    this.checkFunctionArgs(call, def);
    // §5.12.4: warn when currentUser() is used in checkpoint variant — it resolves
    // to NULL there, making any `= currentUser()` comparison always false.
    if (this.ctx.variant === 'checkpoint' && def.name === 'currentuser') {
      this.warn(
        'CURRENTUSER_IN_CHECKPOINT',
        '`currentUser()` resolves to NULL in checkpoint context — `assignee = currentUser()` will never match.',
        call.span,
        'Use assignee IS NOT EMPTY or a specific email/id instead.',
      );
    }
    // Soft check: if caller expects a specific return shape, verify.
    if (expectedReturnHint) {
      if (expectedReturnHint.kind === 'list' && def.returnType.kind === 'scalar') {
        this.err(
          'VALUE_TYPE_MISMATCH',
          `\`${call.name}()\` returns a single ${def.returnType.type} but an IN-clause expects a list.`,
          call.span,
        );
      }
    }
  }

  private checkFunctionArity(call: FunctionCall, def: FunctionDef): void {
    const minArgs = def.args.filter((a) => !a.optional).length;
    const maxArgs = def.args.length;
    const got = call.args.length;
    if (got < minArgs || got > maxArgs) {
      this.err(
        'ARITY_MISMATCH',
        `Function \`${def.name}()\` expects ${minArgs === maxArgs ? `${minArgs}` : `${minArgs}..${maxArgs}`} arguments, got ${got}.`,
        call.span,
      );
    }
  }

  private checkFunctionArgs(call: FunctionCall, def: FunctionDef): void {
    const n = Math.min(call.args.length, def.args.length);
    for (let i = 0; i < n; i++) {
      const expected = def.args[i]!;
      const arg = call.args[i]!;
      if (expected.type === 'OFFSET') {
        // Offset: either a string like "-7d" or a bare RelativeDate token.
        if (arg.kind === 'String') {
          if (!parseOffset(arg.value)) {
            this.err(
              'INVALID_OFFSET_FORMAT',
              `Argument ${i + 1} of \`${def.name}()\` must be an offset like \`"-7d"\`, got \`"${arg.value}"\`.`,
              arg.span,
            );
          }
        } else if (arg.kind !== 'RelativeDate') {
          this.err(
            'VALUE_TYPE_MISMATCH',
            `Argument ${i + 1} of \`${def.name}()\` must be an offset string (e.g. \`"-7d"\`).`,
            arg.span,
          );
        }
      } else if (expected.type === 'ISSUE_KEY') {
        if (arg.kind !== 'String' && arg.kind !== 'Ident') {
          this.err(
            'VALUE_TYPE_MISMATCH',
            `Argument ${i + 1} of \`${def.name}()\` must be an issue key like \`"TTMP-123"\`.`,
            arg.span,
          );
        }
      } else if (expected.type === 'ANY') {
        // Accept anything.
      } else if (arg.kind === 'Function') {
        // Nested function calls (`membersOf(someFunc())`) — validate the inner call
        // recursively; type propagation is too coarse to enforce strict match.
        this.checkFunctionCall(arg);
      } else {
        // Literal — loose compatibility only.
        if (!literalTypeCompatible(arg, expected.type as TtqlType)) {
          this.err(
            'VALUE_TYPE_MISMATCH',
            `Argument ${i + 1} of \`${def.name}()\` should be ${expected.type}, got ${describeLiteral(arg)}.`,
            arg.span,
          );
        }
      }
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private err(code: ValidationErrorCode, message: string, span: Span, hint?: string): void {
    this.issues.push({ code, severity: 'error', message, hint, start: span.start, end: span.end });
  }

  warn(code: ValidationErrorCode, message: string, span: Span, hint?: string): void {
    this.issues.push({ code, severity: 'warning', message, hint, start: span.start, end: span.end });
  }
}

// ─── Pure helpers ───────────────────────────────────────────────────────────

function compareToKind(op: string): TtqlOpKind {
  switch (op) {
    case '=': return 'EQ';
    case '!=': return 'NEQ';
    case '>': return 'GT';
    case '>=': return 'GTE';
    case '<': return 'LT';
    case '<=': return 'LTE';
    case '~': return 'CONTAINS';
    case '!~': return 'NOT_CONTAINS';
    default: return 'EQ';
  }
}

function displayOp(kind: TtqlOpKind): string {
  switch (kind) {
    case 'EQ': return '=';
    case 'NEQ': return '!=';
    case 'GT': return '>';
    case 'GTE': return '>=';
    case 'LT': return '<';
    case 'LTE': return '<=';
    case 'CONTAINS': return '~';
    case 'NOT_CONTAINS': return '!~';
    case 'IN': return 'IN';
    case 'NOT_IN': return 'NOT IN';
    case 'IS_EMPTY': return 'IS EMPTY';
    case 'IS_NOT_EMPTY': return 'IS NOT EMPTY';
    case 'WAS': return 'WAS';
    case 'WAS_NOT': return 'WAS NOT';
    case 'WAS_IN': return 'WAS IN';
    case 'WAS_NOT_IN': return 'WAS NOT IN';
    case 'CHANGED': return 'CHANGED';
  }
}

function resolvedFieldType(field: ResolvedField & { kind: 'system' | 'custom' }): TtqlType {
  if (field.kind === 'system') return field.def.type;
  return field.def.type;
}

function expectedListReturnType(field: ResolvedField): { kind: 'list'; type: TtqlType } | undefined {
  if (field.kind === 'unknown') return undefined;
  return { kind: 'list', type: resolvedFieldType(field) };
}

function expectedScalarOrListReturnType(field: ResolvedField): { kind: 'scalar' | 'list'; type: TtqlType } | undefined {
  if (field.kind === 'unknown') return undefined;
  return { kind: 'scalar', type: resolvedFieldType(field) };
}

/**
 * Very coarse type compatibility. We only reject combinations that are ALWAYS
 * wrong (User field with a Number, etc.). Anything string-like (including bare
 * idents representing enum constants) is accepted for enum/text-ish types — the
 * compiler later resolves enum names against actual DB values.
 */
function literalTypeCompatible(lit: Literal | FunctionCall, fieldType: TtqlType): boolean {
  // Null/Empty/Function are always accepted — the compiler handles null semantics
  // and function return-type resolution downstream.
  if (lit.kind === 'Null' || lit.kind === 'Empty') return true;
  if (lit.kind === 'Function') return true;
  switch (fieldType) {
    case 'NUMBER':
      return lit.kind === 'Number';
    case 'BOOL':
      return lit.kind === 'Bool';
    case 'DATE':
    case 'DATETIME':
      // Date can be expressed as a quoted ISO string, bare RelativeDate, or a date-
      // producing function. The validator can't fully check ISO format without a
      // parser pass — we accept all strings and let the compiler reject invalid ISO.
      return lit.kind === 'String' || lit.kind === 'RelativeDate';
    case 'TEXT':
    case 'JSON':
    case 'LABEL':
    case 'STATUS':
    case 'STATUS_CATEGORY':
    case 'PRIORITY':
    case 'ISSUE_TYPE':
    case 'AI_STATUS':
    case 'AI_ASSIGNEE_TYPE':
    case 'CHECKPOINT_STATE':
    case 'CHECKPOINT_TYPE':
    case 'USER':
    case 'PROJECT':
    case 'ISSUE':
    case 'SPRINT':
    case 'RELEASE':
    case 'GROUP':
      return lit.kind === 'String' || lit.kind === 'Ident';
  }
}

function describeLiteral(lit: Expr): string {
  switch (lit.kind) {
    case 'String': return `"${lit.value}"`;
    case 'Number': return String(lit.value);
    case 'RelativeDate': return lit.raw;
    case 'Ident': return lit.name;
    case 'Bool': return String(lit.value);
    case 'Null': return 'NULL';
    case 'Empty': return 'EMPTY';
    case 'Function': return `${lit.name}(...)`;
  }
}
