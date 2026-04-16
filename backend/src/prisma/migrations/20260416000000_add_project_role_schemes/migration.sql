-- CreateEnum
CREATE TYPE "ProjectPermission" AS ENUM (
  'ISSUES_VIEW',
  'ISSUES_CREATE',
  'ISSUES_EDIT',
  'ISSUES_DELETE',
  'ISSUES_ASSIGN',
  'ISSUES_CHANGE_STATUS',
  'ISSUES_CHANGE_TYPE',
  'SPRINTS_VIEW',
  'SPRINTS_MANAGE',
  'RELEASES_VIEW',
  'RELEASES_MANAGE',
  'MEMBERS_VIEW',
  'MEMBERS_MANAGE',
  'TIME_LOGS_VIEW',
  'TIME_LOGS_CREATE',
  'TIME_LOGS_MANAGE',
  'COMMENTS_VIEW',
  'COMMENTS_CREATE',
  'COMMENTS_MANAGE',
  'PROJECT_SETTINGS_VIEW',
  'PROJECT_SETTINGS_EDIT',
  'BOARDS_VIEW',
  'BOARDS_MANAGE'
);

-- CreateTable
CREATE TABLE "project_role_schemes" (
  "id"          TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "description" TEXT,
  "is_default"  BOOLEAN NOT NULL DEFAULT false,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"  TIMESTAMP(3) NOT NULL,
  CONSTRAINT "project_role_schemes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_role_definitions" (
  "id"          TEXT NOT NULL,
  "scheme_id"   TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "key"         TEXT NOT NULL,
  "description" TEXT,
  "color"       TEXT,
  "is_system"   BOOLEAN NOT NULL DEFAULT false,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"  TIMESTAMP(3) NOT NULL,
  CONSTRAINT "project_role_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_role_permissions" (
  "id"         TEXT NOT NULL,
  "role_id"    TEXT NOT NULL,
  "permission" "ProjectPermission" NOT NULL,
  "granted"    BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "project_role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_role_scheme_projects" (
  "id"         TEXT NOT NULL,
  "scheme_id"  TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "project_role_scheme_projects_pkey" PRIMARY KEY ("id")
);

-- AlterTable: add nullable role_id to user_project_roles
ALTER TABLE "user_project_roles" ADD COLUMN "role_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "project_role_definitions_scheme_id_key_key"
  ON "project_role_definitions"("scheme_id", "key");

CREATE INDEX "project_role_definitions_scheme_id_idx"
  ON "project_role_definitions"("scheme_id");

CREATE UNIQUE INDEX "project_role_permissions_role_id_permission_key"
  ON "project_role_permissions"("role_id", "permission");

CREATE INDEX "project_role_permissions_role_id_idx"
  ON "project_role_permissions"("role_id");

CREATE UNIQUE INDEX "project_role_scheme_projects_project_id_key"
  ON "project_role_scheme_projects"("project_id");

CREATE INDEX "project_role_scheme_projects_scheme_id_idx"
  ON "project_role_scheme_projects"("scheme_id");

-- AddForeignKey
ALTER TABLE "project_role_definitions"
  ADD CONSTRAINT "project_role_definitions_scheme_id_fkey"
  FOREIGN KEY ("scheme_id") REFERENCES "project_role_schemes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "project_role_permissions"
  ADD CONSTRAINT "project_role_permissions_role_id_fkey"
  FOREIGN KEY ("role_id") REFERENCES "project_role_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "project_role_scheme_projects"
  ADD CONSTRAINT "project_role_scheme_projects_scheme_id_fkey"
  FOREIGN KEY ("scheme_id") REFERENCES "project_role_schemes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "project_role_scheme_projects"
  ADD CONSTRAINT "project_role_scheme_projects_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_project_roles"
  ADD CONSTRAINT "user_project_roles_role_id_fkey"
  FOREIGN KEY ("role_id") REFERENCES "project_role_definitions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
