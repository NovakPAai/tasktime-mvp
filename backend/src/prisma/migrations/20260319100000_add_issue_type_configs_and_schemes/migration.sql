-- CreateTable: IssueTypeConfig
CREATE TABLE "issue_type_configs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "icon_name" TEXT NOT NULL,
    "icon_color" TEXT NOT NULL,
    "is_subtask" BOOLEAN NOT NULL DEFAULT false,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "system_key" TEXT,
    "order_index" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "issue_type_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable: IssueTypeScheme
CREATE TABLE "issue_type_schemes" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "issue_type_schemes_pkey" PRIMARY KEY ("id")
);

-- CreateTable: IssueTypeSchemeItem
CREATE TABLE "issue_type_scheme_items" (
    "id" TEXT NOT NULL,
    "scheme_id" TEXT NOT NULL,
    "type_config_id" TEXT NOT NULL,
    "order_index" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "issue_type_scheme_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable: IssueTypeSchemeProject
CREATE TABLE "issue_type_scheme_projects" (
    "id" TEXT NOT NULL,
    "scheme_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "issue_type_scheme_projects_pkey" PRIMARY KEY ("id")
);

-- AlterTable: Issue — make type nullable, add issueTypeConfigId
ALTER TABLE "issues" ALTER COLUMN "type" DROP NOT NULL;
ALTER TABLE "issues" ADD COLUMN "issue_type_config_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "issue_type_configs_system_key_key" ON "issue_type_configs"("system_key");
CREATE UNIQUE INDEX "issue_type_scheme_items_scheme_id_type_config_id_key" ON "issue_type_scheme_items"("scheme_id", "type_config_id");
CREATE INDEX "issue_type_scheme_items_scheme_id_idx" ON "issue_type_scheme_items"("scheme_id");
CREATE UNIQUE INDEX "issue_type_scheme_projects_project_id_key" ON "issue_type_scheme_projects"("project_id");
CREATE INDEX "issue_type_scheme_projects_scheme_id_idx" ON "issue_type_scheme_projects"("scheme_id");
CREATE INDEX "issues_issue_type_config_id_idx" ON "issues"("issue_type_config_id");

-- AddForeignKey
ALTER TABLE "issue_type_scheme_items" ADD CONSTRAINT "issue_type_scheme_items_scheme_id_fkey" FOREIGN KEY ("scheme_id") REFERENCES "issue_type_schemes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "issue_type_scheme_items" ADD CONSTRAINT "issue_type_scheme_items_type_config_id_fkey" FOREIGN KEY ("type_config_id") REFERENCES "issue_type_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "issue_type_scheme_projects" ADD CONSTRAINT "issue_type_scheme_projects_scheme_id_fkey" FOREIGN KEY ("scheme_id") REFERENCES "issue_type_schemes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "issue_type_scheme_projects" ADD CONSTRAINT "issue_type_scheme_projects_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "issues" ADD CONSTRAINT "issues_issue_type_config_id_fkey" FOREIGN KEY ("issue_type_config_id") REFERENCES "issue_type_configs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
