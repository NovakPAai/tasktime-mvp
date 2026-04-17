-- Collapse UserProjectRole uniqueness from (user_id, project_id, role) to (user_id, project_id):
-- a user has at most one role per project. This matches the typical "one role per project"
-- model used by most permission systems and makes requireProjectPermission deterministic
-- (findFirst previously returned an arbitrary row when multiple legacy rows existed).
--
-- Dedup strategy: keep the highest-privilege legacy role per (user_id, project_id) so no user
-- loses effective access across the change. Order: ADMIN > MANAGER > USER > VIEWER.

-- 1. Drop duplicates, keeping the row with the highest-privilege legacy role.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, project_id
      ORDER BY
        CASE role
          WHEN 'ADMIN'   THEN 0
          WHEN 'MANAGER' THEN 1
          WHEN 'USER'    THEN 2
          WHEN 'VIEWER'  THEN 3
        END,
        created_at ASC
    ) AS rn
  FROM "user_project_roles"
)
DELETE FROM "user_project_roles"
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- 2. Replace the unique index.
DROP INDEX "user_project_roles_user_id_project_id_role_key";
CREATE UNIQUE INDEX "user_project_roles_user_id_project_id_key" ON "user_project_roles"("user_id", "project_id");
