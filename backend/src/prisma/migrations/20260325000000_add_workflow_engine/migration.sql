-- CreateEnum
CREATE TYPE "StatusCategory" AS ENUM ('TODO', 'IN_PROGRESS', 'DONE');

-- CreateTable
CREATE TABLE "workflow_statuses" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" "StatusCategory" NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#9E9E9E',
    "icon_name" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "system_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_statuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflows" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_steps" (
    "id" TEXT NOT NULL,
    "workflow_id" TEXT NOT NULL,
    "status_id" TEXT NOT NULL,
    "is_initial" BOOLEAN NOT NULL DEFAULT false,
    "order_index" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "workflow_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_transitions" (
    "id" TEXT NOT NULL,
    "workflow_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "from_status_id" TEXT,
    "to_status_id" TEXT NOT NULL,
    "is_global" BOOLEAN NOT NULL DEFAULT false,
    "order_index" INTEGER NOT NULL DEFAULT 0,
    "conditions" JSONB,
    "validators" JSONB,
    "post_functions" JSONB,
    "screen_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_transitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transition_screens" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transition_screens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transition_screen_items" (
    "id" TEXT NOT NULL,
    "screen_id" TEXT NOT NULL,
    "custom_field_id" TEXT NOT NULL,
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "order_index" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "transition_screen_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_schemes" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_schemes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_scheme_items" (
    "id" TEXT NOT NULL,
    "scheme_id" TEXT NOT NULL,
    "workflow_id" TEXT NOT NULL,
    "issue_type_config_id" TEXT,

    CONSTRAINT "workflow_scheme_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_scheme_projects" (
    "id" TEXT NOT NULL,
    "scheme_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_scheme_projects_pkey" PRIMARY KEY ("id")
);

-- Add workflow_status_id to issues
ALTER TABLE "issues" ADD COLUMN "workflow_status_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "workflow_statuses_system_key_key" ON "workflow_statuses"("system_key");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_steps_workflow_id_status_id_key" ON "workflow_steps"("workflow_id", "status_id");

-- CreateIndex
CREATE INDEX "workflow_transitions_workflow_id_idx" ON "workflow_transitions"("workflow_id");

-- CreateIndex
CREATE INDEX "workflow_transitions_from_status_id_idx" ON "workflow_transitions"("from_status_id");

-- CreateIndex
CREATE UNIQUE INDEX "transition_screen_items_screen_id_custom_field_id_key" ON "transition_screen_items"("screen_id", "custom_field_id");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_scheme_items_scheme_id_issue_type_config_id_key" ON "workflow_scheme_items"("scheme_id", "issue_type_config_id");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_scheme_projects_project_id_key" ON "workflow_scheme_projects"("project_id");

-- CreateIndex
CREATE INDEX "workflow_scheme_projects_scheme_id_idx" ON "workflow_scheme_projects"("scheme_id");

-- AddForeignKey
ALTER TABLE "workflow_steps" ADD CONSTRAINT "workflow_steps_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_steps" ADD CONSTRAINT "workflow_steps_status_id_fkey" FOREIGN KEY ("status_id") REFERENCES "workflow_statuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_transitions" ADD CONSTRAINT "workflow_transitions_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_transitions" ADD CONSTRAINT "workflow_transitions_from_status_id_fkey" FOREIGN KEY ("from_status_id") REFERENCES "workflow_statuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_transitions" ADD CONSTRAINT "workflow_transitions_to_status_id_fkey" FOREIGN KEY ("to_status_id") REFERENCES "workflow_statuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_transitions" ADD CONSTRAINT "workflow_transitions_screen_id_fkey" FOREIGN KEY ("screen_id") REFERENCES "transition_screens"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transition_screen_items" ADD CONSTRAINT "transition_screen_items_screen_id_fkey" FOREIGN KEY ("screen_id") REFERENCES "transition_screens"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transition_screen_items" ADD CONSTRAINT "transition_screen_items_custom_field_id_fkey" FOREIGN KEY ("custom_field_id") REFERENCES "custom_fields"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_scheme_items" ADD CONSTRAINT "workflow_scheme_items_scheme_id_fkey" FOREIGN KEY ("scheme_id") REFERENCES "workflow_schemes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_scheme_items" ADD CONSTRAINT "workflow_scheme_items_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_scheme_items" ADD CONSTRAINT "workflow_scheme_items_issue_type_config_id_fkey" FOREIGN KEY ("issue_type_config_id") REFERENCES "issue_type_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_scheme_projects" ADD CONSTRAINT "workflow_scheme_projects_scheme_id_fkey" FOREIGN KEY ("scheme_id") REFERENCES "workflow_schemes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_scheme_projects" ADD CONSTRAINT "workflow_scheme_projects_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issues" ADD CONSTRAINT "issues_workflow_status_id_fkey" FOREIGN KEY ("workflow_status_id") REFERENCES "workflow_statuses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
