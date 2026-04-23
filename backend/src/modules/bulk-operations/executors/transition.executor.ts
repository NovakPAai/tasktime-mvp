/**
 * TTBULK-1 PR-4 — TransitionExecutor: массовый переход статусов.
 *
 * Реализует `BulkExecutor<TransitionPayload>` (см. bulk-operations.types.ts):
 *   • preflight: per-item проверка — существование задачи, RBAC (actor имеет
 *     ли доступ к проекту), доступность transition'а из текущего status'а
 *     (NO_TRANSITION), идентичность статусов (ALREADY_IN_TARGET_STATE),
 *     обязательные screen-поля (WORKFLOW_REQUIRED_FIELDS).
 *   • execute: вызывает `workflowEngine.executeTransition` от имени actor'а;
 *     auditLog заходит с `bulkOperationId` через AsyncLocalStorage-контекст
 *     (см. shared/bulk-operation-context.ts) без изменения сигнатуры.
 *
 * Инварианты:
 *   • preflight — read-only, идемпотентна.
 *   • Любая ошибка на execute пропагируется processor'у как FAILED item;
 *     остальные items в пачке продолжают обрабатываться.
 *   • Per-item RBAC — `NO_ACCESS` если юзер не имеет проектного членства или
 *     global-read роли. SUPER_ADMIN / ADMIN bypass через `hasAnySystemRole`.
 */

import type { BulkOperationType } from '@prisma/client';
import { prisma } from '../../../prisma/client.js';
import { hasAnySystemRole } from '../../../shared/auth/roles.js';
import { executeTransition, getAvailableTransitions } from '../../workflow-engine/workflow-engine.service.js';
import type { BulkExecutor, BulkExecutorActor, IssueWithContext, PreflightResult } from '../bulk-operations.types.js';

/** Payload TransitionExecutor'а — параметры, валидированные DTO (`TRANSITION` вариант). */
export type TransitionPayload = {
  type: 'TRANSITION';
  transitionId: string;
  fieldOverrides?: Record<string, unknown>;
};

/**
 * Проверяет, что actor видит проект issue'а. Без этого bulk-operator мог бы
 * менять статусы в проектах, к которым физически не имеет доступа (для pure
 * BULK_OPERATOR без доступа к проекту). SUPER_ADMIN/ADMIN bypass.
 */
async function actorHasProjectAccess(actor: BulkExecutorActor, projectId: string): Promise<boolean> {
  if (hasAnySystemRole(actor.systemRoles, ['SUPER_ADMIN', 'ADMIN', 'RELEASE_MANAGER', 'AUDITOR'])) {
    return true;
  }
  const membership = await prisma.userProjectRole.findFirst({
    where: { userId: actor.userId, projectId },
    select: { userId: true },
  });
  return membership !== null;
}

export const transitionExecutor: BulkExecutor<TransitionPayload> = {
  type: 'TRANSITION' satisfies BulkOperationType,

  async preflight(issue: IssueWithContext, payload: TransitionPayload, actor: BulkExecutorActor): Promise<PreflightResult> {
    // 1. RBAC: доступ к проекту.
    if (!(await actorHasProjectAccess(actor, issue.projectId))) {
      return { kind: 'SKIPPED', reasonCode: 'NO_ACCESS', reason: 'Нет доступа к проекту задачи' };
    }

    // 2. Проверяем доступные переходы из текущего статуса.
    const available = await getAvailableTransitions(issue.id, actor.userId, actor.systemRoles);
    const match = available.transitions.find((t) => t.id === payload.transitionId);
    if (!match) {
      return {
        kind: 'SKIPPED',
        reasonCode: 'NO_TRANSITION',
        reason: 'Переход недоступен для текущего статуса задачи',
      };
    }

    // 3. ALREADY_IN_TARGET_STATE — noop, пропускаем.
    if (issue.workflowStatusId === match.toStatus.id) {
      return {
        kind: 'SKIPPED',
        reasonCode: 'ALREADY_IN_TARGET_STATE',
        reason: 'Задача уже находится в целевом статусе',
      };
    }

    // 4. Required screen fields — CONFLICT, пока пользователь не укажет значения.
    if (match.requiresScreen && match.screenFields) {
      const requiredFields = match.screenFields
        .filter((f) => f.isRequired)
        .map((f) => f.name)
        .filter((name) => !(payload.fieldOverrides ?? {})[name]);
      if (requiredFields.length > 0) {
        return {
          kind: 'CONFLICT',
          code: 'WORKFLOW_REQUIRED_FIELDS',
          message: `Переход требует заполнения полей: ${requiredFields.join(', ')}`,
          requiredFields,
        };
      }
    }

    return {
      kind: 'ELIGIBLE',
      preview: {
        fromStatusId: issue.workflowStatusId,
        toStatusId: match.toStatus.id,
        toStatusName: match.toStatus.name,
      },
    };
  },

  async execute(issue: IssueWithContext, payload: TransitionPayload, actor: BulkExecutorActor): Promise<void> {
    // executeTransition сам пишет auditLog + invalidates caches + post-functions.
    // `bulkOperationId` попадает в audit через AsyncLocalStorage-контекст, который
    // processor устанавливает на каждый item (см. bulk-operations.processor.ts).
    await executeTransition(
      issue.id,
      payload.transitionId,
      actor.userId,
      actor.systemRoles,
      payload.fieldOverrides,
    );
  },
};
