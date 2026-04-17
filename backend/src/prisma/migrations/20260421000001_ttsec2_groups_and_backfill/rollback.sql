-- TTSEC-2 ROLLBACK (manual — не применяется Prisma автоматически).
--
-- Применяется при критической ошибке после наката 20260421000001_ttsec2_groups_and_backfill.
-- Последовательность обратная: сначала снять FK, потом удалить таблицы и колонку source.
-- ВАЖНО: ProjectPermission enum values (SPRINTS_CREATE/...) и Legacy-данные в
-- project_role_permissions остаются — PostgreSQL не поддерживает DROP VALUE у enum, а лишние
-- гранулярные permissions безопасно игнорируются кодом (effective set = superset).
--
-- Чтобы полностью откатиться до 20260420, потребуется также:
--   DELETE FROM project_role_permissions WHERE permission IN (...новые значения...);
-- (опционально — не ломает работу).

BEGIN;

-- 1. Снять FK и удалить таблицы групп.
DROP TABLE IF EXISTS "project_group_roles";
DROP TABLE IF EXISTS "user_group_members";
DROP TABLE IF EXISTS "user_groups";

-- 2. Удалить колонку source (возвращаем UserProjectRole к TTMP-159 состоянию).
ALTER TABLE "user_project_roles" DROP COLUMN IF EXISTS "source";

-- 3. Удалить enum RoleAssignmentSource (если не осталось зависимых колонок).
DROP TYPE IF EXISTS "RoleAssignmentSource";

-- 4. (опционально) откатить backfill гранулярных permissions.
-- DELETE FROM "project_role_permissions"
-- WHERE permission IN (
--   'SPRINTS_CREATE', 'SPRINTS_EDIT', 'SPRINTS_DELETE',
--   'RELEASES_CREATE', 'RELEASES_EDIT', 'RELEASES_DELETE',
--   'COMMENTS_DELETE_OTHERS', 'TIME_LOGS_DELETE_OTHERS',
--   'USER_GROUP_VIEW', 'USER_GROUP_MANAGE'
-- );
-- NB: эти DELETE-операции не идемпотентны по factor "старые permissions, которые админ выдал
-- вручную после миграции" — перед prod-запуском делать snapshot project_role_permissions.

COMMIT;
