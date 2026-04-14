-- RBAC Multi-Role: replace single user.role with many-to-many UserSystemRole

-- Step 1: Create SystemRoleType enum
CREATE TYPE "SystemRoleType" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'RELEASE_MANAGER', 'USER', 'AUDITOR');

-- Step 2: Create user_system_roles junction table
CREATE TABLE "user_system_roles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "SystemRoleType" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,
    CONSTRAINT "user_system_roles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_system_roles_user_id_role_key" ON "user_system_roles"("user_id", "role");
CREATE INDEX "user_system_roles_user_id_idx" ON "user_system_roles"("user_id");

ALTER TABLE "user_system_roles" ADD CONSTRAINT "user_system_roles_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Step 3: Data migration — SUPER_ADMIN
INSERT INTO "user_system_roles" ("id", "user_id", "role", "created_at")
SELECT gen_random_uuid(), "id", 'SUPER_ADMIN', NOW()
FROM "users" WHERE "role" = 'SUPER_ADMIN';

-- Step 3: Data migration — ADMIN
INSERT INTO "user_system_roles" ("id", "user_id", "role", "created_at")
SELECT gen_random_uuid(), "id", 'ADMIN', NOW()
FROM "users" WHERE "role" = 'ADMIN';

-- Step 3: Data migration — RELEASE_MANAGER
INSERT INTO "user_system_roles" ("id", "user_id", "role", "created_at")
SELECT gen_random_uuid(), "id", 'RELEASE_MANAGER', NOW()
FROM "users" WHERE "role" = 'RELEASE_MANAGER';

-- Step 3: Data migration — VIEWER → AUDITOR
INSERT INTO "user_system_roles" ("id", "user_id", "role", "created_at")
SELECT gen_random_uuid(), "id", 'AUDITOR', NOW()
FROM "users" WHERE "role" = 'VIEWER';

-- Step 3: Data migration — MANAGER (global) → project role MANAGER in all projects
INSERT INTO "user_project_roles" ("id", "user_id", "project_id", "role", "created_at")
SELECT gen_random_uuid(), u."id", p."id", 'MANAGER', NOW()
FROM "users" u
CROSS JOIN "projects" p
WHERE u."role" = 'MANAGER'
ON CONFLICT ("user_id", "project_id", "role") DO NOTHING;

-- Step 3: Data migration — all users get base USER system role
INSERT INTO "user_system_roles" ("id", "user_id", "role", "created_at")
SELECT gen_random_uuid(), "id", 'USER', NOW()
FROM "users"
ON CONFLICT ("user_id", "role") DO NOTHING;

-- Step 4: Drop role column from users
ALTER TABLE "users" DROP COLUMN "role";

-- Step 5: Drop old UserRole enum
DROP TYPE "UserRole";
