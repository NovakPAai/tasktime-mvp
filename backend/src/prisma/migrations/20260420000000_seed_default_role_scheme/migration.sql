-- Seed the canonical default ProjectRoleScheme + its 4 system roles + permission matrix.
-- Runs on every environment (staging/prod) where previously only `prisma db seed` would have
-- populated these rows. Without this migration, createScheme (admin) throws 500 because it
-- clones system roles from the default scheme and there is no default to clone from.
--
-- Idempotent: ON CONFLICT DO NOTHING on every INSERT, so repeated runs and environments where
-- the seed already created the rows are both safe.

-- 1. Default scheme.
INSERT INTO "project_role_schemes" ("id", "name", "description", "is_default", "created_at", "updated_at")
VALUES ('00000000-0000-0000-0000-000000000001', 'Default', 'Схема доступа по умолчанию', true, NOW(), NOW())
ON CONFLICT ("id") DO NOTHING;

-- 2. System role definitions with deterministic IDs. ON CONFLICT keyed by (scheme_id, key) —
--    if the seed already created a row with a random UUID we leave it in place; only fresh
--    environments pick up these hardcoded IDs.
INSERT INTO "project_role_definitions" ("id", "scheme_id", "name", "key", "color", "is_system", "created_at", "updated_at") VALUES
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', 'Администратор', 'ADMIN',   '#fa8c16', true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000001', 'Менеджер',      'MANAGER', '#1677ff', true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000001', 'Участник',      'USER',    '#52c41a', true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000014', '00000000-0000-0000-0000-000000000001', 'Наблюдатель',   'VIEWER',  '#d9d9d9', true, NOW(), NOW())
ON CONFLICT ("scheme_id", "key") DO NOTHING;

-- 3. Permission matrix — granted=true rows only (absence = not granted).
--    Role IDs are resolved by (scheme_id, key) so this works whether the rows above were just
--    inserted OR already existed with different (seed-generated) IDs.
WITH roles AS (
  SELECT id, key
  FROM "project_role_definitions"
  WHERE scheme_id = '00000000-0000-0000-0000-000000000001' AND key IN ('ADMIN','MANAGER','USER','VIEWER')
),
permission_matrix AS (
  SELECT 'ADMIN'::text AS key, UNNEST(ARRAY[
    'ISSUES_VIEW','ISSUES_CREATE','ISSUES_EDIT','ISSUES_DELETE',
    'ISSUES_ASSIGN','ISSUES_CHANGE_STATUS','ISSUES_CHANGE_TYPE',
    'SPRINTS_VIEW','SPRINTS_MANAGE',
    'RELEASES_VIEW','RELEASES_MANAGE',
    'MEMBERS_VIEW','MEMBERS_MANAGE',
    'TIME_LOGS_VIEW','TIME_LOGS_CREATE','TIME_LOGS_MANAGE',
    'COMMENTS_VIEW','COMMENTS_CREATE','COMMENTS_MANAGE',
    'PROJECT_SETTINGS_VIEW','PROJECT_SETTINGS_EDIT',
    'BOARDS_VIEW','BOARDS_MANAGE'
  ]::"ProjectPermission"[]) AS permission
  UNION ALL
  SELECT 'MANAGER', UNNEST(ARRAY[
    'ISSUES_VIEW','ISSUES_CREATE','ISSUES_EDIT','ISSUES_DELETE',
    'ISSUES_ASSIGN','ISSUES_CHANGE_STATUS','ISSUES_CHANGE_TYPE',
    'SPRINTS_VIEW','SPRINTS_MANAGE',
    'RELEASES_VIEW','RELEASES_MANAGE',
    'MEMBERS_VIEW','MEMBERS_MANAGE',
    'TIME_LOGS_VIEW','TIME_LOGS_CREATE','TIME_LOGS_MANAGE',
    'COMMENTS_VIEW','COMMENTS_CREATE','COMMENTS_MANAGE',
    'PROJECT_SETTINGS_VIEW',
    'BOARDS_VIEW','BOARDS_MANAGE'
  ]::"ProjectPermission"[])
  UNION ALL
  SELECT 'USER', UNNEST(ARRAY[
    'ISSUES_VIEW','ISSUES_CREATE','ISSUES_EDIT',
    'ISSUES_CHANGE_STATUS',
    'SPRINTS_VIEW',
    'RELEASES_VIEW',
    'MEMBERS_VIEW',
    'TIME_LOGS_VIEW','TIME_LOGS_CREATE',
    'COMMENTS_VIEW','COMMENTS_CREATE',
    'PROJECT_SETTINGS_VIEW',
    'BOARDS_VIEW'
  ]::"ProjectPermission"[])
  UNION ALL
  SELECT 'VIEWER', UNNEST(ARRAY[
    'ISSUES_VIEW',
    'SPRINTS_VIEW',
    'RELEASES_VIEW',
    'MEMBERS_VIEW',
    'TIME_LOGS_VIEW',
    'COMMENTS_VIEW',
    'PROJECT_SETTINGS_VIEW',
    'BOARDS_VIEW'
  ]::"ProjectPermission"[])
)
INSERT INTO "project_role_permissions" ("id", "role_id", "permission", "granted")
SELECT gen_random_uuid(), r.id, pm.permission, true
FROM permission_matrix pm
JOIN roles r ON r.key = pm.key
ON CONFLICT ("role_id", "permission") DO NOTHING;
