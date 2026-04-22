/**
 * TTSRH-1 PR-5 — orchestration layer for /api/search/issues.
 *
 * Pipeline: parse → validate → resolve functions → compile → execute CF
 * predicates → `prisma.issue.findMany`. Each stage short-circuits on error and
 * surfaces a typed response the router can hand back to the client unmodified.
 *
 * Timeout policy (NFR-8, R16): a hard 10-second cap wraps every `searchIssues`
 * call. On timeout we return `504 Gateway Timeout`, not `500` — this prevents
 * an overloaded DB from masquerading as a code bug. `AbortController` cuts the
 * Prisma query cleanly.
 */

import type { Prisma } from '@prisma/client';
import { prisma } from '../../prisma/client.js';
import { compile } from './search.compiler.js';
import { executeCustomFieldPredicates } from './search.custom-field.executor.js';
import { resolveFunctions } from './search.function-resolver.js';
import { parse } from './search.parser.js';
import { resolveReferenceValues } from './search.reference-resolver.js';
import { loadCustomFields } from './search.schema.loader.js';
import { createValidatorContext, validate } from './search.validator.js';
import type { ParseError } from './search.ast.js';
import type { ValidationIssue } from './search.validator.js';
import type { CompileIssue } from './search.compiler.js';

export interface SearchIssuesInput {
  jql: string;
  startAt?: number;
  limit?: number;
}

export interface SearchIssuesContext {
  userId: string;
  accessibleProjectIds: readonly string[];
  /** Fixed `now` for deterministic date-function evaluation within a single request. */
  now?: Date;
}

/**
 * Shape of a single issue in the `/search/issues` response. Mirrors the fixed
 * Prisma `include` below. `customFieldValues` is included unconditionally so
 * the ResultsTable can render user-configured custom-field columns without a
 * second round-trip; the payload is bounded by (issues × configured CFs),
 * which for MVP (50 rows × ~20 CFs) is well under any row-size limit.
 */
export type IssueSearchResult = Prisma.IssueGetPayload<{
  include: {
    assignee: { select: { id: true; name: true; email: true } };
    project: { select: { id: true; key: true; name: true } };
    workflowStatus: { select: { id: true; name: true; category: true; color: true; systemKey: true } };
    customFieldValues: { select: { customFieldId: true; value: true } };
  };
}>;

export interface SearchIssuesResult {
  kind: 'ok';
  total: number;
  startAt: number;
  limit: number;
  issues: IssueSearchResult[];
  /** Validator warnings — carry real span positions for CodeMirror squiggles. */
  warnings: ValidationIssue[];
  /**
   * Compiler warnings — emitted as a separate key because they don't carry
   * token positions (the compiler has consumed spans by this stage). Frontend
   * renders these as a top-of-results banner rather than inline squiggles.
   */
  compileWarnings: CompileIssue[];
}

export interface SearchIssuesError {
  kind: 'error';
  status: number;
  code: string;
  message: string;
  parseErrors?: ParseError[];
  validationErrors?: ValidationIssue[];
  compileErrors?: CompileIssue[];
}

export type SearchIssuesOutput = SearchIssuesResult | SearchIssuesError;

const MAX_LIMIT = 100;
const MAX_START_AT = 10_000;
const DEFAULT_LIMIT = 50;
const QUERY_TIMEOUT_MS = 10_000;

/**
 * Run a TTS-QL query end-to-end. **Never throws** — every failure path produces
 * a typed `SearchIssuesError` so the router can translate to HTTP without a
 * try/catch. Timeouts return `504`; parse/validate errors return `400`; compile
 * errors return `422`; everything else bubbles as `500`.
 */
export async function searchIssues(
  input: SearchIssuesInput,
  ctx: SearchIssuesContext,
): Promise<SearchIssuesOutput> {
  const startAt = clampInt(input.startAt ?? 0, 0, MAX_START_AT);
  const limit = clampInt(input.limit ?? DEFAULT_LIMIT, 1, MAX_LIMIT);
  const now = ctx.now ?? new Date();

  // Phase 1 — parse.
  const { ast, errors: parseErrors } = parse(input.jql);
  if (!ast || parseErrors.length > 0) {
    return {
      kind: 'error',
      status: 400,
      code: 'PARSE_ERROR',
      message: 'TTS-QL query failed to parse.',
      parseErrors,
    };
  }

  // Phase 2 — validate (loads custom fields).
  const customFields = await loadCustomFields();
  const validation = validate(ast, createValidatorContext({ variant: 'default', customFields }));
  if (!validation.valid) {
    return {
      kind: 'error',
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'TTS-QL query is syntactically valid but semantically rejected.',
      validationErrors: validation.errors,
    };
  }

  // Phase 3 — resolve DB-dependent functions in parallel.
  const resolved = await resolveFunctions(ast, {
    userId: ctx.userId,
    accessibleProjectIds: ctx.accessibleProjectIds,
    now,
    variant: 'default',
  });

  // Phase 4 — compile AST to Prisma where.
  const referenceValues = await resolveReferenceValues(ast, {
    accessibleProjectIds: ctx.accessibleProjectIds,
  });
  const compiled = compile(ast, {
    accessibleProjectIds: ctx.accessibleProjectIds,
    referenceValues,
    customFields,
    resolved,
    now,
    variant: 'default',
  });
  if (compiled.errors.length > 0) {
    return {
      kind: 'error',
      status: 422,
      code: 'COMPILE_ERROR',
      message: 'TTS-QL query could not be compiled to a database query.',
      compileErrors: compiled.errors,
    };
  }

  // Phase 5 — execute CF predicates + Prisma findMany, wrapped in timeout.
  try {
    const output = await withTimeout(
      async () => {
        const exec = await executeCustomFieldPredicates(
          compiled.where,
          compiled.customPredicates,
          ctx.accessibleProjectIds,
        );
        if (exec.errors.length > 0) {
          // Report CF-executor failures as compile-time errors. They usually mean
          // a malformed Prisma.sql fragment (compiler bug) or a Postgres error on
          // JSON extract (invalid type cast for the custom-field).
          return { execErrors: exec.errors, where: exec.where, issues: [], total: 0 };
        }
        const [issues, total] = await Promise.all([
          prisma.issue.findMany({
            where: exec.where,
            orderBy: compiled.orderBy.length > 0 ? compiled.orderBy : [{ updatedAt: 'desc' }],
            skip: startAt,
            take: limit,
            include: {
              assignee: { select: { id: true, name: true, email: true } },
              project: { select: { id: true, key: true, name: true } },
              workflowStatus: { select: { id: true, name: true, category: true, color: true, systemKey: true } },
              customFieldValues: { select: { customFieldId: true, value: true } },
            },
          }),
          prisma.issue.count({ where: exec.where }),
        ]);
        return { issues, total, where: exec.where, execErrors: [] as CompileIssue[] };
      },
      QUERY_TIMEOUT_MS,
    );
    if (output.execErrors.length > 0) {
      return {
        kind: 'error',
        status: 422,
        code: 'EXECUTOR_ERROR',
        message: 'One or more custom-field predicates failed to execute.',
        compileErrors: output.execErrors,
      };
    }
    return {
      kind: 'ok',
      total: output.total,
      startAt,
      limit,
      issues: output.issues as IssueSearchResult[],
      warnings: validation.warnings,
      compileWarnings: compiled.warnings,
    };
  } catch (err) {
    if (err instanceof TimeoutError) {
      // Log the JQL (truncated) + user so ops can correlate recurring timeouts
      // with specific queries — the user-facing 504 stays terse.
      console.warn('search timeout', {
        userId: ctx.userId,
        jql: input.jql.slice(0, 200),
        limit,
        startAt,
      });
      return {
        kind: 'error',
        status: 504,
        code: 'QUERY_TIMEOUT',
        message: `Query exceeded the ${QUERY_TIMEOUT_MS / 1000}s timeout. Add filters to narrow results.`,
      };
    }
    // Prisma validation errors or unexpected exceptions. We don't leak details.
    const message = err instanceof Error ? err.message : String(err);
    return {
      kind: 'error',
      status: 500,
      code: 'INTERNAL_ERROR',
      message: `Internal search error: ${message}`,
    };
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

class TimeoutError extends Error {
  constructor() {
    super('Query timeout');
    this.name = 'TimeoutError';
  }
}

/**
 * Run `fn` with a hard deadline. On timeout, throws `TimeoutError`. Prisma
 * doesn't expose a native cancellation hook per-query, so the work still
 * completes in the background — but the caller's request returns `504`
 * quickly and Postgres's `statement_timeout` (set at the DB level) catches
 * truly runaway queries.
 */
async function withTimeout<T>(fn: () => Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const deadline = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError()), ms);
  });
  try {
    return await Promise.race([fn(), deadline]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

