-- Seed system issue type configs (idempotent: ON CONFLICT DO NOTHING)
INSERT INTO "issue_type_configs" ("id", "name", "icon_name", "icon_color", "is_subtask", "is_enabled", "is_system", "system_key", "order_index", "created_at", "updated_at")
VALUES
  (gen_random_uuid()::text, 'Epic',    'ThunderboltOutlined', '#722ED1', false, true, true, 'EPIC',    0, NOW(), NOW()),
  (gen_random_uuid()::text, 'Story',   'BookOutlined',        '#1677FF', false, true, true, 'STORY',   1, NOW(), NOW()),
  (gen_random_uuid()::text, 'Task',    'CheckSquareOutlined', '#52C41A', false, true, true, 'TASK',    2, NOW(), NOW()),
  (gen_random_uuid()::text, 'Bug',     'BugOutlined',         '#F5222D', false, true, true, 'BUG',     3, NOW(), NOW()),
  (gen_random_uuid()::text, 'Subtask', 'MinusSquareOutlined', '#8C8C8C', true,  true, true, 'SUBTASK', 4, NOW(), NOW())
ON CONFLICT ("system_key") DO NOTHING;

-- Seed default issue type scheme (idempotent)
INSERT INTO "issue_type_schemes" ("id", "name", "description", "is_default", "created_at", "updated_at")
VALUES ('default-issue-type-scheme', 'Default Scheme', 'Стандартная схема типов задач', true, NOW(), NOW())
ON CONFLICT ("id") DO NOTHING;

-- Link all system types to default scheme (idempotent, no timestamps on scheme_items)
INSERT INTO "issue_type_scheme_items" ("id", "scheme_id", "type_config_id", "order_index")
SELECT gen_random_uuid()::text, 'default-issue-type-scheme', c.id, c.order_index
FROM "issue_type_configs" c
WHERE c.system_key IN ('EPIC', 'STORY', 'TASK', 'BUG', 'SUBTASK')
ON CONFLICT ("scheme_id", "type_config_id") DO NOTHING;

-- Assign all existing projects to default scheme (idempotent)
INSERT INTO "issue_type_scheme_projects" ("id", "scheme_id", "project_id", "created_at")
SELECT gen_random_uuid()::text, 'default-issue-type-scheme', p.id, NOW()
FROM "projects" p
ON CONFLICT ("project_id") DO NOTHING;

-- Backfill issueTypeConfigId on existing issues (by type enum)
UPDATE "issues" SET "issue_type_config_id" = c.id
FROM "issue_type_configs" c
WHERE "issues"."type"::text = c.system_key
  AND "issues"."issue_type_config_id" IS NULL
  AND c.system_key IS NOT NULL;
