-- ============================================================
-- TTADM-62: Default workflow init + production data migration
-- ============================================================
-- Цель: создать дефолтный workflow и привязать существующие
--       issues к динамическим статусам (enum → WorkflowStatus).
--
-- Эта миграция идемпотентна — безопасна для повторного запуска.
-- Предыдущая миграция 20260325010000 была no-op, т.к. запускалась
-- до появления данных в workflow_statuses. Данная миграция
-- устраняет проблему: сначала создаёт данные, затем делает backfill.
-- ============================================================

-- ------------------------------------------------------------
-- 1. System WorkflowStatuses (5 статусов = enum IssueStatus)
-- ------------------------------------------------------------
INSERT INTO "workflow_statuses" ("id", "name", "category", "color", "icon_name", "is_system", "system_key", "created_at", "updated_at")
VALUES
  (gen_random_uuid()::text, 'Open',        'TODO',        '#2196F3', 'circle-outline', true, 'OPEN',        NOW(), NOW()),
  (gen_random_uuid()::text, 'In Progress', 'IN_PROGRESS', '#FF9800', 'progress-clock', true, 'IN_PROGRESS', NOW(), NOW()),
  (gen_random_uuid()::text, 'Review',      'IN_PROGRESS', '#9C27B0', 'eye-outline',    true, 'REVIEW',      NOW(), NOW()),
  (gen_random_uuid()::text, 'Done',        'DONE',        '#4CAF50', 'check-circle',   true, 'DONE',        NOW(), NOW()),
  (gen_random_uuid()::text, 'Cancelled',   'DONE',        '#9E9E9E', 'cancel',         true, 'CANCELLED',   NOW(), NOW())
ON CONFLICT ("system_key") DO NOTHING;

-- ------------------------------------------------------------
-- 2. Default Workflow
-- ------------------------------------------------------------
INSERT INTO "workflows" ("id", "name", "description", "is_default", "is_system", "created_at", "updated_at")
VALUES (
  'default-workflow',
  'Default Workflow',
  'System default workflow with all standard statuses',
  true,
  true,
  NOW(),
  NOW()
)
ON CONFLICT ("id") DO NOTHING;

-- ------------------------------------------------------------
-- 3. WorkflowSteps (OPEN — initial, остальные по порядку)
-- ------------------------------------------------------------
INSERT INTO "workflow_steps" ("id", "workflow_id", "status_id", "is_initial", "order_index")
SELECT
  gen_random_uuid()::text,
  'default-workflow',
  ws.id,
  CASE ws.system_key WHEN 'OPEN' THEN true ELSE false END,
  CASE ws.system_key
    WHEN 'OPEN'        THEN 0
    WHEN 'IN_PROGRESS' THEN 1
    WHEN 'REVIEW'      THEN 2
    WHEN 'DONE'        THEN 3
    WHEN 'CANCELLED'   THEN 4
  END
FROM "workflow_statuses" ws
WHERE ws.system_key IN ('OPEN', 'IN_PROGRESS', 'REVIEW', 'DONE', 'CANCELLED')
ON CONFLICT ("workflow_id", "status_id") DO NOTHING;

-- ------------------------------------------------------------
-- 4. WorkflowTransitions
--    Удаляем существующие для этого workflow и создаём заново
--    (ON CONFLICT не работает без уникального индекса на переходах)
-- ------------------------------------------------------------
DELETE FROM "workflow_transitions" WHERE "workflow_id" = 'default-workflow';

INSERT INTO "workflow_transitions" ("id", "workflow_id", "name", "from_status_id", "to_status_id", "is_global", "order_index", "created_at", "updated_at")
SELECT
  gen_random_uuid()::text,
  'default-workflow',
  t.name,
  from_ws.id,
  to_ws.id,
  t.is_global,
  t.order_index,
  NOW(),
  NOW()
FROM (VALUES
  ('Start',          'OPEN',        'IN_PROGRESS', false, 0),
  ('Send to Review', 'IN_PROGRESS', 'REVIEW',      false, 1),
  ('Approve',        'REVIEW',      'DONE',        false, 2),
  ('Complete',       'IN_PROGRESS', 'DONE',        false, 3),
  ('Reopen',         'DONE',        'OPEN',        false, 4),
  ('Reopen',         'CANCELLED',   'OPEN',        false, 5),
  ('Send Back',      'REVIEW',      'IN_PROGRESS', false, 7)
) AS t(name, from_key, to_key, is_global, order_index)
JOIN "workflow_statuses" from_ws ON from_ws.system_key = t.from_key
JOIN "workflow_statuses" to_ws   ON to_ws.system_key   = t.to_key;

-- Cancel (глобальный переход: from = NULL → CANCELLED)
INSERT INTO "workflow_transitions" ("id", "workflow_id", "name", "from_status_id", "to_status_id", "is_global", "order_index", "created_at", "updated_at")
SELECT
  gen_random_uuid()::text,
  'default-workflow',
  'Cancel',
  NULL,
  ws.id,
  true,
  6,
  NOW(),
  NOW()
FROM "workflow_statuses" ws
WHERE ws.system_key = 'CANCELLED';

-- ------------------------------------------------------------
-- 5. Default WorkflowScheme
-- ------------------------------------------------------------
INSERT INTO "workflow_schemes" ("id", "name", "description", "is_default", "created_at", "updated_at")
VALUES (
  'default-scheme',
  'Default Workflow Scheme',
  'System default scheme mapping all issue types to the default workflow',
  true,
  NOW(),
  NOW()
)
ON CONFLICT ("id") DO NOTHING;

-- Default scheme item: issueTypeConfigId = NULL → применяется ко всем типам
INSERT INTO "workflow_scheme_items" ("id", "scheme_id", "workflow_id", "issue_type_config_id")
SELECT gen_random_uuid()::text, 'default-scheme', 'default-workflow', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM "workflow_scheme_items"
  WHERE "scheme_id" = 'default-scheme' AND "issue_type_config_id" IS NULL
);

-- ------------------------------------------------------------
-- 6. Привязать все существующие проекты к default scheme
-- ------------------------------------------------------------
INSERT INTO "workflow_scheme_projects" ("id", "scheme_id", "project_id", "created_at")
SELECT gen_random_uuid()::text, 'default-scheme', p.id, NOW()
FROM "projects" p
ON CONFLICT ("project_id") DO NOTHING;

-- ------------------------------------------------------------
-- 7. Backfill: issues.workflow_status_id по enum status
--    Идемпотентен: обновляет только записи с NULL
-- ------------------------------------------------------------
UPDATE "issues" i
SET "workflow_status_id" = ws.id
FROM "workflow_statuses" ws
WHERE ws.system_key = i.status::text
  AND i.workflow_status_id IS NULL;
