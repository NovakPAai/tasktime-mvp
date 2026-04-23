/**
 * TTBULK-1 PR-9a — types и enum'ы массовых операций.
 *
 * Зеркало backend DTO. Wizard и downstream-компоненты (PR-9b Step2/3, PR-10
 * ProgressDrawer, PR-11 OperationsPage) импортируют отсюда. При изменении
 * backend — синхронизировать руками; compile-time проверка обеспечивается
 * только structural compatibility ответов API.
 *
 * Canonical sources:
 *   • DTO schemas:        backend/src/modules/bulk-operations/bulk-operations.dto.ts
 *   • Transport contract: backend/src/modules/bulk-operations/bulk-operations.router.ts
 *     (header Idempotency-Key, response shape / strip и т.д.)
 *
 * См. docs/tz/TTBULK-1.md §13.6 PR-9.
 */

// ────── Enums (mirror Prisma BulkOperation{Type,Status}) ────────────────────

export type BulkOperationType =
  | 'TRANSITION'
  | 'ASSIGN'
  | 'EDIT_FIELD'
  | 'EDIT_CUSTOM_FIELD'
  | 'MOVE_TO_SPRINT'
  | 'ADD_COMMENT'
  | 'DELETE';

export type BulkOperationStatus =
  | 'QUEUED'
  | 'RUNNING'
  | 'SUCCEEDED'
  | 'PARTIAL'
  | 'FAILED'
  | 'CANCELLED';

export const BULK_OPERATION_TYPES: readonly BulkOperationType[] = [
  'TRANSITION',
  'ASSIGN',
  'EDIT_FIELD',
  'EDIT_CUSTOM_FIELD',
  'MOVE_TO_SPRINT',
  'ADD_COMMENT',
  'DELETE',
] as const;

/** Hard-cap from backend DTO (MAX_ITEMS_HARD_LIMIT). UI hints ≤ runtime setting. */
export const BULK_OPS_MAX_ITEMS_HARD_LIMIT = 10_000;

// ────── Scope + payload (discriminated unions) ──────────────────────────────

export type BulkScope =
  | { kind: 'ids'; issueIds: string[] }
  | { kind: 'jql'; jql: string };

export type TransitionPayload = {
  type: 'TRANSITION';
  transitionId: string;
  fieldOverrides?: Record<string, unknown>;
};

export type AssignPayload = {
  type: 'ASSIGN';
  assigneeId: string | null;
};

export type EditFieldName =
  | 'priority'
  | 'dueDate'
  | 'labels.add'
  | 'labels.remove'
  | 'description.append';

export type EditFieldPayload = {
  type: 'EDIT_FIELD';
  field: EditFieldName;
  value: unknown;
};

export type EditCustomFieldPayload = {
  type: 'EDIT_CUSTOM_FIELD';
  customFieldId: string;
  value: unknown;
};

export type MoveToSprintPayload = {
  type: 'MOVE_TO_SPRINT';
  sprintId: string | null;
};

export type AddCommentPayload = {
  type: 'ADD_COMMENT';
  body: string;
};

export type DeletePayload = {
  type: 'DELETE';
  /** Anti-accidental gate: пользователь должен ввести «DELETE» (wizard Step4). */
  confirmPhrase: 'DELETE';
};

export type BulkOperationPayload =
  | TransitionPayload
  | AssignPayload
  | EditFieldPayload
  | EditCustomFieldPayload
  | MoveToSprintPayload
  | AddCommentPayload
  | DeletePayload;

// ────── Preview response ────────────────────────────────────────────────────

export interface BulkEligibleItem {
  issueId: string;
  issueKey: string;
  title: string;
  projectId: string;
  projectKey: string;
  preview?: Record<string, unknown>;
}

export interface BulkSkippedItem {
  issueId: string;
  issueKey: string;
  title: string;
  reasonCode: string;
  reason: string;
}

export interface BulkConflictItem {
  issueId: string;
  issueKey: string;
  title: string;
  code: string;
  message: string;
  requiredFields?: string[];
}

export interface BulkPreviewResponse {
  previewToken: string;
  totalMatched: number;
  eligible: BulkEligibleItem[];
  skipped: BulkSkippedItem[];
  conflicts: BulkConflictItem[];
  warnings: string[];
}

// ────── Operation summary (list / detail / stream init) ─────────────────────

export interface BulkOperation {
  id: string;
  createdById: string;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  type: BulkOperationType;
  status: BulkOperationStatus;
  scopeKind: 'ids' | 'jql';
  scopeJql: string | null;
  payload: BulkOperationPayload;
  total: number;
  succeeded: number;
  failed: number;
  skipped: number;
  cancelRequested: boolean;
  finalStatusReason: string | null;
}

export interface BulkOperationListResponse {
  items: BulkOperation[];
  total: number;
  startAt: number;
  limit: number;
}

/**
 * Router: `alreadyExisted` стрипается перед `res.json(...)` (используется только
 * для HTTP-кода: 200 на replay, 201 на create-new). Caller различает по статусу
 * ответа, не по полю. См. bulk-operations.router.ts:138-139.
 */
export interface BulkCreateResponse {
  id: string;
  status: BulkOperationStatus;
}

// ────── UI helpers ──────────────────────────────────────────────────────────

/**
 * Человекочитаемые подписи операций для wizard Step1.
 * Ключ = backend BulkOperationType, значение = { label, description }.
 */
export const OPERATION_LABELS: Record<
  BulkOperationType,
  { label: string; description: string; destructive?: boolean }
> = {
  TRANSITION: {
    label: 'Перевести статус',
    description: 'Применить workflow-transition к выбранным задачам',
  },
  ASSIGN: {
    label: 'Назначить исполнителя',
    description: 'Изменить Assignee (или снять)',
  },
  EDIT_FIELD: {
    label: 'Редактировать поле',
    description: 'priority / dueDate / labels / description.append',
  },
  EDIT_CUSTOM_FIELD: {
    label: 'Редактировать кастомное поле',
    description: 'Значение схемного кастомного поля',
  },
  MOVE_TO_SPRINT: {
    label: 'Переместить в спринт',
    description: 'Назначить или снять спринт',
  },
  ADD_COMMENT: {
    label: 'Добавить комментарий',
    description: 'К каждой задаче — один и тот же текст',
  },
  DELETE: {
    label: 'Удалить задачи',
    description: 'Необратимое удаление — требует подтверждения «DELETE»',
    destructive: true,
  },
};

/** Cost-free status→color mapping used в UI preview/drawer (will expand в PR-10). */
export const STATUS_COLORS: Record<BulkOperationStatus, string> = {
  QUEUED: 'default',
  RUNNING: 'processing',
  SUCCEEDED: 'success',
  PARTIAL: 'warning',
  FAILED: 'error',
  CANCELLED: 'default',
};

/**
 * Runtime narrowing для `BulkOperation.payload`: Prisma Json → typed union.
 *
 * Поле возвращается бэкендом как opaque JSON (migrations могли изменить форму
 * в прошлом). Callers обязаны проверить через этот guard перед доступом к
 * type-specific полям (e.g. `.transitionId`) — иначе TS молчит, а runtime
 * получит undefined.
 */
export function isBulkOperationPayload(v: unknown): v is BulkOperationPayload {
  if (typeof v !== 'object' || v === null) return false;
  const t = (v as Record<string, unknown>).type;
  return typeof t === 'string' && (BULK_OPERATION_TYPES as readonly string[]).includes(t);
}
