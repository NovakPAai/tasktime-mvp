-- Backfill issueTypeConfigId from type enum for rows that have type but no configId
UPDATE "issues" SET "issue_type_config_id" = itc.id
FROM "issue_type_configs" itc
WHERE "issues"."type"::text = itc."system_key"
  AND "issues"."issue_type_config_id" IS NULL
  AND "issues"."type" IS NOT NULL;

-- Drop legacy type column
ALTER TABLE "issues" DROP COLUMN IF EXISTS "type";

-- Drop legacy enum type
DROP TYPE IF EXISTS "IssueType";
