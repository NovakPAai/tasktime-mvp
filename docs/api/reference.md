# Flow Universe — API Reference

> **Base URL:** `https://<host>/api` (production) | `http://localhost:3000/api` (dev)
> **Auth:** `Authorization: Bearer <JWT>` on all requests except public endpoints
> **Last updated:** 2026-03-25
> **Source:** `backend/src/modules/*/router.ts`

---

## Authentication

### Response codes

| Code | Meaning |
|------|---------|
| 200 | OK — body contains data |
| 201 | Created — body contains created resource |
| 204 | No Content — success, no body (DELETE) |
| 400 | Bad Request — validation error. Body: `{ error: string, details?: [...] }` |
| 401 | Unauthorized — missing or invalid JWT |
| 403 | Forbidden — valid JWT but insufficient role |
| 404 | Not Found |
| 409 | Conflict — e.g. timer already running, duplicate key |
| 503 | Service Unavailable — DB or Redis down |
| 500 | Internal Server Error |

### Error body format

```json
{ "error": "Human-readable message" }
```

---

## Auth endpoints — `/api/auth`

### POST `/api/auth/register`
Create account.
```json
// Request body
{ "email": "user@example.com", "password": "secret123", "name": "Ivan Ivanov" }

// Response 201
{
  "user": { "id": "uuid", "email": "user@example.com", "name": "Ivan Ivanov", "role": "USER" },
  "token": "eyJ...",
  "refreshToken": "eyJ..."
}
```
409 if email already registered.

### POST `/api/auth/login`
```json
// Request body
{ "email": "user@example.com", "password": "secret123" }

// Response 200 — same structure as register
```
401 if credentials invalid.

### POST `/api/auth/refresh`
Rotate access token using refresh token.
```json
// Request body
{ "refreshToken": "eyJ..." }

// Response 200
{ "token": "eyJ...", "refreshToken": "eyJ..." }
```

### POST `/api/auth/logout`
Invalidate refresh token.
```json
// Request body
{ "refreshToken": "eyJ..." }
// Response 200: { "message": "Logged out" }
```

### GET `/api/auth/me`
Get current user. Requires JWT.
```json
// Response 200
{ "id": "uuid", "email": "...", "name": "...", "role": "USER", "isActive": true }
```

---

## Users — `/api/users`

All endpoints require JWT.

### GET `/api/users`
List all active users (for assignee dropdowns).
```json
// Response 200
[{ "id": "uuid", "email": "...", "name": "...", "role": "USER" }, ...]
```

### GET `/api/users/:id`
Get user by ID. 404 if not found.

### POST `/api/users`
Requires: ADMIN. Create user.
```json
// Request body
{ "email": "...", "password": "...", "name": "...", "role": "USER" }
```

### PATCH `/api/users/:id`
Requires: ADMIN. Update user.
```json
{ "name"?: "...", "role"?: "MANAGER", "isActive"?: false }
```

### DELETE `/api/users/:id`
Requires: ADMIN. Soft-deletes user.

---

## Projects — `/api/projects`

### GET `/api/projects`
List all projects.
```json
[{ "id": "uuid", "name": "Flow Universe MVP", "key": "TTMP", "description": "...", "createdAt": "..." }]
```

### GET `/api/projects/:id`
Project detail with counts.

### POST `/api/projects`
Requires: ADMIN, MANAGER.
```json
{ "name": "My Project", "key": "PROJ", "description"?: "..." }
```
409 if key already exists.

### PATCH `/api/projects/:id`
Requires: ADMIN, MANAGER.

### DELETE `/api/projects/:id`
Requires: ADMIN. Cascades to issues, sprints, releases.

---

## Issues — `/api`

### GET `/api/projects/:projectId/issues`
List issues with optional filters.

**Query params:**
| Param | Type | Example |
|-------|------|---------|
| `status` | `IssueStatus` or CSV | `OPEN,IN_PROGRESS` |
| `type` | `IssueType` or CSV | `EPIC,STORY` |
| `priority` | `IssuePriority` or CSV | `HIGH,CRITICAL` |
| `assigneeId` | UUID | |
| `sprintId` | UUID | |
| `from` | ISO date | `2026-01-01` |
| `to` | ISO date | `2026-03-31` |
| `search` | string | `login bug` |

```json
// Response 200
[{
  "id": "uuid",
  "number": 42,
  "key": "TTMP-42",
  "title": "Fix login",
  "type": "BUG",
  "status": "IN_PROGRESS",
  "priority": "HIGH",
  "orderIndex": 0,
  "estimatedHours": "4.00",
  "assignee": { "id": "...", "name": "...", "email": "..." },
  "creator": { "id": "...", "name": "..." },
  "sprint": { "id": "...", "name": "Sprint 1" },
  "parentId": null,
  "createdAt": "...",
  "updatedAt": "..."
}]
```

### POST `/api/projects/:projectId/issues`
Create issue.
```json
{
  "title": "Fix login bug",          // required
  "type": "BUG",                     // default: TASK
  "status": "OPEN",                  // default: OPEN
  "priority": "HIGH",                // default: MEDIUM
  "description": "...",
  "parentId": "uuid",
  "assigneeId": "uuid",
  "sprintId": "uuid",
  "estimatedHours": 4
}
```
Returns 201 with created issue.

### POST `/api/projects/:projectId/issues/bulk`
Requires: ADMIN, MANAGER. Bulk update.
```json
{ "issueIds": ["uuid1", "uuid2"], "status": "DONE", "assigneeId": "uuid" }
```

### GET `/api/issues/key/:key`
Get issue by key (e.g. `TTMP-83`). Used by agents and GitLab integration.

### GET `/api/issues/:id`
Full issue detail including comments, timeLogs, children.

### PATCH `/api/issues/:id`
Update any issue field.

### PATCH `/api/issues/:id/status`
```json
{ "status": "IN_PROGRESS" }
```

### PATCH `/api/issues/:id/assign`
Requires: ADMIN, MANAGER.
```json
{ "assigneeId": "uuid" }  // null to unassign
```

### PATCH `/api/issues/:id/ai-flags`
Requires: ADMIN, MANAGER.
```json
{ "aiEligible": true, "aiAssigneeType": "AGENT" }
```

### PATCH `/api/issues/:id/ai-status`
Requires: ADMIN, MANAGER.
```json
{ "aiExecutionStatus": "IN_PROGRESS" }
```

### DELETE `/api/issues/:id`
Requires: ADMIN.

### GET `/api/issues/:id/children`
List child issues.

### GET `/api/issues/:id/history`
Issue audit trail from `audit_logs`.
```json
[{
  "action": "issue.status_changed",
  "user": { "id": "...", "name": "..." },
  "details": { "status": "IN_PROGRESS" },
  "createdAt": "..."
}]
```

---

## Board — `/api`

### GET `/api/projects/:projectId/board`
Kanban board columns.
```json
{
  "OPEN": [{ ...issue }, ...],
  "IN_PROGRESS": [...],
  "REVIEW": [...],
  "DONE": [...],
  "CANCELLED": [...]
}
```

### PATCH `/api/issues/:id/board`
Move issue on board.
```json
{ "status": "REVIEW", "orderIndex": 2 }
```

---

## Sprints — `/api`

### GET `/api/projects/:projectId/sprints`
List sprints for project.

### GET `/api/sprints`
All sprints across all projects.

### GET `/api/sprints/:id`
Sprint detail with issues.

### POST `/api/projects/:projectId/sprints`
Requires: ADMIN, MANAGER.
```json
{
  "name": "Sprint 4",
  "goal": "Complete AI module",
  "startDate": "2026-03-25",
  "endDate": "2026-04-08"
}
```

### PATCH `/api/sprints/:id`
Update sprint fields.

### PATCH `/api/sprints/:id/start`
Requires: ADMIN, MANAGER. Start sprint. Only one ACTIVE sprint per project allowed.

### PATCH `/api/sprints/:id/close`
Requires: ADMIN, MANAGER. Close sprint.

### DELETE `/api/sprints/:id`
Requires: ADMIN.

---

## Releases — `/api`

### GET `/api/projects/:projectId/releases`
List releases.

### GET `/api/releases`
All releases globally.

### GET `/api/releases/:id`
Release detail with assigned issues.

### POST `/api/projects/:projectId/releases`
Requires: ADMIN, MANAGER.
```json
{
  "name": "1.2.0",
  "description": "Time tracking improvements",
  "level": "MINOR",
  "releaseDate": "2026-04-15"
}
```

### PATCH `/api/releases/:id`
Update release (including `state`: DRAFT → READY → RELEASED).

### DELETE `/api/releases/:id`
Requires: ADMIN.

---

## Comments — `/api`

### GET `/api/issues/:issueId/comments`
```json
[{
  "id": "uuid",
  "body": "This is a comment",
  "author": { "id": "...", "name": "..." },
  "createdAt": "...",
  "updatedAt": "..."
}]
```

### POST `/api/issues/:issueId/comments`
```json
{ "body": "Fixed in commit abc123" }
```

### PATCH `/api/comments/:id`
Edit own comment.
```json
{ "body": "Updated comment" }
```

### DELETE `/api/comments/:id`
Owner or ADMIN.

---

## Time Tracking — `/api`

### POST `/api/issues/:issueId/time/start`
Start timer on issue. One active timer per user at a time.
Returns 409 if timer already running on this issue.

### POST `/api/issues/:issueId/time/stop`
Stop timer, creates TimeLog.
```json
// Response 200
{ "id": "uuid", "hours": "1.50", "startedAt": "...", "stoppedAt": "...", "logDate": "2026-03-25" }
```

### POST `/api/issues/:issueId/time`
Manual time entry.
```json
{ "hours": 2.5, "note": "Debugging session", "logDate": "2026-03-24" }
```

### GET `/api/issues/:issueId/time-logs`
Time logs for issue.

### GET `/api/time-logs`
Current user's time logs. Query: `from` (date), `to` (date), `issueId`.

### DELETE `/api/time-logs/:id`
Owner or ADMIN.

---

## Teams — `/api`

### GET `/api/teams`
List all teams with member count.

### GET `/api/teams/:id`
Team detail with members.

### POST `/api/teams`
Requires: ADMIN, MANAGER.
```json
{ "name": "Backend Team", "description": "..." }
```

### PATCH `/api/teams/:id`
Requires: ADMIN, MANAGER.

### DELETE `/api/teams/:id`
Requires: ADMIN.

### POST `/api/teams/:id/members`
Requires: ADMIN, MANAGER.
```json
{ "userId": "uuid", "role": "LEAD" }
```

### DELETE `/api/teams/:id/members/:userId`
Requires: ADMIN, MANAGER.

---

## Admin — `/api/admin`

### GET `/api/admin/stats`
Requires: ADMIN, MANAGER, VIEWER.
```json
{
  "uptime": 86400,
  "nodeVersion": "v20.11.0",
  "memoryUsageMb": 245,
  "dbLatencyMs": 3,
  "redisStatus": "ok",
  "errorsLast24h": 0
}
```

### GET `/api/admin/users`
Requires: ADMIN. Full user list with metadata.

### GET `/api/admin/activity`
Requires: ADMIN, MANAGER, VIEWER. Audit log.
Query: `limit` (default 50), `offset` (default 0).

### GET `/api/admin/uat-tests`
UAT test list. Query: `role` (ADMIN | MANAGER | USER | VIEWER).

### GET `/api/admin/reports/issues-by-status`
Requires: ADMIN, MANAGER, VIEWER.
Query: `projectId` (required), `sprintId`?, `from`?, `to`?
```json
[{ "status": "OPEN", "count": 14 }, { "status": "DONE", "count": 32 }]
```

### GET `/api/admin/reports/issues-by-assignee`
Same query params as above.
```json
[{ "assignee": { "name": "...", "email": "..." }, "count": 8 }]
```

---

## AI — `/api`

### GET `/api/ai-sessions`
List AI sessions. Query: `issueId`, `limit` (default 20).
```json
[{
  "id": "uuid",
  "model": "claude-sonnet-4-6",
  "tokensInput": 1200,
  "tokensOutput": 800,
  "costMoney": "0.0124",
  "startedAt": "...",
  "finishedAt": "..."
}]
```

### POST `/api/ai/estimate`
AI estimates effort for an issue.
```json
// Request
{ "issueId": "uuid" }

// Response 200
{ "estimatedHours": 8, "reasoning": "...", "session": { ...aiSession } }
```

### POST `/api/ai/decompose`
AI decomposes issue into subtasks.
```json
// Request
{ "issueId": "uuid" }

// Response 200
{ "subtasks": [{ "title": "...", "estimatedHours": 2 }], "session": { ...aiSession } }
```

---

## Webhooks — `/api/webhooks`

### POST `/api/webhooks/gitlab`
GitLab webhook endpoint. Auth via `X-Gitlab-Token` header (matches `GITLAB_WEBHOOK_SECRET` env).

Supported events:
- `push` → issue key in branch name → status: `IN_PROGRESS`
- `merge_request` opened → status: `REVIEW`
- `merge_request` merged → status: `DONE`

See [../integrations/gitlab.md](../integrations/gitlab.md) for setup guide.

---

## Health

### GET `/api/health`
Liveness check. No auth required.
```json
{ "status": "ok", "timestamp": "2026-03-25T10:00:00.000Z" }
```

### GET `/api/ready`
Readiness check. Returns 503 if DB or Redis unavailable.
```json
// 200
{ "status": "ok", "db": "ok", "redis": "ok" }

// 503
{ "status": "error", "db": "error", "redis": "ok" }
```

---

## How to update this doc

When any route in `backend/src/modules/*/router.ts` changes → update this file.
Run `make docs` — it will flag if API docs may be stale.
The `--api` mode of `scripts/generate-docs.js` can auto-regenerate this from OpenAPI.
