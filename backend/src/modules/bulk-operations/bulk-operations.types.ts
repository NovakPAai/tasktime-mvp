/**
 * TTBULK-1 — Типы для массовых операций.
 *
 * `BulkExecutor<P>` — контракт executor'а (реализации — в PR-4 / PR-5).
 * Служит шаблоном для всех операций (TRANSITION, ASSIGN, EDIT_FIELD и т.д.):
 * pre-flight validation + apply change. Каждый executor реализует оба метода
 * с конкретным типом payload'а, чтобы TS гарантировал type-safety.
 *
 * Payload передаётся уже после Zod-валидации DTO; в preflight и execute
 * не требуется повторная проверка shape'а.
 *
 * См. docs/tz/TTBULK-1.md §6.2.
 */

import type { BulkOperationType, Issue, Project, SystemRoleType } from '@prisma/client';

/**
 * Issue + дополнительный контекст, необходимый executor'у
 * (projectId, current status, type-scheme id и т.д.). Processor при LPOP'е
 * запрашивает это в одном round-trip для пачки — см. PR-4.
 */
export type IssueWithContext = Issue & {
  project: Pick<Project, 'id' | 'key'>;
};

/** Actor — пользователь, инициировавший операцию. Минимальный subset `AuthUser`. */
export type BulkExecutorActor = {
  userId: string;
  systemRoles: SystemRoleType[];
};

/** Код причины, по которой item был отфильтрован на pre-flight-этапе. */
export type BulkSkipReasonCode =
  | 'NO_TRANSITION'
  | 'NO_ACCESS'
  | 'INVALID_FIELD_SCHEMA'
  | 'TYPE_MISMATCH'
  | 'DELETED'
  | 'SPRINT_PROJECT_MISMATCH'
  | 'ALREADY_IN_TARGET_STATE';

/** Код конфликта, требующего явного решения пользователя. */
export type BulkConflictCode =
  | 'WORKFLOW_REQUIRED_FIELDS'
  | 'WATCHED_BY_OTHERS'
  | 'AI_IN_PROGRESS';

/**
 * Результат pre-flight проверки одного item'а. Discriminated union:
 *  • ELIGIBLE — item готов к изменению, опционально с preview-дельтой
 *    для отображения в UI шага 3 wizard'а.
 *  • SKIPPED — item пропускается по правилу; пишется в BulkOperationItem
 *    (outcome=SKIPPED, errorCode).
 *  • CONFLICT — требует явного выбора пользователя (INCLUDE/EXCLUDE/OVERRIDE)
 *    на шаге 3 wizard'а. Если preview → execute происходит без разрешения,
 *    processor трактует как SKIPPED с тем же errorCode.
 */
export type PreflightResult =
  | { kind: 'ELIGIBLE'; preview?: Record<string, unknown> }
  | { kind: 'SKIPPED'; reasonCode: BulkSkipReasonCode; reason: string }
  | { kind: 'CONFLICT'; code: BulkConflictCode; message: string; requiredFields?: string[] };

/**
 * Контракт executor'а. Один executor на тип операции; регистрируется в
 * реестре `executors/index.ts` (PR-5).
 *
 * Инварианты:
 *   • `preflight` — read-only, идемпотентна, не вызывает внешние сервисы
 *     c side-effects (только read-запросы).
 *   • `execute` — применяет изменение в Prisma-транзакции от имени `actor`.
 *     Должен быть идемпотентен когда возможно (например, `ALREADY_IN_TARGET_STATE`
 *     — noop вместо ошибки).
 *   • Per-item RBAC — обязательно внутри `preflight` (NO_ACCESS → SKIPPED).
 *     Пропуск проверки = P0 bug (§9.2 TZ).
 */
export interface BulkExecutor<P = unknown> {
  readonly type: BulkOperationType;
  preflight(issue: IssueWithContext, payload: P, actor: BulkExecutorActor): Promise<PreflightResult>;
  execute(issue: IssueWithContext, payload: P, actor: BulkExecutorActor): Promise<void>;
}
