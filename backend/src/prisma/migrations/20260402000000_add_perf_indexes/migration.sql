-- Performance indexes migration (additive only, no breaking changes)
--
-- ⚠️  PRODUCTION DEPLOYMENT GUIDE
-- Prisma migrate deploy runs inside a transaction, which is incompatible with
-- CREATE INDEX CONCURRENTLY. On a live database with significant traffic the
-- non-concurrent CREATE INDEX will hold a ShareLock and block writes for the
-- duration of the index build.
--
-- Before running this migration on production:
--   1. Pre-create each index manually with CONCURRENTLY (does not block writes):
--        CREATE INDEX CONCURRENTLY IF NOT EXISTS "refresh_tokens_user_id_idx"
--          ON "refresh_tokens"("user_id");
--        -- ... repeat for every index below
--   2. Then run `prisma migrate deploy` — Prisma will detect the indexes already
--      exist and skip the CREATE INDEX statements (postgres ignores IF NOT EXISTS
--      inside a transaction as a no-op, no error).
--
-- On staging / dev with low traffic the plain CREATE INDEX is acceptable.

-- RefreshToken: auth lookups by userId
CREATE INDEX IF NOT EXISTS "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- Sprint: team FK lookups
CREATE INDEX IF NOT EXISTS "sprints_project_team_id_idx" ON "sprints"("project_team_id");
CREATE INDEX IF NOT EXISTS "sprints_business_team_id_idx" ON "sprints"("business_team_id");
CREATE INDEX IF NOT EXISTS "sprints_flow_team_id_idx" ON "sprints"("flow_team_id");

-- Comment: author lookup
CREATE INDEX IF NOT EXISTS "comments_author_id_idx" ON "comments"("author_id");

-- TeamMember: team-side lookup (userId index already exists)
CREATE INDEX IF NOT EXISTS "team_members_team_id_idx" ON "team_members"("team_id");

-- AuditLog: filter by action type
CREATE INDEX IF NOT EXISTS "audit_logs_action_idx" ON "audit_logs"("action");

-- Issue: temporal range queries for reports
CREATE INDEX IF NOT EXISTS "issues_created_at_idx" ON "issues"("created_at");
CREATE INDEX IF NOT EXISTS "issues_updated_at_idx" ON "issues"("updated_at");

-- Issue: cross-project status filter
CREATE INDEX IF NOT EXISTS "issues_status_idx" ON "issues"("status");

-- TimeLog: date-range queries for time reports
CREATE INDEX IF NOT EXISTS "time_logs_log_date_idx" ON "time_logs"("log_date");
