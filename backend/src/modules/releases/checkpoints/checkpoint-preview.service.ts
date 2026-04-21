/**
 * TTSRH-1 PR-17 — dry-run preview для TTQL/STRUCTURED/COMBINED checkpoint condition.
 *
 * Публичный API:
 *   • previewCheckpointCondition(input) — возвращает breakdown + violations
 *     как если бы checkpoint был evaluate'нут на указанном релизе. Не пишет
 *     в БД, не триггерит webhooks.
 *
 * Зачем separate service: admin UI (PR-18) вызывает preview перед save чтобы
 * показать "как этот TTQL поведёт себя на живых данных". Переиспользует тот
 * же `evaluateCheckpoint` + `resolveTtqlMatchedIds` pipeline что и scheduler —
 * гарантирует zero drift между preview и production evaluation.
 *
 * Инварианты:
 *   • Rate-limit + timeout наследуются: POST /search/export-грейда 60s?
 *     Нет — preview ограничен по самому checkpoint-ttql-evaluator.ts 5s лимиту
 *     (R16). TTL на ответ не нужен — idempotent GET-like.
 *   • RBAC: `canManageCheckpoints` — проверяется в router layer.
 *   • Никогда не throws — все ошибки упакованы в `{error}` ответа.
 */

import { prisma } from '../../../prisma/client.js';
import { AppError } from '../../../shared/middleware/error-handler.js';
import { features } from '../../../shared/features.js';
import {
  evaluateCheckpoint,
  type CheckpointEvaluationResult,
} from './checkpoint-engine.service.js';
import { resolveTtqlMatchedIds } from './checkpoint-ttql-evaluator.service.js';
import type { CheckpointCriterion } from './checkpoint.types.js';
import { loadEvaluationIssuesForRelease } from './evaluation-loader.service.js';

export interface PreviewInput {
  releaseId: string;
  conditionMode: 'STRUCTURED' | 'TTQL' | 'COMBINED';
  criteria?: CheckpointCriterion[];
  ttqlCondition?: string | null;
  offsetDays?: number;
  warningDays?: number;
}

export interface PreviewResponse extends CheckpointEvaluationResult {
  // Meta for UI debug panel (PR-18).
  meta: {
    releaseId: string;
    conditionMode: 'STRUCTURED' | 'TTQL' | 'COMBINED';
    totalIssuesInRelease: number;
    ttqlSkippedByFlag: boolean;
    ttqlError: string | null;
  };
}

export async function previewCheckpointCondition(input: PreviewInput): Promise<PreviewResponse> {
  const release = await prisma.release.findUnique({
    where: { id: input.releaseId },
    select: { id: true, plannedDate: true },
  });
  if (!release) throw new AppError(404, 'Релиз не найден');
  if (!release.plannedDate) throw new AppError(400, 'У релиза нет плановой даты — preview невозможен');

  const offsetDays = input.offsetDays ?? 0;
  const deadline = new Date(release.plannedDate);
  deadline.setUTCDate(deadline.getUTCDate() + offsetDays);

  const loaded = await loadEvaluationIssuesForRelease(input.releaseId);
  const now = new Date();

  const criteria = input.criteria ?? [];

  // ─── TTQL resolution (flag-gated, same contract as scheduler) ─────────────
  let ttqlMatchedIds: Set<string> | null = null;
  let ttqlError: string | null = null;
  let ttqlSkipped = false;
  if (input.conditionMode === 'TTQL' || input.conditionMode === 'COMBINED') {
    if (!features.checkpointTtql) {
      // Per TZ §13.7 PR-16: with flag off, TTQL branch не выполняется. Для
      // preview отражаем это флагом в meta — UI покажет баннер "TTQL не
      // проверялся" чтобы автор КТ понимал, что результат неполон.
      ttqlSkipped = true;
    } else if (!input.ttqlCondition || input.ttqlCondition.trim().length === 0) {
      ttqlError = `${input.conditionMode} mode requires a non-empty ttqlCondition`;
    } else {
      const applicableIds = loaded.issues.map((i) => i.id);
      // System-level preview (admin context) — feed all project ids as scope so
      // the compiler's AND[0] = `projectId IN (...)` doesn't match-none.
      const projects = await prisma.project.findMany({ select: { id: true } });
      const res = await resolveTtqlMatchedIds(input.ttqlCondition, {
        now,
        applicableIssueIds: applicableIds,
        accessibleProjectIds: projects.map((p) => p.id),
      });
      ttqlMatchedIds = res.matchedIds;
      ttqlError = res.error;
    }
  }

  const result = evaluateCheckpoint(
    {
      criteria,
      deadline,
      warningDays: input.warningDays ?? 3,
      issues: loaded.issues,
      context: loaded.context,
      conditionMode: ttqlSkipped ? 'STRUCTURED' : input.conditionMode,
      ttqlMatchedIds,
      ttqlError,
    },
    now,
  );

  return {
    ...result,
    meta: {
      releaseId: input.releaseId,
      conditionMode: input.conditionMode,
      totalIssuesInRelease: loaded.issues.length,
      ttqlSkippedByFlag: ttqlSkipped,
      ttqlError,
    },
  };
}
