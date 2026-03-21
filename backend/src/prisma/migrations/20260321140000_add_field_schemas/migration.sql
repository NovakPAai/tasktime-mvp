-- CreateEnum
CREATE TYPE "FieldSchemaStatus" AS ENUM ('DRAFT', 'ACTIVE');

-- CreateEnum
CREATE TYPE "FieldScopeType" AS ENUM ('GLOBAL', 'PROJECT', 'ISSUE_TYPE', 'PROJECT_ISSUE_TYPE');

-- CreateTable
CREATE TABLE "field_schemas" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "FieldSchemaStatus" NOT NULL DEFAULT 'DRAFT',
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "copied_from_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "field_schemas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_schema_items" (
    "id" TEXT NOT NULL,
    "schema_id" TEXT NOT NULL,
    "custom_field_id" TEXT NOT NULL,
    "order_index" INTEGER NOT NULL DEFAULT 0,
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "show_on_kanban" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "field_schema_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_schema_bindings" (
    "id" TEXT NOT NULL,
    "schema_id" TEXT NOT NULL,
    "scope_type" "FieldScopeType" NOT NULL,
    "project_id" TEXT,
    "issue_type_config_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "field_schema_bindings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "field_schema_items_schema_id_idx" ON "field_schema_items"("schema_id");

-- CreateIndex
CREATE UNIQUE INDEX "field_schema_items_schema_id_custom_field_id_key" ON "field_schema_items"("schema_id", "custom_field_id");

-- CreateIndex
CREATE INDEX "field_schema_bindings_schema_id_idx" ON "field_schema_bindings"("schema_id");

-- CreateIndex
CREATE INDEX "field_schema_bindings_project_id_idx" ON "field_schema_bindings"("project_id");

-- CreateIndex
CREATE INDEX "field_schema_bindings_issue_type_config_id_idx" ON "field_schema_bindings"("issue_type_config_id");

-- CreateIndex
CREATE UNIQUE INDEX "field_schema_bindings_schema_id_scope_type_project_id_issue_type_config_id_key"
    ON "field_schema_bindings"("schema_id", "scope_type", "project_id", "issue_type_config_id");

-- AddForeignKey
ALTER TABLE "field_schemas" ADD CONSTRAINT "field_schemas_copied_from_id_fkey"
    FOREIGN KEY ("copied_from_id") REFERENCES "field_schemas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_schema_items" ADD CONSTRAINT "field_schema_items_schema_id_fkey"
    FOREIGN KEY ("schema_id") REFERENCES "field_schemas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_schema_items" ADD CONSTRAINT "field_schema_items_custom_field_id_fkey"
    FOREIGN KEY ("custom_field_id") REFERENCES "custom_fields"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_schema_bindings" ADD CONSTRAINT "field_schema_bindings_schema_id_fkey"
    FOREIGN KEY ("schema_id") REFERENCES "field_schemas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_schema_bindings" ADD CONSTRAINT "field_schema_bindings_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_schema_bindings" ADD CONSTRAINT "field_schema_bindings_issue_type_config_id_fkey"
    FOREIGN KEY ("issue_type_config_id") REFERENCES "issue_type_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
