-- TTBULK-1 PR-1: схема для массовых операций.
--
-- Модели: BulkOperation, BulkOperationItem, UserGroupSystemRole.
-- Колонка: audit_logs.bulk_operation_id (FK, onDelete SetNull).
--
-- Retention (реализация — в PR-4 retention-cron):
--   bulk_operations         — 90 дней (@@index([createdAt]) для sweep)
--   bulk_operation_items    — 30 дней (@@index([processedAt]) для sweep)
--
-- Pending queue живёт в Redis, не в БД (см. §5.0 ТЗ). BulkOperationItem
-- персистится ТОЛЬКО для failed/skipped items — succeeded items оставляют след
-- в audit_logs через audit_logs.bulk_operation_id.
--
-- См. docs/tz/TTBULK-1.md §5.1.

-- Enums
CREATE TYPE "BulkOperationType" AS ENUM (
    'TRANSITION',
    'ASSIGN',
    'EDIT_FIELD',
    'EDIT_CUSTOM_FIELD',
    'MOVE_TO_SPRINT',
    'ADD_COMMENT',
    'DELETE'
);

CREATE TYPE "BulkOperationStatus" AS ENUM (
    'QUEUED',
    'RUNNING',
    'SUCCEEDED',
    'PARTIAL',
    'FAILED',
    'CANCELLED'
);

CREATE TYPE "BulkItemOutcome" AS ENUM (
    'FAILED',
    'SKIPPED'
);

-- bulk_operations
CREATE TABLE "bulk_operations" (
    "id"               TEXT NOT NULL,
    "created_by_id"    TEXT NOT NULL,
    "type"             "BulkOperationType" NOT NULL,
    "status"           "BulkOperationStatus" NOT NULL DEFAULT 'QUEUED',
    "scope_kind"       TEXT NOT NULL,
    "scope_jql"        TEXT,
    "payload"          JSONB NOT NULL,
    "idempotency_key"  TEXT NOT NULL,
    "total"            INTEGER NOT NULL,
    "processed"        INTEGER NOT NULL DEFAULT 0,
    "succeeded"        INTEGER NOT NULL DEFAULT 0,
    "failed"           INTEGER NOT NULL DEFAULT 0,
    "skipped"          INTEGER NOT NULL DEFAULT 0,
    "cancel_requested" BOOLEAN NOT NULL DEFAULT false,
    "heartbeat_at"     TIMESTAMP(3),
    "started_at"       TIMESTAMP(3),
    "finished_at"      TIMESTAMP(3),
    "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bulk_operations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "bulk_operations_created_by_id_idempotency_key_key"
    ON "bulk_operations"("created_by_id", "idempotency_key");
CREATE INDEX "bulk_operations_created_by_id_created_at_idx"
    ON "bulk_operations"("created_by_id", "created_at");
CREATE INDEX "bulk_operations_status_heartbeat_at_idx"
    ON "bulk_operations"("status", "heartbeat_at");
-- Processor pick-query (PR-4): WHERE status IN ('QUEUED','RUNNING') ORDER BY created_at ASC LIMIT 1.
-- Без этого composite'а планер делает bitmap-AND + filesort; с ним — прямой index-scan.
CREATE INDEX "bulk_operations_status_created_at_idx"
    ON "bulk_operations"("status", "created_at");
CREATE INDEX "bulk_operations_created_at_idx"
    ON "bulk_operations"("created_at");

ALTER TABLE "bulk_operations"
    ADD CONSTRAINT "bulk_operations_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- bulk_operation_items
CREATE TABLE "bulk_operation_items" (
    "id"            TEXT NOT NULL,
    "operation_id"  TEXT NOT NULL,
    "issue_id"      TEXT NOT NULL,
    "issue_key"     TEXT NOT NULL,
    "outcome"       "BulkItemOutcome" NOT NULL,
    "error_code"    TEXT NOT NULL,
    "error_message" TEXT NOT NULL,
    "processed_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bulk_operation_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "bulk_operation_items_operation_id_idx"
    ON "bulk_operation_items"("operation_id");
CREATE INDEX "bulk_operation_items_processed_at_idx"
    ON "bulk_operation_items"("processed_at");

ALTER TABLE "bulk_operation_items"
    ADD CONSTRAINT "bulk_operation_items_operation_id_fkey"
    FOREIGN KEY ("operation_id") REFERENCES "bulk_operations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- user_group_system_roles — даёт группе системную роль (напр., BULK_OPERATOR).
-- Эффективные роли юзера = UNION(DIRECT UserSystemRole, GROUP через членство).
CREATE TABLE "user_group_system_roles" (
    "id"         TEXT NOT NULL,
    "group_id"   TEXT NOT NULL,
    "role"       "SystemRoleType" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,

    CONSTRAINT "user_group_system_roles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_group_system_roles_group_id_role_key"
    ON "user_group_system_roles"("group_id", "role");
CREATE INDEX "user_group_system_roles_group_id_idx"
    ON "user_group_system_roles"("group_id");

ALTER TABLE "user_group_system_roles"
    ADD CONSTRAINT "user_group_system_roles_group_id_fkey"
    FOREIGN KEY ("group_id") REFERENCES "user_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- audit_logs.bulk_operation_id — метка источника для forensics (§5.4).
-- onDelete: SetNull — при retention-зачистке старой операции запись audit_log'а
-- сохраняется, но ссылка на операцию обнуляется.
ALTER TABLE "audit_logs"
    ADD COLUMN "bulk_operation_id" TEXT;

CREATE INDEX "audit_logs_bulk_operation_id_idx"
    ON "audit_logs"("bulk_operation_id");

ALTER TABLE "audit_logs"
    ADD CONSTRAINT "audit_logs_bulk_operation_id_fkey"
    FOREIGN KEY ("bulk_operation_id") REFERENCES "bulk_operations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
