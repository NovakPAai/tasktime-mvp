/**
 * TTBULK-1 — Zod DTO для массовых операций.
 *
 * Публичный API (см. §4 ТЗ):
 *   • previewBulkOperationDto — POST /preview body.
 *   • createBulkOperationDto — POST / body.
 *   • listQueryDto — GET ?limit=&startAt=&status=.
 *
 * Инварианты:
 *   • `scope` ровно одно из { ids, jql } (discriminated union по `kind`).
 *   • `issueIds.max = 10000` (BULK_OP_MAX_ITEMS по умолчанию; runtime может
 *     clamp'нуть ниже по System settings PR-7). 400 TOO_MANY_ITEMS при
 *     превышении на scope=ids (см. §3.5 ТЗ).
 *   • `jql.max = 4000` символов — защита от DoS через мега-запрос.
 *   • `operationPayload` — discriminated union по `type`. Каждый вариант
 *     содержит только те поля, которые нужны соответствующему executor'у.
 *   • DELETE требует confirmPhrase='DELETE' — дополнительная защита от
 *     accidental-destruction (§3.2 шаг 2).
 *   • ADD_COMMENT.body.max = 10000 — синхронно с единичным `/issues/:id/comments`.
 *
 * См. docs/tz/TTBULK-1.md §4.2.
 */

import { z } from 'zod';
import { BulkOperationStatus, BulkOperationType } from '@prisma/client';

// ────── Scope (ids | jql) ────────────────────────────────────────────────────

/**
 * Hard-cap на scope=ids — защита на DTO-уровне. Runtime ещё раз clamp'ает
 * по System settings (может быть <= этого значения).
 */
export const MAX_ITEMS_HARD_LIMIT = 10_000;

const scopeIdsDto = z.object({
  kind: z.literal('ids'),
  issueIds: z.array(z.string().uuid()).min(1).max(MAX_ITEMS_HARD_LIMIT),
});

const scopeJqlDto = z.object({
  kind: z.literal('jql'),
  jql: z.string().min(1).max(4000),
});

export const scopeDto = z.discriminatedUnion('kind', [scopeIdsDto, scopeJqlDto]);

// ────── Operation payloads (discriminated by `type`) ─────────────────────────

const transitionPayload = z.object({
  type: z.literal('TRANSITION'),
  transitionId: z.string().uuid(),
  /** Значения required-полей, собранные на шаге 2 wizard'а (если workflow требует). */
  fieldOverrides: z.record(z.unknown()).optional(),
});

const assignPayload = z.object({
  type: z.literal('ASSIGN'),
  /** null = unassign (очистить исполнителя). */
  assigneeId: z.string().uuid().nullable(),
});

const editFieldPayload = z.object({
  type: z.literal('EDIT_FIELD'),
  field: z.enum(['priority', 'dueDate', 'labels.add', 'labels.remove', 'description.append']),
  /** Тип значения зависит от field; executor (PR-5) валидирует своим Zod-refinement. */
  value: z.unknown(),
});

const editCustomFieldPayload = z.object({
  type: z.literal('EDIT_CUSTOM_FIELD'),
  customFieldId: z.string().uuid(),
  value: z.unknown(),
});

const moveToSprintPayload = z.object({
  type: z.literal('MOVE_TO_SPRINT'),
  /** null = remove from sprint. */
  sprintId: z.string().uuid().nullable(),
});

const addCommentPayload = z.object({
  type: z.literal('ADD_COMMENT'),
  body: z.string().min(1).max(10_000),
});

const deletePayload = z.object({
  type: z.literal('DELETE'),
  /** Anti-accidental gate: пользователь должен ввести «DELETE» (see §3.2). */
  confirmPhrase: z.literal('DELETE'),
});

export const operationPayloadDto = z.discriminatedUnion('type', [
  transitionPayload,
  assignPayload,
  editFieldPayload,
  editCustomFieldPayload,
  moveToSprintPayload,
  addCommentPayload,
  deletePayload,
]);

export type OperationPayload = z.infer<typeof operationPayloadDto>;

// ────── Request bodies ───────────────────────────────────────────────────────

export const previewBulkOperationDto = z.object({
  scope: scopeDto,
  payload: operationPayloadDto,
});

export type PreviewBulkOperationDto = z.infer<typeof previewBulkOperationDto>;

export const createBulkOperationDto = z.object({
  previewToken: z.string().uuid(),
  /** Для каждого conflictId из preview response — как поступить. */
  conflictResolutions: z.record(z.enum(['INCLUDE', 'EXCLUDE', 'USE_OVERRIDE'])).optional(),
});

export type CreateBulkOperationDto = z.infer<typeof createBulkOperationDto>;

// ────── List query ───────────────────────────────────────────────────────────

const statusValues = Object.values(BulkOperationStatus) as [
  BulkOperationStatus,
  ...BulkOperationStatus[],
];
const typeValues = Object.values(BulkOperationType) as [BulkOperationType, ...BulkOperationType[]];

export const listQueryDto = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  startAt: z.coerce.number().int().min(0).max(10_000).optional(),
  status: z.enum(statusValues).optional(),
  type: z.enum(typeValues).optional(),
});

export type ListQueryDto = z.infer<typeof listQueryDto>;
