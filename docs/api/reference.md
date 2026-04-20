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

## Pagination

Endpoints that return lists support optional pagination query parameters:

| Parameter | Type | Default | Max | Description |
|-----------|------|---------|-----|-------------|
| `page` | integer | 1 | — | Page number (1-based) |
| `limit` | integer | 100 | 500 | Items per page |

**Paginated response envelope:**

```json
{
  "data": [...],
  "meta": {
    "page": 1,
    "limit": 100,
    "total": 342,
    "totalPages": 4
  }
}
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

### POST `/api/sprints/:id/ai/estimate-all`
Bulk AI estimate for all issues in a sprint. Requires `ADMIN` or `MANAGER` role. Uses a per-sprint Redis lock to prevent concurrent runs.
```json
// Response 200
{
  "total": 12,
  "estimated": 10,
  "failed": 2,
  "results": [
    { "issueId": "uuid", "estimatedHours": 8 },
    { "issueId": "uuid", "error": "AI service unavailable" }
  ]
}

// Response 404
{ "error": "Sprint not found" }

// Response 409
{ "error": "Estimation already in progress for this sprint" }
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

<!-- AUTO-GENERATED:START -->
> ⚡ Авто-сгенерировано из `backend/src/modules/**/*.router.ts`
> 🔒 = требует JWT, 🔒 ADMIN/MANAGER = требует роль, — = публичный
> Обновляется автоматически при каждом мёрдже в `main`.

### Admin

| Метод | Путь | Доступ |
|-------|------|--------|
| `GET` | `/api/admin/stats` | 🔒 |
| `GET` | `/api/admin/users` | 🔒 |
| `POST` | `/api/admin/users` | 🔒 |
| `PATCH` | `/api/admin/users/:id` | 🔒 |
| `DELETE` | `/api/admin/users/:id` | 🔒 |
| `PATCH` | `/api/admin/users/:id/deactivate` | 🔒 |
| `POST` | `/api/admin/users/:id/reset-password` | 🔒 |
| `GET` | `/api/admin/users/:id/system-roles` | 🔒 |
| `POST` | `/api/admin/users/:id/system-roles` | 🔒 |
| `DELETE` | `/api/admin/users/:id/system-roles/:role` | 🔒 |
| `PUT` | `/api/admin/users/:id/system-roles` | 🔒 |
| `GET` | `/api/admin/users/:id/roles` | 🔒 |
| `POST` | `/api/admin/users/:id/roles` | 🔒 |
| `DELETE` | `/api/admin/users/:id/roles/:roleId` | 🔒 |
| `GET` | `/api/admin/activity` | 🔒 |
| `GET` | `/api/admin/settings/registration` | 🔒 |
| `PATCH` | `/api/admin/settings/registration` | 🔒 |
| `GET` | `/api/admin/settings/system` | 🔒 |
| `PATCH` | `/api/admin/settings/system` | 🔒 |
| `GET` | `/api/admin/uat-tests` | 🔒 |
| `GET` | `/api/admin/reports/issues-by-status` | 🔒 |
| `GET` | `/api/admin/reports/issues-by-assignee` | 🔒 |
| `POST` | `/api/admin/users/reset-password` | 🔒 |

### AI Sessions

| Метод | Путь | Доступ |
|-------|------|--------|
| `POST` | `/api/ai-sessions` | 🔒 |

### AI

| Метод | Путь | Доступ |
|-------|------|--------|
| `POST` | `/api/ai/estimate` | 🔒 |
| `POST` | `/api/ai/decompose` | 🔒 |
| `POST` | `/api/ai/suggest-assignee` | 🔒 |

### Auth

| Метод | Путь | Доступ |
|-------|------|--------|
| `GET` | `/api/auth/registration-status` | — |
| `POST` | `/api/auth/register` | — |
| `POST` | `/api/auth/login` | — |
| `POST` | `/api/auth/refresh` | — |
| `POST` | `/api/auth/logout` | 🔒 |
| `GET` | `/api/auth/me` | 🔒 |
| `POST` | `/api/auth/change-password` | 🔒 |

### Boards

| Метод | Путь | Доступ |
|-------|------|--------|
| `GET` | `/api/projects/:projectId/board` | 🔒 |
| `PATCH` | `/api/projects/:projectId/board/reorder` | 🔒 |

### Comments

| Метод | Путь | Доступ |
|-------|------|--------|
| `GET` | `/api/issues/:issueId/comments` | 🔒 |
| `POST` | `/api/issues/:issueId/comments` | 🔒 |
| `PATCH` | `/api/comments/:id` | 🔒 |
| `DELETE` | `/api/comments/:id` | 🔒 |

### Custom Fields

| Метод | Путь | Доступ |
|-------|------|--------|
| `GET` | `/api/admin/custom-fields/` | 🔒 |
| `POST` | `/api/admin/custom-fields/` | 🔒 |
| `PATCH` | `/api/admin/custom-fields/reorder` | 🔒 |
| `GET` | `/api/admin/custom-fields/:id` | 🔒 |
| `PATCH` | `/api/admin/custom-fields/:id` | 🔒 |
| `DELETE` | `/api/admin/custom-fields/:id` | 🔒 |
| `PATCH` | `/api/admin/custom-fields/:id/toggle` | 🔒 |

### Field Schemas

| Метод | Путь | Доступ |
|-------|------|--------|
| `GET` | `/api/admin/field-schemas/` | — |
| `POST` | `/api/admin/field-schemas/` | — |
| `GET` | `/api/admin/field-schemas/:id` | — |
| `PATCH` | `/api/admin/field-schemas/:id` | — |
| `DELETE` | `/api/admin/field-schemas/:id` | — |
| `POST` | `/api/admin/field-schemas/:id/copy` | — |
| `GET` | `/api/admin/field-schemas/:id/conflicts` | — |
| `POST` | `/api/admin/field-schemas/:id/publish` | — |
| `POST` | `/api/admin/field-schemas/:id/unpublish` | — |
| `PATCH` | `/api/admin/field-schemas/:id/set-default` | — |
| `PUT` | `/api/admin/field-schemas/:id/items` | — |
| `POST` | `/api/admin/field-schemas/:id/items` | — |
| `DELETE` | `/api/admin/field-schemas/:id/items/:itemId` | — |
| `PATCH` | `/api/admin/field-schemas/:id/items/reorder` | — |
| `GET` | `/api/admin/field-schemas/:id/bindings` | — |
| `POST` | `/api/admin/field-schemas/:id/bindings` | — |
| `DELETE` | `/api/admin/field-schemas/:id/bindings/:bindingId` | — |
| `GET` | `/api/admin/field-schemas/` | — |

### Issue Custom Fields

| Метод | Путь | Доступ |
|-------|------|--------|
| `GET` | `/api/issues/:id/custom-fields` | 🔒 |
| `PUT` | `/api/issues/:id/custom-fields` | 🔒 |

### Issue Type Configs

| Метод | Путь | Доступ |
|-------|------|--------|
| `GET` | `/api/admin/issue-type-configs` | 🔒 |
| `POST` | `/api/admin/issue-type-configs` | 🔒 |
| `PUT` | `/api/admin/issue-type-configs/:id` | 🔒 |
| `PATCH` | `/api/admin/issue-type-configs/:id/toggle` | 🔒 |
| `DELETE` | `/api/admin/issue-type-configs/:id` | 🔒 |

### Issue Type Schemes

| Метод | Путь | Доступ |
|-------|------|--------|
| `GET` | `/api/admin/issue-type-schemes` | 🔒 |
| `GET` | `/api/admin/issue-type-schemes/:id` | 🔒 |
| `POST` | `/api/admin/issue-type-schemes` | 🔒 |
| `PUT` | `/api/admin/issue-type-schemes/:id` | 🔒 |
| `DELETE` | `/api/admin/issue-type-schemes/:id` | 🔒 |
| `PUT` | `/api/admin/issue-type-schemes/:id/items` | 🔒 |
| `POST` | `/api/admin/issue-type-schemes/:id/projects` | 🔒 |
| `DELETE` | `/api/admin/issue-type-schemes/:id/projects/:projectId` | 🔒 |
| `GET` | `/api/projects/:id/issue-types` | 🔒 |

### Issues

| Метод | Путь | Доступ |
|-------|------|--------|
| `GET` | `/api/issues/search` | 🔒 |
| `GET` | `/api/projects/:projectId/issues` | 🔒 |
| `GET` | `/api/mvp-livecode/issues/active` | 🔒 |
| `POST` | `/api/projects/:projectId/issues` | 🔒 |
| `GET` | `/api/issues/key/:key` | 🔒 |
| `GET` | `/api/issues/:id` | 🔒 |
| `PATCH` | `/api/issues/:id` | 🔒 |
| `PATCH` | `/api/issues/:id/status` | 🔒 |
| `PATCH` | `/api/issues/:id/assign` | 🔒 |
| `PATCH` | `/api/issues/:id/ai-flags` | 🔒 |
| `PATCH` | `/api/issues/:id/ai-status` | 🔒 |
| `POST` | `/api/projects/:projectId/issues/bulk` | 🔒 |
| `POST` | `/api/projects/:projectId/issues/bulk-transition` | 🔒 |
| `DELETE` | `/api/projects/:projectId/issues/bulk` | 🔒 |
| `PATCH` | `/api/issues/:id/change-type` | 🔒 |
| `POST` | `/api/issues/:id/move` | 🔒 |
| `DELETE` | `/api/issues/:id` | 🔒 |
| `GET` | `/api/issues/:id/children` | 🔒 |
| `GET` | `/api/issues/:id/history` | 🔒 |

### Issue Links

| Метод | Путь | Доступ |
|-------|------|--------|
| `GET` | `/api/issues/:id/links` | 🔒 |
| `POST` | `/api/issues/:id/links` | 🔒 |
| `DELETE` | `/api/issues/:id/links/:linkId` | 🔒 |
| `GET` | `/api/link-types` | 🔒 |
| `GET` | `/api/admin/link-types` | 🔒 |
| `POST` | `/api/admin/link-types` | 🔒 |
| `PATCH` | `/api/admin/link-types/:id` | 🔒 |

### Monitoring

| Метод | Путь | Доступ |
|-------|------|--------|
| `GET` | `/api/monitoring/metrics` | 🔒 |
| `GET` | `/api/monitoring/endpoints` | 🔒 |
| `DELETE` | `/api/monitoring/metrics` | 🔒 |
| `POST` | `/api/monitoring/page-metrics` | 🔒 |

### Project Categories

| Метод | Путь | Доступ |
|-------|------|--------|
| `GET` | `/api/project-categories/` | 🔒 |
| `POST` | `/api/project-categories/` | 🔒 |
| `PATCH` | `/api/project-categories/:id` | 🔒 |
| `DELETE` | `/api/project-categories/:id` | 🔒 |

### project-role-schemes

| Метод | Путь | Доступ |
|-------|------|--------|
| `GET` | `/api/` | 🔒 |
| `POST` | `/api/` | 🔒 |
| `GET` | `/api/:id` | 🔒 |
| `PATCH` | `/api/:id` | 🔒 |
| `DELETE` | `/api/:id` | 🔒 |
| `POST` | `/api/:id/projects` | 🔒 |
| `DELETE` | `/api/:id/projects/:projectId` | 🔒 |
| `GET` | `/api/:id/roles` | 🔒 |
| `POST` | `/api/:id/roles` | 🔒 |
| `PATCH` | `/api/:id/roles/:roleId` | 🔒 |
| `DELETE` | `/api/:id/roles/:roleId` | 🔒 |
| `GET` | `/api/:id/roles/:roleId/permissions` | 🔒 |
| `PATCH` | `/api/:id/roles/:roleId/permissions` | 🔒 |

### Projects

| Метод | Путь | Доступ |
|-------|------|--------|
| `GET` | `/api/projects/` | 🔒 |
| `POST` | `/api/projects/` | 🔒 |
| `GET` | `/api/projects/:id` | 🔒 |
| `GET` | `/api/projects/:id/dashboard` | 🔒 |
| `PATCH` | `/api/projects/:id` | 🔒 |
| `DELETE` | `/api/projects/:id` | 🔒 |

### releases

| Метод | Путь | Доступ |
|-------|------|--------|
| `GET` | `/api/` | 🔒 |
| `POST` | `/api/` | 🔒 |
| `GET` | `/api/:id` | 🔒 |
| `PATCH` | `/api/:id` | 🔒 |
| `DELETE` | `/api/:id` | 🔒 |

### releases

| Метод | Путь | Доступ |
|-------|------|--------|
| `GET` | `/api/` | 🔒 |
| `POST` | `/api/` | 🔒 |
| `GET` | `/api/:id` | 🔒 |
| `PATCH` | `/api/:id` | 🔒 |
| `PUT` | `/api/:id` | 🔒 |
| `DELETE` | `/api/:id` | 🔒 |
| `GET` | `/api/:id/validate` | 🔒 |
| `POST` | `/api/:id/steps` | 🔒 |
| `PATCH` | `/api/:id/steps/:stepId` | 🔒 |
| `DELETE` | `/api/:id/steps/:stepId` | 🔒 |
| `POST` | `/api/:id/transitions` | 🔒 |
| `PATCH` | `/api/:id/transitions/:tid` | 🔒 |
| `PUT` | `/api/:id/transitions/:tid` | 🔒 |
| `DELETE` | `/api/:id/transitions/:tid` | 🔒 |

### Releases

| Метод | Путь | Доступ |
|-------|------|--------|
| `GET` | `/api/releases` | 🔒 |
| `POST` | `/api/releases` | 🔒 |
| `GET` | `/api/releases/:id` | 🔒 |
| `GET` | `/api/releases/:id/history` | 🔒 |
| `PATCH` | `/api/releases/:id` | 🔒 |
| `DELETE` | `/api/releases/:id` | 🔒 |
| `GET` | `/api/releases/:id/items` | 🔒 |
| `POST` | `/api/releases/:id/items` | 🔒 |
| `POST` | `/api/releases/:id/items/remove` | 🔒 |
| `GET` | `/api/releases/:id/transitions` | 🔒 |
| `POST` | `/api/releases/:id/transitions/:transitionId` | 🔒 |
| `GET` | `/api/releases/:id/readiness` | 🔒 |
| `POST` | `/api/releases/:id/clone` | 🔒 |
| `POST` | `/api/releases/:id/ready` | 🔒 |
| `POST` | `/api/releases/:id/released` | 🔒 |
| `GET` | `/api/projects/:projectId/releases` | 🔒 |
| `POST` | `/api/projects/:projectId/releases` | 🔒 |
| `GET` | `/api/releases/:id/issues` | 🔒 |
| `GET` | `/api/releases/:id/sprints` | 🔒 |
| `POST` | `/api/releases/:id/sprints` | 🔒 |
| `POST` | `/api/releases/:id/sprints/remove` | 🔒 |

### saved-filters

| Метод | Путь | Доступ |
|-------|------|--------|
| `GET` | `/api/saved-filters` | 🔒 |
| `POST` | `/api/saved-filters` | 🔒 |
| `GET` | `/api/saved-filters/:id` | 🔒 |
| `PATCH` | `/api/saved-filters/:id` | 🔒 |
| `DELETE` | `/api/saved-filters/:id` | 🔒 |
| `POST` | `/api/saved-filters/:id/favorite` | 🔒 |
| `POST` | `/api/saved-filters/:id/share` | 🔒 |

### search

| Метод | Путь | Доступ |
|-------|------|--------|
| `POST` | `/api/search/issues` | 🔒 |
| `POST` | `/api/search/validate` | 🔒 |
| `GET` | `/api/search/suggest` | 🔒 |
| `POST` | `/api/search/export` | 🔒 |
| `GET` | `/api/search/schema` | 🔒 |

### Sprints

| Метод | Путь | Доступ |
|-------|------|--------|
| `GET` | `/api/sprints` | 🔒 |
| `GET` | `/api/projects/:projectId/sprints` | 🔒 |
| `GET` | `/api/sprints/:id/issues` | 🔒 |
| `GET` | `/api/projects/:projectId/backlog` | 🔒 |
| `POST` | `/api/projects/:projectId/sprints` | 🔒 |
| `PATCH` | `/api/sprints/:id` | 🔒 |
| `POST` | `/api/sprints/:id/start` | 🔒 |
| `POST` | `/api/sprints/:id/close` | 🔒 |
| `POST` | `/api/sprints/:id/issues` | 🔒 |
| `POST` | `/api/projects/:projectId/backlog/issues` | 🔒 |
| `POST` | `/api/sprints/:id/ai/estimate-all` | 🔒 |

### Teams

| Метод | Путь | Доступ |
|-------|------|--------|
| `GET` | `/api/teams` | 🔒 |
| `GET` | `/api/teams/:id` | 🔒 |
| `POST` | `/api/teams` | 🔒 |
| `PATCH` | `/api/teams/:id` | 🔒 |
| `DELETE` | `/api/teams/:id` | 🔒 |
| `PUT` | `/api/teams/:id/members` | 🔒 |

### Time Tracking

| Метод | Путь | Доступ |
|-------|------|--------|
| `POST` | `/api/issues/:issueId/time/start` | 🔒 |
| `POST` | `/api/issues/:issueId/time/stop` | 🔒 |
| `POST` | `/api/issues/:issueId/time` | 🔒 |
| `GET` | `/api/issues/:issueId/time` | 🔒 |
| `GET` | `/api/users/:userId/time` | 🔒 |
| `GET` | `/api/users/:userId/time/summary` | 🔒 |
| `GET` | `/api/time/active` | 🔒 |
| `DELETE` | `/api/time-logs/:id` | 🔒 |

### transition-screens

| Метод | Путь | Доступ |
|-------|------|--------|
| `GET` | `/api/` | 🔒 |
| `POST` | `/api/` | 🔒 |
| `GET` | `/api/:id` | 🔒 |
| `PATCH` | `/api/:id` | 🔒 |
| `DELETE` | `/api/:id` | 🔒 |
| `PUT` | `/api/:id/items` | 🔒 |

### user-groups

| Метод | Путь | Доступ |
|-------|------|--------|
| `GET` | `/api/` | 🔒 |
| `POST` | `/api/` | 🔒 |
| `GET` | `/api/:id` | 🔒 |
| `PATCH` | `/api/:id` | 🔒 |
| `GET` | `/api/:id/impact` | 🔒 |
| `DELETE` | `/api/:id` | 🔒 |
| `POST` | `/api/:id/members` | 🔒 |
| `DELETE` | `/api/:id/members/:userId` | 🔒 |
| `POST` | `/api/:id/project-roles` | 🔒 |
| `DELETE` | `/api/:id/project-roles/:projectId` | 🔒 |

### user-security

| Метод | Путь | Доступ |
|-------|------|--------|
| `GET` | `/api/users/me/security` | 🔒 |
| `GET` | `/api/admin/users/:id/security` | 🔒 |

### Users

| Метод | Путь | Доступ |
|-------|------|--------|
| `GET` | `/api/users/` | 🔒 |
| `GET` | `/api/users/:id` | 🔒 |
| `PATCH` | `/api/users/:id` | 🔒 |
| `PATCH` | `/api/users/:id/role` | 🔒 |
| `PATCH` | `/api/users/:id/deactivate` | 🔒 |

### Webhooks

| Метод | Путь | Доступ |
|-------|------|--------|
| `POST` | `/api/webhooks/gitlab` | — |

### workflow-engine

| Метод | Путь | Доступ |
|-------|------|--------|
| `GET` | `/api/issues/:id/transitions` | 🔒 |
| `POST` | `/api/issues/:id/transitions` | 🔒 |
| `POST` | `/api/issues/batch-transitions` | 🔒 |

### workflow-schemes

| Метод | Путь | Доступ |
|-------|------|--------|
| `GET` | `/api/` | 🔒 |
| `POST` | `/api/` | 🔒 |
| `GET` | `/api/:id` | 🔒 |
| `PUT` | `/api/:id` | 🔒 |
| `DELETE` | `/api/:id` | 🔒 |
| `PUT` | `/api/:id/items` | 🔒 |
| `POST` | `/api/:id/projects` | 🔒 |
| `DELETE` | `/api/:id/projects/:projectId` | 🔒 |

### workflows

| Метод | Путь | Доступ |
|-------|------|--------|
| `GET` | `/api/` | 🔒 |
| `POST` | `/api/` | 🔒 |
| `GET` | `/api/:id` | 🔒 |
| `PATCH` | `/api/:id` | 🔒 |
| `DELETE` | `/api/:id` | 🔒 |

### workflows

| Метод | Путь | Доступ |
|-------|------|--------|
| `GET` | `/api/` | 🔒 |
| `POST` | `/api/` | 🔒 |
| `GET` | `/api/:id` | 🔒 |
| `PUT` | `/api/:id` | 🔒 |
| `DELETE` | `/api/:id` | 🔒 |
| `POST` | `/api/:id/copy` | 🔒 |
| `GET` | `/api/:id/validate` | 🔒 |
| `POST` | `/api/:id/steps` | 🔒 |
| `PATCH` | `/api/:id/steps/:stepId` | 🔒 |
| `DELETE` | `/api/:id/steps/:stepId` | 🔒 |
| `GET` | `/api/:id/transitions` | 🔒 |
| `POST` | `/api/:id/transitions` | 🔒 |
| `PUT` | `/api/:id/transitions/:tid` | 🔒 |
| `DELETE` | `/api/:id/transitions/:tid` | 🔒 |
<!-- AUTO-GENERATED:END -->

---

## TTMP-160 — Release Checkpoints & Burndown (manual section)

> These endpoints are documented manually because the auto-generator flattens them into the
> `/api/:id/...` shape. Last updated: 2026-04-19.

### Admin — типы и шаблоны КТ

| Метод | Путь | Доступ |
|-------|------|--------|
| `GET`  | `/api/admin/checkpoint-types` | `SUPER_ADMIN` / `ADMIN` / `RELEASE_MANAGER` |
| `POST` | `/api/admin/checkpoint-types` | ↑ |
| `PATCH`| `/api/admin/checkpoint-types/:id` | ↑ |
| `DELETE`| `/api/admin/checkpoint-types/:id` | ↑ |
| `GET`  | `/api/admin/checkpoint-types/:id/instances` | ↑ (FR-15) |
| `POST` | `/api/admin/checkpoint-types/:id/sync-instances` | ↑ (FR-15) |
| `GET`  | `/api/admin/checkpoint-templates` | ↑ |
| `POST` | `/api/admin/checkpoint-templates` | ↑ |
| `PATCH`| `/api/admin/checkpoint-templates/:id` | ↑ |
| `DELETE`| `/api/admin/checkpoint-templates/:id` | ↑ |
| `POST` | `/api/admin/checkpoint-templates/:id/clone` | ↑ |

### Релиз-скоуп (чтение — любой с `RELEASES_VIEW`; мутации — `RELEASES_EDIT`)

| Метод | Путь | Доступ |
|-------|------|--------|
| `GET` | `/api/releases/:releaseId/checkpoints` | release-read |
| `GET` | `/api/releases/:releaseId/checkpoints/matrix[?format=csv]` | release-read (FR-26 / FR-27) |
| `POST`| `/api/releases/:releaseId/checkpoints` body `{ checkpointTypeIds: string[] }` | release-mutate |
| `POST`| `/api/releases/:releaseId/checkpoints/apply-template` body `{ templateId }` | release-mutate |
| `POST`| `/api/releases/:releaseId/checkpoints/preview-template` body `{ templateId }` | release-read (FR-14) |
| `POST`| `/api/releases/:releaseId/checkpoints/recompute` | release-mutate |
| `DELETE`| `/api/releases/:releaseId/checkpoints/:checkpointId` | release-mutate |
| `POST`| `/api/admin/checkpoint-templates/bulk-apply` body `{ templateId, releaseIds: string[] }` | `SUPER_ADMIN` / `ADMIN` / `RELEASE_MANAGER`; ответ `207 Multi-Status` с per-release partition (FR-21) |

### Задача

| Метод | Путь | Доступ |
|-------|------|--------|
| `GET` | `/api/issues/:issueId/checkpoints` | issue-read (ISSUES_VIEW или global read-role) |
| `GET` | `/api/issues/:issueId/checkpoint-events` | issue-read (FR-22) |

### User/project-scoped summaries

| Метод | Путь | Доступ |
|-------|------|--------|
| `GET` | `/api/projects/:projectId/checkpoint-violating-issues` | project-read |
| `GET` | `/api/my-checkpoint-violations` | authenticated (SEC-7: assignee + project-membership) |
| `GET` | `/api/my-checkpoint-violations/count` | ↑ |

### Аудит

| Метод | Путь | Доступ |
|-------|------|--------|
| `GET` | `/api/admin/checkpoint-audit[?format=csv]` | `SUPER_ADMIN` / `ADMIN` / `AUDITOR` (SEC-6 / SEC-9) |

### Burndown

| Метод | Путь | Доступ |
|-------|------|--------|
| `GET` | `/api/releases/:releaseId/burndown?metric=issues\|hours\|violations&from=YYYY-MM-DD&to=YYYY-MM-DD` | release-read (FR-29) |
| `POST`| `/api/releases/:releaseId/burndown/backfill` body `{ date?: YYYY-MM-DD }` | `SUPER_ADMIN` / `ADMIN` only (SEC-8 / FR-31) |

**Response shape (`GET /burndown`):**

```json
{
  "releaseId": "...",
  "metric": "issues",
  "plannedDate": "2026-06-01",
  "releaseDate": null,
  "initial": { "date": "2026-05-01", "total": 20, "done": 2, "open": 18, "cancelled": 0, ... },
  "series": [{ "date": "2026-05-01", ... }, ...],
  "idealLine": [{ "date": "2026-05-01", "value": 18 }, ..., { "date": "2026-06-01", "value": 0 }]
}
```

CSV экспорт матрицы и аудита использует UTF-8 BOM + CRLF — читается в Excel с кириллицей без мусора (FR-23 / FR-27 / SEC-9).

