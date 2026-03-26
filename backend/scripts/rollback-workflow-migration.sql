-- ============================================================
-- ROLLBACK: TTADM-62 — Default workflow migration
-- ============================================================
-- Применять ТОЛЬКО при необходимости отката после миграции
-- 20260325020000_default_workflow_init_and_backfill.
--
-- Порядок выполнения:
--   psql $DATABASE_URL -f scripts/rollback-workflow-migration.sql
--
-- ВАЖНО: Этот скрипт НЕ откатывает DDL-миграции (таблицы,
-- колонки). Он только очищает данные, вставленные миграцией
-- 020000, и сбрасывает workflow_status_id → NULL на issues.
-- ============================================================

BEGIN;

-- 1. Сбросить workflow_status_id на issues
UPDATE "issues" SET "workflow_status_id" = NULL;

-- 2. Отвязать все проекты от схем
DELETE FROM "workflow_scheme_projects";

-- 3. Удалить схемы
DELETE FROM "workflow_scheme_items" WHERE "scheme_id" = 'default-scheme';
DELETE FROM "workflow_schemes"      WHERE "id" = 'default-scheme';

-- 4. Удалить переходы и шаги default workflow
DELETE FROM "workflow_transitions" WHERE "workflow_id" = 'default-workflow';
DELETE FROM "workflow_steps"       WHERE "workflow_id" = 'default-workflow';
DELETE FROM "workflows"            WHERE "id" = 'default-workflow';

-- 5. Удалить системные статусы
DELETE FROM "workflow_statuses" WHERE "is_system" = true;

COMMIT;

-- После выполнения откатить миграцию в _prisma_migrations:
-- UPDATE "_prisma_migrations"
-- SET "rolled_back_at" = NOW()
-- WHERE "migration_name" = '20260325020000_default_workflow_init_and_backfill';
--
-- Затем пометить предыдущую backfill-миграцию как не применённую (если нужно):
-- UPDATE "_prisma_migrations"
-- SET "rolled_back_at" = NOW()
-- WHERE "migration_name" = '20260325010000_backfill_workflow_status_id';
