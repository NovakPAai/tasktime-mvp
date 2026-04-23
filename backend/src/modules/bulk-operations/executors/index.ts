/**
 * TTBULK-1 — Реестр executor'ов.
 *
 * Processor получает executor по `BulkOperationType` через `getExecutor()`.
 * В PR-4 зарегистрирован только `TransitionExecutor`; остальные 6 (Assign,
 * EditField, EditCustomField, MoveToSprint, AddComment, Delete) добавляются в PR-5.
 *
 * Неизвестный type → runtime-ошибка (должно быть отфильтровано DTO-валидацией
 * до processor'а, но защита на случай нового enum-value без обновления реестра).
 */

import type { BulkOperationType } from '@prisma/client';
import type { BulkExecutor } from '../bulk-operations.types.js';
import { transitionExecutor } from './transition.executor.js';

const registry: Partial<Record<BulkOperationType, BulkExecutor<unknown>>> = {
  TRANSITION: transitionExecutor as BulkExecutor<unknown>,
  // ASSIGN: assignExecutor as BulkExecutor<unknown>,          — PR-5
  // EDIT_FIELD: editFieldExecutor as BulkExecutor<unknown>,   — PR-5
  // EDIT_CUSTOM_FIELD: editCustomFieldExecutor as BulkExecutor<unknown>, — PR-5
  // MOVE_TO_SPRINT: moveToSprintExecutor as BulkExecutor<unknown>, — PR-5
  // ADD_COMMENT: addCommentExecutor as BulkExecutor<unknown>, — PR-5
  // DELETE: deleteExecutor as BulkExecutor<unknown>,          — PR-5
};

/**
 * Возвращает executor для данного типа операции или `null` если не реализован
 * (PR-4: только TRANSITION; PR-5 расширит). Processor должен трактовать `null`
 * как финализацию в FAILED с `errorCode='EXECUTOR_NOT_IMPLEMENTED'`.
 */
export function getExecutor(type: BulkOperationType): BulkExecutor<unknown> | null {
  return registry[type] ?? null;
}
