-- TTBULK-1 PR-1: расширение SystemRoleType enum значением BULK_OPERATOR.
--
-- ВАЖНО: PostgreSQL требует, чтобы ALTER TYPE ... ADD VALUE выполнялся вне транзакции
-- (см. TTSEC-2 паттерн в 20260421000000_ttsec2_enum_values). Prisma по умолчанию
-- оборачивает каждый файл миграции в транзакцию; поэтому этот ADD VALUE вынесен в
-- ОТДЕЛЬНУЮ миграцию — без DDL/DML-соседей, чтобы Prisma detect logic применил её
-- без BEGIN/COMMIT. Новое значение используется в follow-up миграции
-- 20260425000001_ttbulk_bulk_operations и в application-layer'е PR-2+.
--
-- Описание роли: позволяет юзеру инициировать массовые операции над issue'ами.
-- Per-item RBAC (проектные права) остаётся в силе и проверяется executor'ом.
-- См. docs/tz/TTBULK-1.md §7.1.

ALTER TYPE "SystemRoleType" ADD VALUE IF NOT EXISTS 'BULK_OPERATOR';
