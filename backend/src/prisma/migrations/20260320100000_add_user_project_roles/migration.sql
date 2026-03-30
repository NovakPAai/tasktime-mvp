-- CreateEnum
CREATE TYPE "ProjectRole" AS ENUM ('ADMIN', 'MANAGER', 'USER', 'VIEWER');

-- AlterTable
ALTER TABLE "users" ADD COLUMN "must_change_password" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "user_project_roles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "role" "ProjectRole" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_project_roles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_project_roles_user_id_idx" ON "user_project_roles"("user_id");

-- CreateIndex
CREATE INDEX "user_project_roles_project_id_idx" ON "user_project_roles"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_project_roles_user_id_project_id_role_key" ON "user_project_roles"("user_id", "project_id", "role");

-- AddForeignKey
ALTER TABLE "user_project_roles" ADD CONSTRAINT "user_project_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_project_roles" ADD CONSTRAINT "user_project_roles_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
