-- Performance indexes migration (additive only, no breaking changes)
-- NOTE: In production with live traffic use CREATE INDEX CONCURRENTLY manually
--       (Prisma migrations run inside a transaction, CONCURRENTLY is incompatible)

-- RefreshToken: auth lookups by userId
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- Sprint: team FK lookups
CREATE INDEX "sprints_project_team_id_idx" ON "sprints"("project_team_id");
CREATE INDEX "sprints_business_team_id_idx" ON "sprints"("business_team_id");
CREATE INDEX "sprints_flow_team_id_idx" ON "sprints"("flow_team_id");

-- Comment: author lookup
CREATE INDEX "comments_author_id_idx" ON "comments"("author_id");

-- TeamMember: team-side lookup (userId index already exists)
CREATE INDEX "team_members_team_id_idx" ON "team_members"("team_id");

-- AuditLog: filter by action type
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- Issue: temporal range queries for reports
CREATE INDEX "issues_created_at_idx" ON "issues"("created_at");
CREATE INDEX "issues_updated_at_idx" ON "issues"("updated_at");

-- Issue: cross-project status filter
CREATE INDEX "issues_status_idx" ON "issues"("status");

-- TimeLog: date-range queries for time reports
CREATE INDEX "time_logs_log_date_idx" ON "time_logs"("log_date");
