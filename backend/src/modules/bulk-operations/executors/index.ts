/**
 * TTBULK-1 — Реестр executor'ов.
 *
 * Processor получает executor по `BulkOperationType` через `getExecutor()`.
 * PR-4 зарегистрировал только TRANSITION; PR-5 добавил остальные 6 (ASSIGN,
 * EDIT_FIELD, EDIT_CUSTOM_FIELD, MOVE_TO_SPRINT, ADD_COMMENT, DELETE).
 *
 * Неизвестный type → runtime-null (DTO-валидация отфильтровывает до processor'а,
 * но защита на случай нового enum-value без обновления реестра).
 */

import type { BulkOperationType } from '@prisma/client';
import type { BulkExecutor } from '../bulk-operations.types.js';
import { transitionExecutor } from './transition.executor.js';
import { assignExecutor } from './assign.executor.js';
import { editFieldExecutor } from './edit-field.executor.js';
import { editCustomFieldExecutor } from './edit-custom-field.executor.js';
import { moveToSprintExecutor } from './move-to-sprint.executor.js';
import { addCommentExecutor } from './add-comment.executor.js';
import { deleteExecutor } from './delete.executor.js';

const registry: Partial<Record<BulkOperationType, BulkExecutor<unknown>>> = {
  TRANSITION: transitionExecutor as BulkExecutor<unknown>,
  ASSIGN: assignExecutor as BulkExecutor<unknown>,
  EDIT_FIELD: editFieldExecutor as BulkExecutor<unknown>,
  EDIT_CUSTOM_FIELD: editCustomFieldExecutor as BulkExecutor<unknown>,
  MOVE_TO_SPRINT: moveToSprintExecutor as BulkExecutor<unknown>,
  ADD_COMMENT: addCommentExecutor as BulkExecutor<unknown>,
  DELETE: deleteExecutor as BulkExecutor<unknown>,
};

/**
 * Возвращает executor для данного типа операции. В PR-5 все 7 реализованы;
 * `null` — защита на случай runtime-rogue enum-value.
 */
export function getExecutor(type: BulkOperationType): BulkExecutor<unknown> | null {
  return registry[type] ?? null;
}
