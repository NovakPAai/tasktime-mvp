-- TTSEC-2: UserGroup / UserGroupMember / ProjectGroupRole + backfill гранулярных прав + Legacy-группы.
--
-- Должна применяться СТРОГО после 20260421000000_ttsec2_enum_values (ADD VALUE для ProjectPermission).
-- Порядок шагов критичен (риск #11): backfill-пермишны ПЕРЕД Legacy-группами, иначе Legacy-группы
-- унаследуют только *_MANAGE и новые гранулярные не раздадутся.
--
-- Идемпотентность (SEC-3): ON CONFLICT DO NOTHING на каждом INSERT, IF NOT EXISTS на DDL.

-- ШАГ 0: enum RoleAssignmentSource.
DO $$ BEGIN
  CREATE TYPE "RoleAssignmentSource" AS ENUM ('DIRECT', 'GROUP');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ШАГ 1: колонка source в user_project_roles (default DIRECT — существующие записи остаются DIRECT).
ALTER TABLE "user_project_roles"
  ADD COLUMN IF NOT EXISTS "source" "RoleAssignmentSource" NOT NULL DEFAULT 'DIRECT';

-- ШАГ 2: таблицы групп.
CREATE TABLE IF NOT EXISTS "user_groups" (
  "id"          TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "description" TEXT,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"  TIMESTAMP(3) NOT NULL,
  CONSTRAINT "user_groups_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "user_group_members" (
  "group_id"     TEXT NOT NULL,
  "user_id"      TEXT NOT NULL,
  "added_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "added_by_id"  TEXT,
  CONSTRAINT "user_group_members_pkey" PRIMARY KEY ("group_id", "user_id")
);

CREATE TABLE IF NOT EXISTS "project_group_roles" (
  "id"         TEXT NOT NULL,
  "group_id"   TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "role_id"    TEXT NOT NULL,
  "scheme_id"  TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "project_group_roles_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX IF NOT EXISTS "user_groups_name_key" ON "user_groups"("name");
CREATE INDEX        IF NOT EXISTS "user_groups_name_idx" ON "user_groups"("name");
CREATE INDEX        IF NOT EXISTS "user_group_members_user_id_idx" ON "user_group_members"("user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "project_group_roles_group_id_project_id_key" ON "project_group_roles"("group_id", "project_id");
CREATE INDEX        IF NOT EXISTS "project_group_roles_project_id_idx"          ON "project_group_roles"("project_id");
CREATE INDEX        IF NOT EXISTS "project_group_roles_group_id_idx"            ON "project_group_roles"("group_id");

-- Foreign keys (idempotent via DO-block + lookup pg_constraint).
DO $$ BEGIN
  ALTER TABLE "user_group_members"
    ADD CONSTRAINT "user_group_members_group_id_fkey"
    FOREIGN KEY ("group_id") REFERENCES "user_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "user_group_members"
    ADD CONSTRAINT "user_group_members_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "user_group_members"
    ADD CONSTRAINT "user_group_members_added_by_id_fkey"
    FOREIGN KEY ("added_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "project_group_roles"
    ADD CONSTRAINT "project_group_roles_group_id_fkey"
    FOREIGN KEY ("group_id") REFERENCES "user_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "project_group_roles"
    ADD CONSTRAINT "project_group_roles_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Composite FK: (role_id, scheme_id) → project_role_definitions(id, scheme_id).
-- Restrict — нельзя удалять роль, на которой есть активные bindings (защита прав доступа).
DO $$ BEGIN
  ALTER TABLE "project_group_roles"
    ADD CONSTRAINT "project_group_roles_role_id_scheme_id_fkey"
    FOREIGN KEY ("role_id", "scheme_id")
    REFERENCES "project_role_definitions"("id", "scheme_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ШАГ 3: BACKFILL гранулярных permissions. ВЫПОЛНЯЕТСЯ ПЕРЕД созданием Legacy-групп (риск #11).
-- Все роли, у которых granted=true по *_MANAGE, получают соответствующие CRUD/DELETE_OTHERS.

-- SPRINTS_MANAGE → SPRINTS_CREATE + SPRINTS_EDIT + SPRINTS_DELETE
INSERT INTO "project_role_permissions" ("id", "role_id", "permission", "granted")
SELECT gen_random_uuid(), src.role_id, new_perm, true
FROM (
  SELECT DISTINCT role_id FROM "project_role_permissions"
  WHERE permission = 'SPRINTS_MANAGE' AND granted = true
) src
CROSS JOIN (VALUES
  ('SPRINTS_CREATE'::"ProjectPermission"),
  ('SPRINTS_EDIT'::"ProjectPermission"),
  ('SPRINTS_DELETE'::"ProjectPermission")
) AS new_permissions(new_perm)
ON CONFLICT ("role_id", "permission") DO NOTHING;

-- RELEASES_MANAGE → RELEASES_CREATE + RELEASES_EDIT + RELEASES_DELETE
INSERT INTO "project_role_permissions" ("id", "role_id", "permission", "granted")
SELECT gen_random_uuid(), src.role_id, new_perm, true
FROM (
  SELECT DISTINCT role_id FROM "project_role_permissions"
  WHERE permission = 'RELEASES_MANAGE' AND granted = true
) src
CROSS JOIN (VALUES
  ('RELEASES_CREATE'::"ProjectPermission"),
  ('RELEASES_EDIT'::"ProjectPermission"),
  ('RELEASES_DELETE'::"ProjectPermission")
) AS new_permissions(new_perm)
ON CONFLICT ("role_id", "permission") DO NOTHING;

-- COMMENTS_MANAGE → + COMMENTS_DELETE_OTHERS
INSERT INTO "project_role_permissions" ("id", "role_id", "permission", "granted")
SELECT gen_random_uuid(), role_id, 'COMMENTS_DELETE_OTHERS'::"ProjectPermission", true
FROM "project_role_permissions"
WHERE permission = 'COMMENTS_MANAGE' AND granted = true
ON CONFLICT ("role_id", "permission") DO NOTHING;

-- TIME_LOGS_MANAGE → + TIME_LOGS_DELETE_OTHERS
INSERT INTO "project_role_permissions" ("id", "role_id", "permission", "granted")
SELECT gen_random_uuid(), role_id, 'TIME_LOGS_DELETE_OTHERS'::"ProjectPermission", true
FROM "project_role_permissions"
WHERE permission = 'TIME_LOGS_MANAGE' AND granted = true
ON CONFLICT ("role_id", "permission") DO NOTHING;

-- USER_GROUP_* — выдаём ADMIN-ролям всех схем (detect ADMIN по key='ADMIN' AND is_system=true).
INSERT INTO "project_role_permissions" ("id", "role_id", "permission", "granted")
SELECT gen_random_uuid(), rd.id, new_perm, true
FROM "project_role_definitions" rd
CROSS JOIN (VALUES
  ('USER_GROUP_VIEW'::"ProjectPermission"),
  ('USER_GROUP_MANAGE'::"ProjectPermission")
) AS new_permissions(new_perm)
WHERE rd.key = 'ADMIN' AND rd.is_system = true
ON CONFLICT ("role_id", "permission") DO NOTHING;

-- ШАГ 4: LEGACY-ГРУППЫ из существующих UserProjectRole.
-- Для каждой уникальной (project_id, role_id) → UserGroup "Legacy: {project.key} — {role.name}".
-- Только строки с role_id IS NOT NULL: в TTMP-159 роль могла быть nullable на переходный период.

-- 4.1: создать группы.
INSERT INTO "user_groups" (id, name, description, created_at, updated_at)
SELECT
  gen_random_uuid(),
  'Legacy: ' || p.key || ' — ' || rd.name,
  'Auto-created from direct UserProjectRole migration (TTSEC-2)',
  NOW(), NOW()
FROM (
  SELECT DISTINCT upr.project_id, upr.role_id, upr.scheme_id
  FROM "user_project_roles" upr
  WHERE upr.role_id IS NOT NULL AND upr.scheme_id IS NOT NULL
) distinct_roles
JOIN "projects" p ON p.id = distinct_roles.project_id
JOIN "project_role_definitions" rd ON rd.id = distinct_roles.role_id
ON CONFLICT ("name") DO NOTHING;

-- 4.2: связать каждую Legacy-группу с (project, role) через ProjectGroupRole.
INSERT INTO "project_group_roles" (id, group_id, project_id, role_id, scheme_id, created_at)
SELECT
  gen_random_uuid(),
  ug.id,
  distinct_roles.project_id,
  distinct_roles.role_id,
  distinct_roles.scheme_id,
  NOW()
FROM (
  SELECT DISTINCT upr.project_id, upr.role_id, upr.scheme_id
  FROM "user_project_roles" upr
  WHERE upr.role_id IS NOT NULL AND upr.scheme_id IS NOT NULL
) distinct_roles
JOIN "projects" p ON p.id = distinct_roles.project_id
JOIN "project_role_definitions" rd ON rd.id = distinct_roles.role_id
JOIN "user_groups" ug ON ug.name = 'Legacy: ' || p.key || ' — ' || rd.name
ON CONFLICT ("group_id", "project_id") DO NOTHING;

-- 4.3: перенести членство.
INSERT INTO "user_group_members" (group_id, user_id, added_at)
SELECT ug.id, upr.user_id, NOW()
FROM "user_project_roles" upr
JOIN "projects" p ON p.id = upr.project_id
JOIN "project_role_definitions" rd ON rd.id = upr.role_id
JOIN "user_groups" ug ON ug.name = 'Legacy: ' || p.key || ' — ' || rd.name
WHERE upr.role_id IS NOT NULL AND upr.scheme_id IS NOT NULL
ON CONFLICT ("group_id", "user_id") DO NOTHING;

-- ШАГ 5: NB. DIRECT UserProjectRole остаются в таблице — удаление произойдёт в TTSEC-18
-- (feature-flag DIRECT_ROLES_DISABLED + cutover). До этого прямые права работают параллельно с
-- групповыми; эффективная роль = MAX(permissions) по обеим сторонам (см. §5.2).
