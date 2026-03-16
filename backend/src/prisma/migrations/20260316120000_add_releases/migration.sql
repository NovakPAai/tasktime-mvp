-- CreateEnum
CREATE TYPE "ReleaseLevel" AS ENUM ('MINOR', 'MAJOR');

-- CreateEnum
CREATE TYPE "ReleaseState" AS ENUM ('DRAFT', 'READY', 'RELEASED');

-- CreateTable
CREATE TABLE "releases" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "level" "ReleaseLevel" NOT NULL DEFAULT 'MINOR',
    "state" "ReleaseState" NOT NULL DEFAULT 'DRAFT',
    "release_date" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "releases_pkey" PRIMARY KEY ("id")
);

-- Add release_id to issues
ALTER TABLE "issues" ADD COLUMN "release_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "releases_project_id_name_key" ON "releases"("project_id", "name");

-- CreateIndex
CREATE INDEX "releases_project_id_idx" ON "releases"("project_id");

-- CreateIndex
CREATE INDEX "releases_project_id_state_idx" ON "releases"("project_id", "state");

-- CreateIndex
CREATE INDEX "issues_release_id_idx" ON "issues"("release_id");

-- AddForeignKey
ALTER TABLE "releases" ADD CONSTRAINT "releases_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issues" ADD CONSTRAINT "issues_release_id_fkey" FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE SET NULL ON UPDATE CASCADE;
