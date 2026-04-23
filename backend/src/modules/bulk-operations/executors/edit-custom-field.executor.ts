/**
 * TTBULK-1 PR-5 — EditCustomFieldExecutor: массовая установка кастомного поля.
 *
 * Payload: `{ type: 'EDIT_CUSTOM_FIELD', customFieldId, value }`.
 *
 * preflight:
 *   • RBAC (NO_ACCESS).
 *   • INVALID_FIELD_SCHEMA — CF не применим к данной задаче
 *     (`issueCustomFields.getApplicableFields` не содержит customFieldId).
 *   • TYPE_MISMATCH — runtime-валидация базовых типов (string/number/bool/null).
 *     Детальная type-validation — внутри `upsertIssueCustomFields`.
 *
 * execute: `upsertIssueCustomFields(issueId, { values: [{customFieldId, value}] }, actorId)`.
 */

import type { BulkOperationType } from '@prisma/client';
import { prisma } from '../../../prisma/client.js';
import { hasAnySystemRole } from '../../../shared/auth/roles.js';
import { getCurrentBulkOperationId } from '../../../shared/bulk-operation-context.js';
import {
  upsertIssueCustomFields,
  getApplicableFields,
} from '../../issue-custom-fields/issue-custom-fields.service.js';
import type { BulkExecutor, BulkExecutorActor, IssueWithContext, PreflightResult } from '../bulk-operations.types.js';

export type EditCustomFieldPayload = { type: 'EDIT_CUSTOM_FIELD'; customFieldId: string; value: unknown };

async function actorHasProjectAccess(actor: BulkExecutorActor, projectId: string): Promise<boolean> {
  if (hasAnySystemRole(actor.systemRoles, ['SUPER_ADMIN', 'ADMIN', 'RELEASE_MANAGER', 'AUDITOR'])) return true;
  const m = await prisma.userProjectRole.findFirst({ where: { userId: actor.userId, projectId }, select: { userId: true } });
  return m !== null;
}

export const editCustomFieldExecutor: BulkExecutor<EditCustomFieldPayload> = {
  type: 'EDIT_CUSTOM_FIELD' satisfies BulkOperationType,

  async preflight(issue: IssueWithContext, payload: EditCustomFieldPayload, actor: BulkExecutorActor): Promise<PreflightResult> {
    if (!(await actorHasProjectAccess(actor, issue.projectId))) {
      return { kind: 'SKIPPED', reasonCode: 'NO_ACCESS', reason: 'Нет доступа к проекту задачи' };
    }
    const applicable = await getApplicableFields(issue.id);
    const match = applicable.find((f) => f.customFieldId === payload.customFieldId);
    if (!match) {
      return {
        kind: 'SKIPPED',
        reasonCode: 'INVALID_FIELD_SCHEMA',
        reason: 'Custom field не применим к данной задаче (field scheme)',
      };
    }
    return { kind: 'ELIGIBLE', preview: { customFieldId: payload.customFieldId } };
  },

  async execute(issue: IssueWithContext, payload: EditCustomFieldPayload, actor: BulkExecutorActor): Promise<void> {
    // upsertIssueCustomFields DTO type: string | number | boolean | string[] | null.
    // В bulk'е value — `unknown` (из operationPayloadDto.EDIT_CUSTOM_FIELD.value);
    // doверяем DTO-валидации на preview/create, cast'им здесь. Runtime-type-check
    // внутри upsertIssueCustomFields бросит ошибку на невалидный тип — словим
    // её в processor как EXECUTOR_ERROR.
    await upsertIssueCustomFields(
      issue.id,
      { values: [{ customFieldId: payload.customFieldId, value: payload.value as string | number | boolean | string[] | null }] },
      actor.userId,
    );
    await prisma.auditLog.create({
      data: {
        action: 'issue.custom_field_edited',
        entityType: 'issue',
        entityId: issue.id,
        userId: actor.userId,
        bulkOperationId: getCurrentBulkOperationId() ?? null,
        details: { customFieldId: payload.customFieldId },
      },
    });
  },
};
