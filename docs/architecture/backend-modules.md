# Flow Universe — Backend Modules

> **Source:** `backend/src/app.ts` + `backend/src/modules/`
> **Pattern:** router → service → Prisma (modules never import each other's services)
> **Last updated:** 2026-03-25

---

## Module Map

| Module | Mount path | Auth required | Key roles |
|--------|-----------|---------------|-----------|
| auth | `/api/auth` | Partial (login/register public) | — |
| users | `/api/users` | Yes | ADMIN |
| projects | `/api/projects` | Yes | ADMIN, MANAGER |
| issues | `/api` (mixed) | Yes | ADMIN, MANAGER |
| boards | `/api` | Yes | All |
| sprints | `/api` | Yes | ADMIN, MANAGER |
| releases | `/api` | Yes | ADMIN, MANAGER |
| comments | `/api` | Yes | All |
| time | `/api` | Yes | All |
| teams | `/api` | Yes | ADMIN, MANAGER |
| admin | `/api/admin` | Yes | ADMIN, MANAGER, VIEWER |
| ai-sessions | `/api` | Yes | All |
| ai | `/api` | Yes | All |
| webhooks | `/api/webhooks` | No (secret-based) | — |

---

## Shared Middleware

Located in `backend/src/shared/middleware/`:

| File | Purpose |
|------|---------|
| `auth.ts` | `authenticate` — validates JWT Bearer token, attaches `req.user = { userId, role }` |
| `rbac.ts` | `requireRole(...roles)` — checks `req.user.role` against allowed roles, returns 403 if denied |
| `audit.ts` | `logAudit(req, action, entityType, entityId, details?)` — writes to `audit_logs` table |
| `validate.ts` | `validate(schema)` — runs Zod schema against `req.body`, returns 400 with errors on failure |
| `error-handler.ts` | Global error handler — converts thrown errors to JSON `{ error: string }` |

---

## Module Details

### auth — `/api/auth`

File: `backend/src/modules/auth/`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/register` | Public | Create account. Body: `{ email, password, name }` |
| POST | `/api/auth/login` | Public | Get JWT + refresh token. Body: `{ email, password }` |
| POST | `/api/auth/refresh` | Public | Rotate refresh token. Body: `{ refreshToken }` |
| POST | `/api/auth/logout` | Public | Invalidate refresh token. Body: `{ refreshToken }` |
| GET | `/api/auth/me` | JWT | Get current user profile |

Returns `{ user: { id, email, name, role }, token, refreshToken }` on login/register.

---

### users — `/api/users`

File: `backend/src/modules/users/`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/users` | JWT | List all active users (for assignee dropdowns) |
| GET | `/api/users/:id` | JWT | Get user by ID |
| POST | `/api/users` | ADMIN | Create user |
| PATCH | `/api/users/:id` | ADMIN | Update user (name, role, isActive) |
| DELETE | `/api/users/:id` | ADMIN | Delete user |

---

### projects — `/api/projects`

File: `backend/src/modules/projects/`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/projects` | JWT | List all projects |
| GET | `/api/projects/:id` | JWT | Get project detail |
| POST | `/api/projects` | ADMIN, MANAGER | Create project. Body: `{ name, key, description? }` |
| PATCH | `/api/projects/:id` | ADMIN, MANAGER | Update project |
| DELETE | `/api/projects/:id` | ADMIN | Delete project |

---

### issues — `/api`

File: `backend/src/modules/issues/`

Mixed mount paths because issues span `/projects/:id/issues` and `/issues/:id`.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/projects/:projectId/issues` | JWT | List issues with filters: `status`, `type`, `priority`, `assigneeId`, `sprintId`, `from`, `to`, `search` |
| POST | `/api/projects/:projectId/issues` | JWT | Create issue. Body: `{ title, type?, status?, priority?, description?, parentId?, assigneeId?, estimatedHours? }` |
| POST | `/api/projects/:projectId/issues/bulk` | ADMIN, MANAGER | Bulk update status/assignee. Body: `{ issueIds[], status?, assigneeId? }` |
| GET | `/api/issues/key/:key` | JWT | Get issue by key (e.g. `TTMP-83`). For agents and integrations |
| GET | `/api/issues/:id` | JWT | Get issue detail (includes comments, timeLogs, children) |
| PATCH | `/api/issues/:id` | JWT | Update issue fields |
| PATCH | `/api/issues/:id/status` | JWT | Change status only. Body: `{ status }` |
| PATCH | `/api/issues/:id/assign` | ADMIN, MANAGER | Assign issue. Body: `{ assigneeId }` |
| PATCH | `/api/issues/:id/ai-flags` | ADMIN, MANAGER | Set AI eligibility. Body: `{ aiEligible?, aiAssigneeType? }` |
| PATCH | `/api/issues/:id/ai-status` | ADMIN, MANAGER | Update AI execution status. Body: `{ aiExecutionStatus }` |
| DELETE | `/api/issues/:id` | ADMIN | Delete issue |
| GET | `/api/issues/:id/children` | JWT | Get child issues |
| GET | `/api/issues/:id/history` | JWT | Get audit history for issue |
| GET | `/api/mvp-livecode/issues/active` | JWT | Active issues for MVP LiveCode meta-project |

---

### boards — `/api`

File: `backend/src/modules/boards/`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/projects/:projectId/board` | JWT | Get Kanban board (issues grouped by status column) |
| PATCH | `/api/issues/:id/board` | JWT | Move issue on board. Body: `{ status, orderIndex? }` |

---

### sprints — `/api`

File: `backend/src/modules/sprints/`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/projects/:projectId/sprints` | JWT | List sprints for project |
| GET | `/api/sprints` | JWT | List all sprints (global view) |
| GET | `/api/sprints/:id` | JWT | Get sprint detail with issues |
| POST | `/api/projects/:projectId/sprints` | ADMIN, MANAGER | Create sprint. Body: `{ name, goal?, startDate?, endDate? }` |
| PATCH | `/api/sprints/:id` | ADMIN, MANAGER | Update sprint |
| PATCH | `/api/sprints/:id/start` | ADMIN, MANAGER | Start sprint (state: PLANNED → ACTIVE). Only one ACTIVE sprint per project |
| PATCH | `/api/sprints/:id/close` | ADMIN, MANAGER | Close sprint (state: ACTIVE → CLOSED) |
| DELETE | `/api/sprints/:id` | ADMIN | Delete sprint |

---

### releases — `/api`

File: `backend/src/modules/releases/`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/projects/:projectId/releases` | JWT | List releases for project |
| GET | `/api/releases` | JWT | List all releases (global view) |
| GET | `/api/releases/:id` | JWT | Get release detail with issues |
| POST | `/api/projects/:projectId/releases` | ADMIN, MANAGER | Create release |
| PATCH | `/api/releases/:id` | ADMIN, MANAGER | Update release |
| DELETE | `/api/releases/:id` | ADMIN | Delete release |

---

### comments — `/api`

File: `backend/src/modules/comments/`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/issues/:issueId/comments` | JWT | List comments for issue |
| POST | `/api/issues/:issueId/comments` | JWT | Add comment. Body: `{ body }` |
| PATCH | `/api/comments/:id` | JWT (owner) | Edit own comment |
| DELETE | `/api/comments/:id` | JWT (owner or ADMIN) | Delete comment |

---

### time — `/api`

File: `backend/src/modules/time/`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/issues/:issueId/time/start` | JWT | Start timer on issue. One active timer per user |
| POST | `/api/issues/:issueId/time/stop` | JWT | Stop timer, save TimeLog |
| POST | `/api/issues/:issueId/time` | JWT | Manual time log. Body: `{ hours, note?, logDate? }` |
| GET | `/api/issues/:issueId/time-logs` | JWT | List time logs for issue |
| GET | `/api/time-logs` | JWT | Current user's time logs. Query: `from`, `to`, `issueId` |
| DELETE | `/api/time-logs/:id` | JWT (owner or ADMIN) | Delete time log |

---

### teams — `/api`

File: `backend/src/modules/teams/`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/teams` | JWT | List all teams |
| GET | `/api/teams/:id` | JWT | Get team with members |
| POST | `/api/teams` | ADMIN, MANAGER | Create team |
| PATCH | `/api/teams/:id` | ADMIN, MANAGER | Update team |
| DELETE | `/api/teams/:id` | ADMIN | Delete team |
| POST | `/api/teams/:id/members` | ADMIN, MANAGER | Add member. Body: `{ userId, role? }` |
| DELETE | `/api/teams/:id/members/:userId` | ADMIN, MANAGER | Remove member |

---

### admin — `/api/admin`

File: `backend/src/modules/admin/`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/admin/stats` | ADMIN, MANAGER, VIEWER | System stats (uptime, RAM, DB latency, errors) |
| GET | `/api/admin/users` | ADMIN | All users with metadata (activity, audit count) |
| GET | `/api/admin/activity` | ADMIN, MANAGER, VIEWER | Audit log with pagination |
| GET | `/api/admin/uat-tests` | All | UAT test checklist. Query: `role` |
| GET | `/api/admin/reports/issues-by-status` | ADMIN, MANAGER, VIEWER | Issues grouped by status. Query: `projectId`, `sprintId`, `from`, `to` |
| GET | `/api/admin/reports/issues-by-assignee` | ADMIN, MANAGER, VIEWER | Issues grouped by assignee. Query: `projectId`, `sprintId`, `from`, `to` |

---

### ai-sessions + ai — `/api`

File: `backend/src/modules/ai/`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/ai-sessions` | JWT | List AI sessions. Query: `issueId`, `limit` |
| POST | `/api/ai/estimate` | JWT | AI estimation of issue effort. Body: `{ issueId }` |
| POST | `/api/ai/decompose` | JWT | AI decomposition of issue into subtasks. Body: `{ issueId }` |

Powered by `@anthropic-ai/sdk`. Logs usage to `ai_sessions` + `time_logs` (source: AGENT).

---

### webhooks — `/api/webhooks`

File: `backend/src/modules/webhooks/`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/webhooks/gitlab` | Secret header | Receive GitLab events (push, MR open/merge) |

GitLab webhook auto-updates issue status based on branch/MR title containing issue key (e.g. `TTMP-83`).

---

### Health endpoints (no module)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/health` | Public | Liveness check. Returns `{ status: "ok", timestamp }` |
| GET | `/api/ready` | Public | Readiness check. Returns 503 if DB or Redis unavailable |

---

## How to update this doc

When a new module is added or routes change in `backend/src/modules/*/router.ts` or `backend/src/app.ts` → update this file.
Run `make docs` to check for staleness warnings.

<!-- AUTO-GENERATED:START -->
> ⚡ Авто-сгенерировано из `backend/src/app.ts`
> Обновляется автоматически при каждом изменении.

| Модуль | Префикс API | Файл роутера |
|--------|-------------|--------------|
| Auth | `/api/auth` | `backend/src/modules/auth/auth.router.js.ts` |
| Users | `/api/users` | `backend/src/modules/users/users.router.js.ts` |
| Projects | `/api/projects` | `backend/src/modules/projects/projects.router.js.ts` |
| Project Categories | `/api/project-categories` | `backend/src/modules/project-categories/project-categories.router.js.ts` |
| Issues | `/api` | `backend/src/modules/issues/issues.router.js.ts` |
| Boards | `/api` | `backend/src/modules/boards/boards.router.js.ts` |
| Sprints | `/api` | `backend/src/modules/sprints/sprints.router.js.ts` |
| Releases | `/api` | `backend/src/modules/releases/releases.router.js.ts` |
| Comments | `/api` | `backend/src/modules/comments/comments.router.js.ts` |
| Time | `/api` | `backend/src/modules/time/time.router.js.ts` |
| Teams | `/api` | `backend/src/modules/teams/teams.router.js.ts` |
| Admin | `/api` | `backend/src/modules/admin/admin.router.js.ts` |
| Ai | `/api` | `backend/src/modules/ai/ai-sessions.router.js.ts` |
| Ai | `/api` | `backend/src/modules/ai/ai.router.js.ts` |
| Webhooks | `/api` | `backend/src/modules/webhooks/webhooks.router.js.ts` |
| Links | `/api` | `backend/src/modules/links/links.router.js.ts` |
| Issue Type Configs | `/api` | `backend/src/modules/issue-type-configs/issue-type-configs.router.js.ts` |
| Issue Type Schemes | `/api` | `backend/src/modules/issue-type-schemes/issue-type-schemes.router.js.ts` |
| Custom Fields | `/api/admin/custom-fields` | `backend/src/modules/custom-fields/custom-fields.router.js.ts` |
| fieldSchemasAdminRouter | `/api/admin/field-schemas` | `—` |
| Issue Custom Fields | `/api` | `backend/src/modules/issue-custom-fields/issue-custom-fields.router.js.ts` |
| projectFieldSchemasRouter | `/api/projects/:projectId/field-schemas` | `—` |
| Monitoring | `/api/monitoring` | `backend/src/modules/monitoring/monitoring.router.js.ts` |
<!-- AUTO-GENERATED:END -->
