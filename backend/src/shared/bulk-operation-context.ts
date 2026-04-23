/**
 * TTBULK-1 PR-4 — AsyncLocalStorage для bulkOperationId.
 *
 * Processor оборачивает каждый execute() вызов в `bulkOpContext.run(opId, ...)`.
 * Все вложенные service-функции (executeTransition, assignIssue, updateIssue,
 * comments.create, issues.delete, issueCustomFields.setValue, sprints.addIssuesToSprint)
 * при записи в `AuditLog` читают контекст через `getCurrentBulkOperationId()` и
 * проставляют колонку `bulk_operation_id`. Это даёт связку «audit-запись ↔
 * массовая операция» без передачи bulkOperationId через каждую сигнатуру
 * (см. §5.4 TZ).
 *
 * Вне bulk-контекста функция возвращает `undefined` — обычные одиночные
 * пользовательские запросы не затрагиваются.
 */

import { AsyncLocalStorage } from 'node:async_hooks';

const storage = new AsyncLocalStorage<string>();

/**
 * Выполняет callback в контексте bulk-операции. `bulkOperationId` доступен
 * любому коду ниже по call-stack через `getCurrentBulkOperationId()`.
 */
export function runInBulkOperationContext<T>(bulkOperationId: string, fn: () => Promise<T>): Promise<T> {
  return storage.run(bulkOperationId, fn);
}

/**
 * Возвращает `bulkOperationId` активного контекста или `undefined` если
 * вызов идёт вне bulk-executor'а (обычный HTTP-запрос).
 */
export function getCurrentBulkOperationId(): string | undefined {
  return storage.getStore();
}
