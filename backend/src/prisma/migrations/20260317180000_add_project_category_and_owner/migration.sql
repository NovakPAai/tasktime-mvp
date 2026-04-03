-- CreateTable: project_categories
CREATE TABLE "project_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: unique name
CREATE UNIQUE INDEX "project_categories_name_key" ON "project_categories"("name");

-- AlterTable: add owner_id and category_id to projects
ALTER TABLE "projects" ADD COLUMN "owner_id" TEXT;
ALTER TABLE "projects" ADD COLUMN "category_id" TEXT;

-- AddForeignKey: projects.owner_id -> users.id
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_id_fkey"
    FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: projects.category_id -> project_categories.id
ALTER TABLE "projects" ADD CONSTRAINT "projects_category_id_fkey"
    FOREIGN KEY ("category_id") REFERENCES "project_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
