# Flow Universe — Cursor AI Development Rules

**Purpose:** Rules to improve AI (Cursor) productivity: naming, structure, typing, API, components, DB access. Use as reference and merge into `.cursor/rules/` or `cursorrules` as needed.  
**Date:** March 2025

---

## 1. Naming Conventions

### Backend (Node/Express)

- **Files:** `api.js`, `service.js`, `repository.js` per module; `kebab-case.js` for multi-word helpers (e.g. `board-columns.js`).
- **Functions (repository):** `getById(id)`, `list(filters)`, `create(data)`, `update(id, data)`, `remove(id)`. Prefer one entity per repository.
- **Functions (service):** Verb + entity: `createIssue`, `updateIssueStatus`, `listIssuesByProject`, `addCommentToIssue`.
- **Routes:** REST: resource plural, id in path. `GET /api/issues`, `GET /api/issues/:id`, `POST /api/issues`, `PUT /api/issues/:id`, `PATCH /api/issues/:id/status`, `DELETE /api/issues/:id`.
- **Variables:** `camelCase`. Constants (env, config): `UPPER_SNAKE` or `camelCase` in config object.
- **Request/response:** Prefer same shape as in docs/API.md; use `snake_case` in JSON for DB alignment (or `camelCase` if frontend expects it — pick one and document).

### Frontend (Vanilla JS / future framework)

- **IDs and classes:** `kebab-case` (e.g. `#main-dashboard`, `.issue-card`).
- **Data attributes:** `data-*` for state: `data-issue-id`, `data-column-id`.
- **Functions:** `camelCase`: `loadIssues()`, `renderBoard()`, `openIssueModal(id)`.
- **API client:** Single helper e.g. `apiFetch(path, options)`; path always starts with `/api/`.

### Database

- **Tables:** `snake_case`, plural: `users`, `issues`, `board_columns`.
- **Columns:** `snake_case`: `created_at`, `assignee_id`, `project_id`.
- **Indexes:** `idx_<table>_<column(s)>`: `idx_issues_project_id`, `idx_issues_sprint_id`.

---

## 2. Folder Structure

### Backend (after restructure)

```
backend/
  server.js
  db.js
  config.js
  shared/
    auth.js
    audit.js
    errors.js
  modules/
    <module>/
      api.js
      service.js
      repository.js
  scripts/
  schema.sql
```

- **One module = one feature (auth, users, projects, issues, etc.).**
- **Do not** put all routes in one file; do not import another module’s `repository.js` from a different module (use service).

### Frontend (current and near-term)

```
frontend/
  index.html    # Login
  app.html      # Main SPA
  admin.html    # Admin panel
  (optional) js/
    api.js
    router.js
    features/
      dashboard.js
      issues.js
```

- **Rule:** When adding a feature, prefer adding to the appropriate section in `app.html` or a dedicated script in `js/features/`; avoid one 3000+ line file when possible.

---

## 3. Typing and Contracts

- **No TypeScript required for MVP.** Use JSDoc for public APIs so AI and humans see contracts.
- **Service functions:** Document params and return:
  ```js
  /**
   * @param {number} projectId
   * @param {{ status?: string, assigneeId?: number }} filters
   * @returns {Promise<Array<{ id: number, title: string, status: string, ... }>>}
   */
  async function listIssues(projectId, filters) { ... }
  ```
- **API layer:** Document expected body and response in a short comment or in docs/API.md. Keep request validation in one place (e.g. check required fields before calling service).

---

## 4. API Contracts

- **Base URL:** `/api`. No version prefix in MVP; add `/v1` when introducing breaking changes.
- **Auth:** All routes except `/api/auth/login`, `/api/auth/register`, `/health` require `Authorization: Bearer <JWT>` or valid HttpOnly cookie.
- **Responses:**
  - Success: `200`/`201` with JSON body (resource or array). No wrapper like `{ data: ... }` unless already used everywhere (see cursorrules).
  - Error: `4xx`/`5xx` with JSON `{ error: "message" }` (and optional `code` for client handling).
- **Idempotency:** PUT and DELETE are idempotent; POST is not. Use same path and method for “update” (PUT or PATCH).
- **Lists:** Support `?limit=&offset=` or `?page=&limit=`; document in API.md. Default limit (e.g. 20), max limit (e.g. 100).
- **Do not** accept `role` or sensitive fields from request body; use `req.user` from JWT only.

---

## 5. Component Patterns (Frontend)

- **One feature, one render function:** e.g. `renderBoard(projectId)`, `renderIssueList(issues)`, `renderIssueDetail(issue)`. Call `apiFetch` inside or pass data from parent.
- **Modals:** Single modal container; show/hide by class or attribute; content filled from current selection (e.g. `data-issue-id`). Avoid many modal copies in DOM.
- **Lists:** Prefer one container element and innerHTML or repeated template; for large lists use pagination or virtual scroll (see PERFORMANCE_PLAN.md).
- **State:** Keep minimal: current user, current project/board, open modal id. Prefer re-fetch after mutation (e.g. after PATCH status, call `loadBoard()` again) unless you add optimistic updates explicitly.

---

## 6. Database Access

- **Always** use the shared pool: `const { query, getClient } = require('../db')` or passed from app. **Never** create a new `pg.Pool` or connection in a module.
- **Repositories only:** SQL lives in `repository.js`; no raw SQL in `api.js` or `service.js`. Service calls repository and may call other services.
- **Parameters:** Use parameterized queries only: `query('SELECT * FROM issues WHERE project_id = $1', [projectId])`. Never concatenate user input into SQL.
- **Schema changes:** All DDL in `schema.sql`; idempotent (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`). New migrations: add a short comment and run init-db or migration script; document in DEPLOYMENT_STEPS.md.
- **Audit:** On every create/update/delete of a business entity, call `audit({ userId: req.user.id, action: 'entity.action', entityType, entityId, req })` (see existing audit.js).

---

## 7. Security (Recap)

- **Auth:** Validate JWT (or cookie) in middleware; set `req.user`. Never trust `role` or `user_id` from body.
- **RBAC:** Check permissions in **service** layer (or shared helper): e.g. user can only see own/assigned issues unless admin/manager.
- **Input:** Validate required fields and types in API layer; reject invalid input with 400.

---

## 8. What Not to Do (AI Guidance)

- Do not add a new ORM or change DB driver without a documented decision.
- Do not add cross-module repository imports; use service-to-service.
- Do not duplicate auth or audit logic; use shared middleware and audit().
- Do not change existing API response shape without updating docs/API.md and frontend.
- Do not deploy without explicit user confirmation (per project rules).

---

Use this document together with the existing `cursorrules` and `.cursor/rules/`; merge or reference these rules so Cursor and AI agents follow the same structure and conventions.
