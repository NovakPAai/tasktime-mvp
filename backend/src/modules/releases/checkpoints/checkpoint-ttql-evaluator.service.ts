/**
 * TTSRH-1 PR-16 — async resolver для TTQL-ветки Checkpoint evaluator'а.
 *
 * Публичный API:
 *   • resolveTtqlMatchedIds(ttqlSnapshot, context) — компилирует TTQL через
 *     pipeline `/search/issues` (parse → validate → compile), применяет
 *     compiled `where` + ограничение по issue-ids релиза, возвращает
 *     `Set<issueId>` матчингов или `{error: string}` на фейл.
 *
 * Инварианты:
 *   • Hard timeout 5с (R16): compile+exec вместе. Превышение → `{error: 'timeout'}`.
 *   • Never throws — все ошибки парсера/компилятора/Prisma → `{error: ...}`.
 *   • `now` детерминистичен per-tick — передаётся из scheduler'а, чтобы все
 *     чекпоинты одного evaluation-pass'а видели одинаковое «сейчас» (R18).
 *   • `applicableIssueIds` — ограничение для Prisma query: `{id: {in: ids}}`
 *     добавляется к compiled.where, чтобы TTQL проверял только issues текущего
 *     релиза (не всей системы).
 *   • Feature-flag FEATURES_CHECKPOINT_TTQL — caller'у (engine wrapper) решает
 *     вызывать ли resolver; сам resolver флаг не читает.
 */

import type { Prisma } from '@prisma/client';

import { prisma } from '../../../prisma/client.js';
import { compile } from '../../search/search.compiler.js';
import { executeCustomFieldPredicates } from '../../search/search.custom-field.executor.js';
import { resolveFunctions } from '../../search/search.function-resolver.js';
import { parse } from '../../search/search.parser.js';
import { resolveReferenceValues } from '../../search/search.reference-resolver.js';
import { loadCustomFields } from '../../search/search.schema.loader.js';
import { createValidatorContext, validate } from '../../search/search.validator.js';

const TTQL_TIMEOUT_MS = 5_000;

export interface TtqlEvaluationContext {
  /** Fixed `now` for the evaluation tick — same across all checkpoints in a pass (R18). */
  now: Date;
  /** Issue-ids сырого пула релиза — compiler'овский where narrowed through `id IN (...)`. */
  applicableIssueIds: readonly string[];
  /** Accessible projects: scheduler runs unrestricted; UI preview endpoint uses caller's scope. */
  accessibleProjectIds: readonly string[];
}

export interface TtqlEvaluationResult {
  matchedIds: Set<string>;
  error: string | null;
}

export async function resolveTtqlMatchedIds(
  ttqlSnapshot: string,
  ctx: TtqlEvaluationContext,
): Promise<TtqlEvaluationResult> {
  const empty: TtqlEvaluationResult = { matchedIds: new Set(), error: null };
  const trimmed = ttqlSnapshot.trim();
  if (trimmed.length === 0) return { ...empty, error: 'empty ttql snapshot' };
  if (ctx.applicableIssueIds.length === 0) return empty;

  try {
    return await withTimeout(async () => {
      // Phase 1: parse.
      const parseResult = parse(trimmed);
      if (!parseResult.ast || parseResult.errors.length > 0) {
        return { matchedIds: new Set(), error: `parse: ${parseResult.errors[0]?.message ?? 'failed'}` };
      }

      // Phase 2: validate (variant=checkpoint).
      const customFields = await loadCustomFields();
      const validation = validate(
        parseResult.ast,
        createValidatorContext({ variant: 'checkpoint', customFields }),
      );
      if (!validation.valid) {
        return {
          matchedIds: new Set(),
          error: `validate: ${validation.errors[0]?.message ?? 'failed'}`,
        };
      }

      // Phase 3: resolve DB functions (`membersOf`, sprint/release shortcuts, etc.).
      // userId: '' wrong — `currentUser()` branch в checkpoint variant should
      // resolve to NULL per §5.12.4. Pass null explicitly; consumers должны
      // treat empty-string as user identifier, not as "no user".
      const resolved = await resolveFunctions(parseResult.ast, {
        userId: null,
        accessibleProjectIds: ctx.accessibleProjectIds,
        now: ctx.now,
        variant: 'checkpoint',
      });

      // Phase 4: compile to Prisma where.
      const referenceValues = await resolveReferenceValues(parseResult.ast, {
        accessibleProjectIds: ctx.accessibleProjectIds,
      });
      const compiled = compile(parseResult.ast, {
        accessibleProjectIds: ctx.accessibleProjectIds,
        referenceValues,
        customFields,
        resolved,
        now: ctx.now,
        variant: 'checkpoint',
      });
      if (compiled.errors.length > 0) {
        return {
          matchedIds: new Set(),
          error: `compile: ${compiled.errors[0]?.message ?? 'failed'}`,
        };
      }

      // Phase 5: execute CF predicates + scope to applicable issues.
      const exec = await executeCustomFieldPredicates(
        compiled.where,
        compiled.customPredicates,
        ctx.accessibleProjectIds,
      );
      if (exec.errors.length > 0) {
        return { matchedIds: new Set(), error: `exec: ${exec.errors[0]?.message ?? 'failed'}` };
      }

      const scopedWhere: Prisma.IssueWhereInput = {
        AND: [exec.where, { id: { in: [...ctx.applicableIssueIds] } }],
      };

      const rows = await prisma.issue.findMany({
        where: scopedWhere,
        select: { id: true },
      });
      return { matchedIds: new Set(rows.map((r) => r.id)), error: null };
    }, TTQL_TIMEOUT_MS);
  } catch (err) {
    if (err instanceof TimeoutError) {
      return { matchedIds: new Set(), error: `timeout after ${TTQL_TIMEOUT_MS}ms` };
    }
    const msg = err instanceof Error ? err.message : String(err);
    return { matchedIds: new Set(), error: `runtime: ${msg}` };
  }
}

// ─── Internal timeout helper (mirrors search.service.withTimeout pattern) ───

class TimeoutError extends Error {
  constructor() {
    super('TTQL evaluation timeout');
    this.name = 'TtqlTimeoutError';
  }
}

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
