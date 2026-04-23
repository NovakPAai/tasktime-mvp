/**
 * TTBULK-1 PR-5 — AssignExecutor: массовое переназначение исполнителя.
 *
 * Payload: `{ type: 'ASSIGN', assigneeId: string | null }`.
 *   • null → unassign (clear исполнителя).
 *   • string uuid → assignee check'ится в execute (issues.assignIssue делает).
 *
 * preflight: RBAC (NO_ACCESS) → ELIGIBLE + preview {fromAssigneeId, toAssigneeId}.
 * execute: issues.assignIssue + audit `issue.assigned` с bulkOperationId из контекста.
 */

import type { BulkOperationType } from '@prisma/client';
import { prisma } from '../../../prisma/client.js';
import { getCurrentBulkOperationId } from '../../../shared/bulk-operation-context.js';
import { assignIssue } from '../../issues/issues.service.js';
import type { BulkExecutor, BulkExecutorActor, IssueWithContext, PreflightResult } from '../bulk-operations.types.js';
import { actorHasProjectAccess } from './shared.js';

export type AssignPayload = { type: 'ASSIGN'; assigneeId: string | null };

export const assignExecutor: BulkExecutor<AssignPayload> = {
  type: 'ASSIGN' satisfies BulkOperationType,

  async preflight(issue: IssueWithContext, payload: AssignPayload, actor: BulkExecutorActor): Promise<PreflightResult> {
    if (!(await actorHasProjectAccess(actor, issue.projectId))) {
      return { kind: 'SKIPPED', reasonCode: 'NO_ACCESS', reason: 'Нет доступа к проекту задачи' };
    }
    if (issue.assigneeId === payload.assigneeId) {
      // Уже назначен на этого исполнителя (или оба null) — noop.
      return { kind: 'SKIPPED', reasonCode: 'ALREADY_IN_TARGET_STATE', reason: 'Исполнитель уже такой же' };
    }
    return {
      kind: 'ELIGIBLE',
      preview: { fromAssigneeId: issue.assigneeId, toAssigneeId: payload.assigneeId },
    };
  },

  async execute(issue: IssueWithContext, payload: AssignPayload, actor: BulkExecutorActor): Promise<void> {
    await assignIssue(issue.id, { assigneeId: payload.assigneeId });
    await prisma.auditLog.create({
      data: {
        action: 'issue.assigned',
        entityType: 'issue',
        entityId: issue.id,
        userId: actor.userId,
        bulkOperationId: getCurrentBulkOperationId() ?? null,
        details: { fromAssigneeId: issue.assigneeId, toAssigneeId: payload.assigneeId },
      },
    });
  },
};
