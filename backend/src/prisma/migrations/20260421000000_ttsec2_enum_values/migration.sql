-- TTSEC-2: расширение ProjectPermission enum гранулярными значениями.
--
-- ВАЖНО: PostgreSQL требует, чтобы ALTER TYPE ... ADD VALUE выполнялся вне транзакции
-- (см. риск #6 в TTSEC-2.md). Prisma по умолчанию оборачивает каждый файл миграции в
-- транзакцию; поэтому эти ADD VALUE-операторы вынесены в ОТДЕЛЬНУЮ миграцию — без
-- DDL/DML-соседей, чтобы Prisma detect logic применил её без BEGIN/COMMIT.
--
-- Новые значения:
--   * SPRINTS_{CREATE,EDIT,DELETE} / RELEASES_{CREATE,EDIT,DELETE} — гранулярный CRUD
--   * COMMENTS_DELETE_OTHERS / TIME_LOGS_DELETE_OTHERS — модерация чужих записей
--   * USER_GROUP_{VIEW,MANAGE} — system-level permissions для админки групп
--
-- Старые *_MANAGE остаются в enum (DROP VALUE не поддерживается PG), но удаляются
-- из UI-матрицы в последующей миграции-seed и в PermissionMatrixDrawer.

ALTER TYPE "ProjectPermission" ADD VALUE IF NOT EXISTS 'SPRINTS_CREATE';
ALTER TYPE "ProjectPermission" ADD VALUE IF NOT EXISTS 'SPRINTS_EDIT';
ALTER TYPE "ProjectPermission" ADD VALUE IF NOT EXISTS 'SPRINTS_DELETE';
ALTER TYPE "ProjectPermission" ADD VALUE IF NOT EXISTS 'RELEASES_CREATE';
ALTER TYPE "ProjectPermission" ADD VALUE IF NOT EXISTS 'RELEASES_EDIT';
ALTER TYPE "ProjectPermission" ADD VALUE IF NOT EXISTS 'RELEASES_DELETE';
ALTER TYPE "ProjectPermission" ADD VALUE IF NOT EXISTS 'COMMENTS_DELETE_OTHERS';
ALTER TYPE "ProjectPermission" ADD VALUE IF NOT EXISTS 'TIME_LOGS_DELETE_OTHERS';
ALTER TYPE "ProjectPermission" ADD VALUE IF NOT EXISTS 'USER_GROUP_VIEW';
ALTER TYPE "ProjectPermission" ADD VALUE IF NOT EXISTS 'USER_GROUP_MANAGE';
