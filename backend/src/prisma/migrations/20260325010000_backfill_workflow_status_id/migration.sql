-- Backfill: set workflow_status_id for all existing issues based on their current status enum value
UPDATE "issues" i
SET "workflow_status_id" = ws.id
FROM "workflow_statuses" ws
WHERE ws.system_key = i.status::text
  AND i.workflow_status_id IS NULL;
