-- Tighten the composite FK on user_project_roles from ON DELETE SET NULL to ON DELETE RESTRICT.
-- ProjectRoleDefinition rows with live UserProjectRole references can now never be deleted
-- directly (the application service already blocks this via usageCount > 0). Previously a
-- cascading SetNull would leave role_id=NULL; if Postgres failed to null both columns
-- atomically the CHECK constraint (role_id IS NULL) = (scheme_id IS NULL) would reject the
-- update. Restrict removes that class of edge cases entirely.

ALTER TABLE "user_project_roles"
  DROP CONSTRAINT "user_project_roles_role_id_scheme_id_fkey";

ALTER TABLE "user_project_roles"
  ADD CONSTRAINT "user_project_roles_role_id_scheme_id_fkey"
  FOREIGN KEY ("role_id", "scheme_id")
  REFERENCES "project_role_definitions" ("id", "scheme_id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;
