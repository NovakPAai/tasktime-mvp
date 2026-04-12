-- RM-01.1: Add new enums
CREATE TYPE "ReleaseType" AS ENUM ('ATOMIC', 'INTEGRATION');
CREATE TYPE "ReleaseStatusCategory" AS ENUM ('PLANNING', 'IN_PROGRESS', 'DONE', 'CANCELLED');

-- RM-01.4: Add RELEASE_MANAGER to UserRole
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'RELEASE_MANAGER';

-- RM-01.1: Create ReleaseStatus table
CREATE TABLE "release_statuses" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "ReleaseStatusCategory" NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#888888',
    "description" TEXT,
    "order_index" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "release_statuses_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "release_statuses_name_key" ON "release_statuses"("name");
CREATE INDEX "release_statuses_category_idx" ON "release_statuses"("category");

-- RM-01.1: Create ReleaseWorkflow table
CREATE TABLE "release_workflows" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "release_type" "ReleaseType",
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "release_workflows_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "release_workflows_name_key" ON "release_workflows"("name");

-- RM-01.1: Create ReleaseWorkflowStep table
CREATE TABLE "release_workflow_steps" (
    "id" TEXT NOT NULL,
    "workflow_id" TEXT NOT NULL,
    "status_id" TEXT NOT NULL,
    "is_initial" BOOLEAN NOT NULL DEFAULT false,
    "order_index" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "release_workflow_steps_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "release_workflow_steps_workflow_id_status_id_key" ON "release_workflow_steps"("workflow_id", "status_id");

ALTER TABLE "release_workflow_steps" ADD CONSTRAINT "release_workflow_steps_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "release_workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "release_workflow_steps" ADD CONSTRAINT "release_workflow_steps_status_id_fkey" FOREIGN KEY ("status_id") REFERENCES "release_statuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RM-01.1: Create ReleaseWorkflowTransition table
CREATE TABLE "release_workflow_transitions" (
    "id" TEXT NOT NULL,
    "workflow_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "from_status_id" TEXT NOT NULL,
    "to_status_id" TEXT NOT NULL,
    "conditions" JSONB,
    "is_global" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "release_workflow_transitions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "release_workflow_transitions_workflow_id_idx" ON "release_workflow_transitions"("workflow_id");

ALTER TABLE "release_workflow_transitions" ADD CONSTRAINT "release_workflow_transitions_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "release_workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "release_workflow_transitions" ADD CONSTRAINT "release_workflow_transitions_from_status_id_fkey" FOREIGN KEY ("from_status_id") REFERENCES "release_statuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "release_workflow_transitions" ADD CONSTRAINT "release_workflow_transitions_to_status_id_fkey" FOREIGN KEY ("to_status_id") REFERENCES "release_statuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RM-01.2: Create ReleaseItem table
CREATE TABLE "release_items" (
    "id" TEXT NOT NULL,
    "release_id" TEXT NOT NULL,
    "issue_id" TEXT NOT NULL,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "added_by_id" TEXT NOT NULL,

    CONSTRAINT "release_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "release_items_release_id_issue_id_key" ON "release_items"("release_id", "issue_id");
CREATE INDEX "release_items_release_id_idx" ON "release_items"("release_id");
CREATE INDEX "release_items_issue_id_idx" ON "release_items"("issue_id");

ALTER TABLE "release_items" ADD CONSTRAINT "release_items_release_id_fkey" FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "release_items" ADD CONSTRAINT "release_items_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "release_items" ADD CONSTRAINT "release_items_added_by_id_fkey" FOREIGN KEY ("added_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RM-01.3: Modify Release table
-- Add new columns (nullable first for existing data)
ALTER TABLE "releases" ADD COLUMN "type" "ReleaseType" NOT NULL DEFAULT 'ATOMIC';
ALTER TABLE "releases" ADD COLUMN "status_id" TEXT;
ALTER TABLE "releases" ADD COLUMN "workflow_id" TEXT;
ALTER TABLE "releases" ADD COLUMN "planned_date" DATE;
ALTER TABLE "releases" ADD COLUMN "created_by_id" TEXT;

-- Make projectId nullable
ALTER TABLE "releases" ALTER COLUMN "project_id" DROP NOT NULL;

-- Add indexes
CREATE INDEX "releases_status_id_idx" ON "releases"("status_id");
CREATE INDEX "releases_type_idx" ON "releases"("type");
CREATE INDEX "releases_workflow_id_idx" ON "releases"("workflow_id");

-- Add foreign keys
ALTER TABLE "releases" ADD CONSTRAINT "releases_status_id_fkey" FOREIGN KEY ("status_id") REFERENCES "release_statuses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "releases" ADD CONSTRAINT "releases_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "release_workflows"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "releases" ADD CONSTRAINT "releases_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Drop old index on (projectId, state) since state is being deprecated
DROP INDEX IF EXISTS "releases_project_id_state_idx";

-- RM-01.5: Seed default release statuses
INSERT INTO "release_statuses" ("id", "name", "category", "color", "description", "order_index", "updated_at") VALUES
  ('rs-draft',    'Черновик',          'PLANNING',    '#8C8C8C', 'Начальный статус. Сбор задач в релиз.',                  0, NOW()),
  ('rs-building', 'В сборке',          'IN_PROGRESS', '#1890FF', 'Идёт сборка и интеграция компонентов.',                  1, NOW()),
  ('rs-testing',  'На тестировании',   'IN_PROGRESS', '#FA8C16', 'Релиз передан на QA/тестирование.',                      2, NOW()),
  ('rs-ready',    'Готов к выпуску',    'IN_PROGRESS', '#52C41A', 'Тестирование пройдено, ожидает развёртывания.',           3, NOW()),
  ('rs-released', 'Выпущен',           'DONE',        '#389E0D', 'Релиз развёрнут в production.',                           4, NOW()),
  ('rs-cancelled','Отменён',           'CANCELLED',   '#FF4D4F', 'Релиз отменён.',                                         5, NOW())
ON CONFLICT ("name") DO NOTHING;

-- RM-01.5: Seed default release workflow
INSERT INTO "release_workflows" ("id", "name", "description", "release_type", "is_default", "is_active", "updated_at") VALUES
  ('rw-default', 'Стандартный релизный процесс', 'Дефолтный workflow: Черновик → В сборке → На тестировании → Готов к выпуску → Выпущен', NULL, true, true, NOW())
ON CONFLICT ("name") DO NOTHING;

-- RM-01.5: Seed workflow steps
INSERT INTO "release_workflow_steps" ("id", "workflow_id", "status_id", "is_initial", "order_index") VALUES
  ('rws-1', 'rw-default', 'rs-draft',     true,  0),
  ('rws-2', 'rw-default', 'rs-building',  false, 1),
  ('rws-3', 'rw-default', 'rs-testing',   false, 2),
  ('rws-4', 'rw-default', 'rs-ready',     false, 3),
  ('rws-5', 'rw-default', 'rs-released',  false, 4),
  ('rws-6', 'rw-default', 'rs-cancelled', false, 5)
ON CONFLICT ("workflow_id", "status_id") DO NOTHING;

-- RM-01.5: Seed workflow transitions
INSERT INTO "release_workflow_transitions" ("id", "workflow_id", "name", "from_status_id", "to_status_id", "conditions", "is_global") VALUES
  ('rwt-1', 'rw-default', 'Начать сборку',                'rs-draft',    'rs-building',  NULL, false),
  ('rwt-2', 'rw-default', 'Отправить на тестирование',    'rs-building', 'rs-testing',   NULL, false),
  ('rwt-3', 'rw-default', 'Тесты пройдены',               'rs-testing',  'rs-ready',     NULL, false),
  ('rwt-4', 'rw-default', 'Выпустить',                    'rs-ready',    'rs-released',  NULL, false),
  ('rwt-5', 'rw-default', 'Экстренный выпуск',            'rs-building', 'rs-released',  NULL, false),
  ('rwt-6', 'rw-default', 'Отменить',                     'rs-draft',    'rs-cancelled', NULL, true)
ON CONFLICT DO NOTHING;

-- RM-01.6: Migrate existing releases (state → statusId, set workflow and type)
-- Map DRAFT → Черновик, READY → Готов к выпуску, RELEASED → Выпущен
UPDATE "releases" SET
  "status_id" = CASE "state"
    WHEN 'DRAFT'    THEN 'rs-draft'
    WHEN 'READY'    THEN 'rs-ready'
    WHEN 'RELEASED' THEN 'rs-released'
    ELSE 'rs-draft'
  END,
  "workflow_id" = 'rw-default',
  "type" = 'ATOMIC'
WHERE "status_id" IS NULL;

-- RM-01.6: Set createdById to first admin user as fallback for existing releases
UPDATE "releases" r SET "created_by_id" = (
  SELECT u."id" FROM "users" u WHERE u."role" = 'ADMIN' ORDER BY u."created_at" ASC LIMIT 1
)
WHERE r."created_by_id" IS NULL;

-- RM-01.6: Migrate Issue.releaseId → ReleaseItem
INSERT INTO "release_items" ("id", "release_id", "issue_id", "added_at", "added_by_id")
SELECT
  gen_random_uuid()::text,
  i."release_id",
  i."id",
  i."created_at",
  COALESCE(i."assignee_id", i."creator_id")
FROM "issues" i
WHERE i."release_id" IS NOT NULL
ON CONFLICT ("release_id", "issue_id") DO NOTHING;
