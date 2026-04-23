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
import { getCurrentBulkOperationId } from '../../../shared/bulk-operation-context.js';
import {
  upsertIssueCustomFields,
  getApplicableFields,
} from '../../issue-custom-fields/issue-custom-fields.service.js';
import type { BulkExecutor, BulkExecutorActor, IssueWithContext, PreflightResult } from '../bulk-operations.types.js';
import { actorHasProjectAccess } from './shared.js';

export type EditCustomFieldPayload = { type: 'EDIT_CUSTOM_FIELD'; customFieldId: string; value: unknown };

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
    // Scalar-type guard: `payload.value` — unknown. upsertIssueCustomFields DTO
    // принимает string | number | boolean | string[] | null. Любой другой тип
    // (object, mixed array) должен стать SKIPPED TYPE_MISMATCH, а не EXECUTOR_ERROR.
    // Pre-push review PR-5 🟡 #4.
    const v = payload.value;
    const validType =
      v === null ||
      typeof v === 'string' ||
      typeof v === 'number' ||
      typeof v === 'boolean' ||
      (Array.isArray(v) && v.every((x) => typeof x === 'string'));
    if (!validType) {
      return {
        kind: 'SKIPPED',
        reasonCode: 'TYPE_MISMATCH',
        reason: 'Custom field value должен быть scalar (string/number/boolean/null) или string[]',
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
