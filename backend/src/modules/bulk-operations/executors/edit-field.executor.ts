/**
 * TTBULK-1 PR-5 — EditFieldExecutor: массовое редактирование системного поля.
 *
 * Payload: `{ type: 'EDIT_FIELD', field, value }`, где field ∈
 *   { 'priority', 'dueDate', 'labels.add', 'labels.remove', 'description.append' }.
 *
 * PR-5 scope:
 *   • `priority` — updateIssue({priority}).
 *   • `dueDate` — updateIssue({dueDate}), null = очистить.
 *   • `description.append` — read current + append + updateIssue({description}).
 *   • `labels.add` / `labels.remove` — SKIPPED LABELS_NOT_SUPPORTED: схема Issue
 *     не имеет `labels` (требуется расширение схемы, отдельная задача).
 *
 * preflight: RBAC + валидация value → ELIGIBLE / SKIPPED.
 * execute: диспетчер по field.
 */

import type { BulkOperationType, Prisma } from '@prisma/client';
import { prisma } from '../../../prisma/client.js';
import { getCurrentBulkOperationId } from '../../../shared/bulk-operation-context.js';
import { updateIssue } from '../../issues/issues.service.js';
import type { BulkExecutor, BulkExecutorActor, IssueWithContext, PreflightResult } from '../bulk-operations.types.js';
import { actorHasProjectAccess } from './shared.js';

export type EditFieldPayload = {
  type: 'EDIT_FIELD';
  field: 'priority' | 'dueDate' | 'labels.add' | 'labels.remove' | 'description.append';
  value: unknown;
};

const VALID_PRIORITIES = new Set(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']);

export const editFieldExecutor: BulkExecutor<EditFieldPayload> = {
  type: 'EDIT_FIELD' satisfies BulkOperationType,

  async preflight(issue: IssueWithContext, payload: EditFieldPayload, actor: BulkExecutorActor): Promise<PreflightResult> {
    if (!(await actorHasProjectAccess(actor, issue.projectId))) {
      return { kind: 'SKIPPED', reasonCode: 'NO_ACCESS', reason: 'Нет доступа к проекту задачи' };
    }
    switch (payload.field) {
      case 'priority':
        if (typeof payload.value !== 'string' || !VALID_PRIORITIES.has(payload.value)) {
          return { kind: 'SKIPPED', reasonCode: 'TYPE_MISMATCH', reason: 'Невалидное значение priority' };
        }
        if (issue.priority === payload.value) {
          return { kind: 'SKIPPED', reasonCode: 'ALREADY_IN_TARGET_STATE', reason: 'Приоритет уже такой' };
        }
        return { kind: 'ELIGIBLE', preview: { field: 'priority', from: issue.priority, to: payload.value } };
      case 'dueDate':
        if (payload.value !== null && typeof payload.value !== 'string') {
          return { kind: 'SKIPPED', reasonCode: 'TYPE_MISMATCH', reason: 'dueDate должен быть строкой YYYY-MM-DD или null' };
        }
        return { kind: 'ELIGIBLE', preview: { field: 'dueDate', from: issue.dueDate, to: payload.value } };
      case 'description.append':
        if (typeof payload.value !== 'string' || payload.value.length === 0) {
          return { kind: 'SKIPPED', reasonCode: 'TYPE_MISMATCH', reason: 'description.append требует непустую строку' };
        }
        return { kind: 'ELIGIBLE', preview: { field: 'description.append', appendLength: payload.value.length } };
      case 'labels.add':
      case 'labels.remove':
        return { kind: 'SKIPPED', reasonCode: 'INVALID_FIELD_SCHEMA', reason: 'Labels не поддерживаются схемой Issue (TTBULK-2)' };
      default:
        return { kind: 'SKIPPED', reasonCode: 'TYPE_MISMATCH', reason: `Неизвестное поле: ${String(payload.field)}` };
    }
  },

  async execute(issue: IssueWithContext, payload: EditFieldPayload, actor: BulkExecutorActor): Promise<void> {
    const details: Record<string, unknown> = { field: payload.field };
    switch (payload.field) {
      case 'priority':
        details.from = issue.priority;
        details.to = payload.value;
        await updateIssue(issue.id, { priority: payload.value as 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' });
        break;
      case 'dueDate':
        details.from = issue.dueDate ? issue.dueDate.toISOString() : null;
        details.to = payload.value;
        await updateIssue(issue.id, { dueDate: payload.value as string | null });
        break;
      case 'description.append': {
        // Re-read description внутри execute — issue.description из
        // processor'овского findMany мог устареть (concurrent edit другим
        // юзером). Last-writer-wins допустим для bulk, но мы хотя бы не
        // затрём свежие изменения, случившиеся ПОСЛЕ preflight'а.
        // Pre-push review PR-5 🟡 #3.
        const fresh = await prisma.issue.findUniqueOrThrow({
          where: { id: issue.id },
          select: { description: true },
        });
        const current = fresh.description ?? '';
        const separator = current.length > 0 ? '\n\n' : '';
        const newDescription = `${current}${separator}${payload.value as string}`;
        details.appendedLength = (payload.value as string).length;
        await updateIssue(issue.id, { description: newDescription });
        break;
      }
      default:
        throw new Error(`EditField execute reached unknown field at runtime: ${String(payload.field)}`);
    }
    await prisma.auditLog.create({
      data: {
        action: 'issue.field_edited',
        entityType: 'issue',
        entityId: issue.id,
        userId: actor.userId,
        bulkOperationId: getCurrentBulkOperationId() ?? null,
        details: details as Prisma.InputJsonValue,
      },
    });
  },
};
