/**
 * TTBULK-1 PR-5 — AddCommentExecutor: массовое добавление комментария.
 *
 * Payload: `{ type: 'ADD_COMMENT', body: string }` (body.max=10000 в DTO).
 *
 * preflight: RBAC (NO_ACCESS) → ELIGIBLE. Тело комментария не валидируем
 * повторно — DTO уже проверил длину.
 *
 * execute: `comments.createComment(issueId, actorId, {body})`.
 *   comments.service НЕ пишет auditLog — пишем явно здесь (для forensics).
 */

import type { BulkOperationType } from '@prisma/client';
import { prisma } from '../../../prisma/client.js';
import { hasAnySystemRole } from '../../../shared/auth/roles.js';
import { getCurrentBulkOperationId } from '../../../shared/bulk-operation-context.js';
import { createComment } from '../../comments/comments.service.js';
import type { BulkExecutor, BulkExecutorActor, IssueWithContext, PreflightResult } from '../bulk-operations.types.js';

export type AddCommentPayload = { type: 'ADD_COMMENT'; body: string };

async function actorHasProjectAccess(actor: BulkExecutorActor, projectId: string): Promise<boolean> {
  if (hasAnySystemRole(actor.systemRoles, ['SUPER_ADMIN', 'ADMIN', 'RELEASE_MANAGER', 'AUDITOR'])) return true;
  const m = await prisma.userProjectRole.findFirst({ where: { userId: actor.userId, projectId }, select: { userId: true } });
  return m !== null;
}

export const addCommentExecutor: BulkExecutor<AddCommentPayload> = {
  type: 'ADD_COMMENT' satisfies BulkOperationType,

  async preflight(issue: IssueWithContext, _payload: AddCommentPayload, actor: BulkExecutorActor): Promise<PreflightResult> {
    if (!(await actorHasProjectAccess(actor, issue.projectId))) {
      return { kind: 'SKIPPED', reasonCode: 'NO_ACCESS', reason: 'Нет доступа к проекту задачи' };
    }
    return { kind: 'ELIGIBLE' };
  },

  async execute(issue: IssueWithContext, payload: AddCommentPayload, actor: BulkExecutorActor): Promise<void> {
    const comment = await createComment(issue.id, actor.userId, { body: payload.body });
    await prisma.auditLog.create({
      data: {
        action: 'issue.comment_added',
        entityType: 'issue',
        entityId: issue.id,
        userId: actor.userId,
        bulkOperationId: getCurrentBulkOperationId() ?? null,
        details: { commentId: comment.id, bodyLength: payload.body.length },
      },
    });
  },
};
