/**
 * TTBULK-1 PR-5 — MoveToSprintExecutor: массовое добавление/удаление из спринта.
 *
 * Payload: `{ type: 'MOVE_TO_SPRINT', sprintId: string | null }`.
 *   • string → переместить в этот спринт.
 *   • null   → убрать из текущего спринта (в бэклог).
 *
 * preflight:
 *   • RBAC (NO_ACCESS).
 *   • SPRINT_PROJECT_MISMATCH — задача не из проекта целевого спринта
 *     (cross-project move в Phase 1 не поддерживается, §2.1 ТЗ).
 *   • ALREADY_IN_TARGET_STATE — issue.sprintId уже = payload.sprintId.
 *
 * execute: `sprints.moveIssuesToSprint(sprintId, [issueId], expectedProjectId)`.
 */

import type { BulkOperationType, Sprint } from '@prisma/client';
import { prisma } from '../../../prisma/client.js';
import { hasAnySystemRole } from '../../../shared/auth/roles.js';
import { getCurrentBulkOperationId } from '../../../shared/bulk-operation-context.js';
import { moveIssuesToSprint } from '../../sprints/sprints.service.js';
import type { BulkExecutor, BulkExecutorActor, IssueWithContext, PreflightResult } from '../bulk-operations.types.js';

export type MoveToSprintPayload = { type: 'MOVE_TO_SPRINT'; sprintId: string | null };

async function actorHasProjectAccess(actor: BulkExecutorActor, projectId: string): Promise<boolean> {
  if (hasAnySystemRole(actor.systemRoles, ['SUPER_ADMIN', 'ADMIN', 'RELEASE_MANAGER', 'AUDITOR'])) return true;
  const m = await prisma.userProjectRole.findFirst({ where: { userId: actor.userId, projectId }, select: { userId: true } });
  return m !== null;
}

// Per-preflight sprint lookup — кэшируем на уровне процесса Map'ой бы выгодно, но
// Phase 1 не оптимизирует; processor batch=25 даёт 25 lookup'ов, приемлемо.
async function resolveSprintProject(sprintId: string): Promise<Pick<Sprint, 'id' | 'projectId'> | null> {
  return prisma.sprint.findUnique({ where: { id: sprintId }, select: { id: true, projectId: true } });
}

export const moveToSprintExecutor: BulkExecutor<MoveToSprintPayload> = {
  type: 'MOVE_TO_SPRINT' satisfies BulkOperationType,

  async preflight(issue: IssueWithContext, payload: MoveToSprintPayload, actor: BulkExecutorActor): Promise<PreflightResult> {
    if (!(await actorHasProjectAccess(actor, issue.projectId))) {
      return { kind: 'SKIPPED', reasonCode: 'NO_ACCESS', reason: 'Нет доступа к проекту задачи' };
    }
    if (issue.sprintId === payload.sprintId) {
      return { kind: 'SKIPPED', reasonCode: 'ALREADY_IN_TARGET_STATE', reason: 'Задача уже в целевом спринте (или уже в бэклоге)' };
    }
    if (payload.sprintId !== null) {
      const sprint = await resolveSprintProject(payload.sprintId);
      if (!sprint) {
        return { kind: 'SKIPPED', reasonCode: 'INVALID_FIELD_SCHEMA', reason: 'Целевой спринт не найден' };
      }
      if (sprint.projectId !== issue.projectId) {
        return { kind: 'SKIPPED', reasonCode: 'SPRINT_PROJECT_MISMATCH', reason: 'Задача не из проекта спринта (cross-project в Phase 1 не поддерживается)' };
      }
    }
    return { kind: 'ELIGIBLE', preview: { fromSprintId: issue.sprintId, toSprintId: payload.sprintId } };
  },

  async execute(issue: IssueWithContext, payload: MoveToSprintPayload, actor: BulkExecutorActor): Promise<void> {
    await moveIssuesToSprint(payload.sprintId, [issue.id], issue.projectId);
    await prisma.auditLog.create({
      data: {
        action: 'issue.moved_to_sprint',
        entityType: 'issue',
        entityId: issue.id,
        userId: actor.userId,
        bulkOperationId: getCurrentBulkOperationId() ?? null,
        details: { fromSprintId: issue.sprintId, toSprintId: payload.sprintId },
      },
    });
  },
};
