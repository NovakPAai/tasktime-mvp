/**
 * TTBULK-1 PR-5 — DeleteExecutor: массовое удаление задач.
 *
 * Payload: `{ type: 'DELETE', confirmPhrase: 'DELETE' }`.
 *
 * Дополнительная защита уровня PR-5 (§9.2 ТЗ):
 *   • Помимо системной `BULK_OPERATOR` (роль-уровня в router'е) проверяем
 *     проектную permission `ISSUES_DELETE` для каждой задачи. Это гарантирует,
 *     что bulk-operator не может удалять в проектах, где он не имеет этого
 *     проектного права (даже если у него есть read-доступ).
 *   • SUPER_ADMIN / ADMIN bypass — через `hasAnySystemRole`.
 *
 * execute: `issues.deleteIssue(id)`.
 */

import type { BulkOperationType } from '@prisma/client';
import { prisma } from '../../../prisma/client.js';
import { getCurrentBulkOperationId } from '../../../shared/bulk-operation-context.js';
import { getEffectiveProjectPermissions } from '../../../shared/middleware/rbac.js';
import { deleteIssue } from '../../issues/issues.service.js';
import type { BulkExecutor, BulkExecutorActor, IssueWithContext, PreflightResult } from '../bulk-operations.types.js';

export type DeletePayload = { type: 'DELETE'; confirmPhrase: 'DELETE' };

export const deleteExecutor: BulkExecutor<DeletePayload> = {
  type: 'DELETE' satisfies BulkOperationType,

  async preflight(issue: IssueWithContext, _payload: DeletePayload, actor: BulkExecutorActor): Promise<PreflightResult> {
    // SUPER_ADMIN bypass — консистентно с shared/actorHasProjectAccess
    // (§7.1: только SUPER_ADMIN, ADMIN должен получить ISSUES_DELETE явно).
    if (actor.systemRoles.includes('SUPER_ADMIN')) {
      return { kind: 'ELIGIBLE' };
    }
    // Все остальные — требуют ISSUES_DELETE в проекте задачи. Bulk-operator
    // без project-membership → NO_ACCESS (не разглашаем разделение membership
    // vs permission, обе проблемы одинаково выглядят для юзера).
    const perms = await getEffectiveProjectPermissions(actor.userId, issue.projectId);
    if (!perms.includes('ISSUES_DELETE')) {
      return { kind: 'SKIPPED', reasonCode: 'NO_ACCESS', reason: 'Нет права удаления задач в проекте' };
    }
    return { kind: 'ELIGIBLE' };
  },

  async execute(issue: IssueWithContext, _payload: DeletePayload, actor: BulkExecutorActor): Promise<void> {
    // Снэпшотим metadata ДО delete (после delete issue-row нет).
    const auditDetails = {
      issueKey: `${issue.project.key}-${issue.number}`,
      title: issue.title,
      projectId: issue.projectId,
    };
    // Delete СНАЧАЛА — если упадёт (FK lock, network blip), не будет
    // false-positive forensic-записи, утверждающей что задача удалена.
    // Если audit fall'нет после успешного delete — хуже, чем audit до?
    // Нет: в худшем случае потеряем audit для успешного delete (operational
    // gap), но не создадим лжесвидетельство. См. pre-push review PR-5 🟠 #2.
    await deleteIssue(issue.id);
    await prisma.auditLog.create({
      data: {
        action: 'issue.deleted',
        entityType: 'issue',
        entityId: issue.id,
        userId: actor.userId,
        bulkOperationId: getCurrentBulkOperationId() ?? null,
        details: auditDetails,
      },
    });
  },
};
