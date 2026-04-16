-- Enforce at DB level that UserProjectRole.roleId belongs to the same ProjectRoleScheme
-- that is intended for the project. Done via denormalized scheme_id on user_project_roles
-- and a composite FK (role_id, scheme_id) -> project_role_definitions (id, scheme_id).

-- 1. Add scheme_id column (nullable; consistency with role_id enforced by CHECK below).
ALTER TABLE "user_project_roles" ADD COLUMN "scheme_id" TEXT;

-- 2. Backfill scheme_id for rows that already have role_id set.
UPDATE "user_project_roles" AS upr
SET "scheme_id" = prd."scheme_id"
FROM "project_role_definitions" AS prd
WHERE upr."role_id" = prd."id" AND upr."role_id" IS NOT NULL;

-- 3. Composite unique on project_role_definitions — required so (id, scheme_id) can serve as FK target.
ALTER TABLE "project_role_definitions"
  ADD CONSTRAINT "project_role_definitions_id_scheme_id_key" UNIQUE ("id", "scheme_id");

-- 4. Drop the existing single-column FK so we can replace it with the composite one.
ALTER TABLE "user_project_roles" DROP CONSTRAINT IF EXISTS "user_project_roles_role_id_fkey";

-- 5. Composite FK: (role_id, scheme_id) must match an existing (id, scheme_id) pair.
--    MATCH SIMPLE (default) means the FK is not checked when either column is NULL —
--    so rows with role_id=NULL remain valid during the phased roleId rollout.
ALTER TABLE "user_project_roles"
  ADD CONSTRAINT "user_project_roles_role_id_scheme_id_fkey"
  FOREIGN KEY ("role_id", "scheme_id")
  REFERENCES "project_role_definitions" ("id", "scheme_id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

-- 6. CHECK constraint: role_id and scheme_id must be both NULL or both non-NULL.
--    Prevents the "role_id set but scheme_id NULL" case where the composite FK isn't checked.
ALTER TABLE "user_project_roles"
  ADD CONSTRAINT "user_project_roles_role_scheme_consistent"
  CHECK (("role_id" IS NULL AND "scheme_id" IS NULL) OR ("role_id" IS NOT NULL AND "scheme_id" IS NOT NULL));
