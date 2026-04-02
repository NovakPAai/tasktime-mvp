# API Reference

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

## Issues

### `GET /api/projects/:projectId/issues`

List issues for a project. Supports filtering and pagination.

**Authorization:** any authenticated role

**Query parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `page` | integer | Page number (default: 1) |
| `limit` | integer | Items per page (default: 100, max: 500) |
| `status` | string[] | Filter by status: `OPEN`, `IN_PROGRESS`, `REVIEW`, `DONE`, `CANCELLED` |
| `type` | string[] | Filter by type: `EPIC`, `STORY`, `TASK`, `SUBTASK`, `BUG` |
| `priority` | string[] | Filter by priority: `CRITICAL`, `HIGH`, `MEDIUM`, `LOW` |
| `assigneeId` | string | Filter by assignee ID; use `UNASSIGNED` for unassigned issues |
| `sprintId` | string | Filter by sprint ID; use `BACKLOG` for backlog issues |
| `from` | ISO date | Filter `createdAt >= from` |
| `to` | ISO date | Filter `createdAt <= to` |
| `search` | string | Full-text search on `title` and `description` |

**Response:** `PaginatedResponse<Issue>`

```json
{
  "data": [
    {
      "id": "uuid",
      "number": 42,
      "title": "...",
      "status": "OPEN",
      "type": "TASK",
      "priority": "HIGH",
      "assignee": { "id": "uuid", "name": "Ivan" },
      "creator": { "id": "uuid", "name": "Admin" },
      "_count": { "children": 2 },
      "createdAt": "2026-04-02T00:00:00.000Z",
      "updatedAt": "2026-04-02T00:00:00.000Z"
    }
  ],
  "meta": { "page": 1, "limit": 100, "total": 342, "totalPages": 4 }
}
```

---

## Sprints

### `GET /api/projects/:projectId/sprints`

List sprints for a project.

**Authorization:** any authenticated role

**Query parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `page` | integer | Page number (default: 1) |
| `limit` | integer | Items per page (default: 100, max: 500) |

**Response:** `PaginatedResponse<SprintWithStats>`

---

### `GET /api/sprints`

List all sprints across all projects. Supports filtering and pagination.

**Authorization:** any authenticated role

**Query parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `state` | string | Filter by sprint state: `PLANNED`, `ACTIVE`, `CLOSED` |
| `projectId` | string | Filter by project ID |
| `teamId` | string | Filter by team ID (matches any of `projectTeamId`, `businessTeamId`, `flowTeamId`) |
| `page` | integer | Page number (default: 1) |
| `limit` | integer | Items per page (default: 100, max: 500) |

**Response:** `PaginatedResponse<SprintWithStats>`

---

### `GET /api/projects/:projectId/backlog`

List backlog issues (issues not assigned to any sprint) for a project.

**Authorization:** any authenticated role

**Query parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `page` | integer | Page number (default: 1) |
| `limit` | integer | Items per page (default: 100, max: 500) |

**Response:** `PaginatedResponse<Issue>`

---

## Admin

### `GET /api/admin/users`

List all users with metadata (issue counts, time log counts).

**Authorization:** `ADMIN` role required

**Query parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `page` | integer | Page number (default: 1) |
| `limit` | integer | Items per page (default: 100, max: 500) |

**Response:** `PaginatedResponse<AdminUser>`

```json
{
  "data": [
    {
      "id": "uuid",
      "email": "user@example.com",
      "name": "Ivan Petrov",
      "role": "USER",
      "isActive": true,
      "createdAt": "2026-01-15T10:00:00.000Z",
      "_count": {
        "createdIssues": 12,
        "assignedIssues": 34,
        "timeLogs": 56
      }
    }
  ],
  "meta": { "page": 1, "limit": 100, "total": 28, "totalPages": 1 }
}
```
