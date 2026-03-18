# Flow Universe — Repository Restructure Plan

**Purpose:** Target repository layout and how to migrate existing code without a big-bang rewrite.  
**Date:** March 2025

---

## 1. Target Structure (Phased)

### Phase 1 — Keep single deployable, add backend modules

Keep current top-level layout; restructure only under `backend/`:

```
tasktime-mvp/
  backend/
    server.js
    db.js
    config.js
    shared/
      auth.js
      audit.js
      errors.js
    modules/
      auth/
      users/
      projects/
      issues/
      ...
    scripts/
    schema.sql
  frontend/
    index.html
    app.html
    admin.html
  docs/
  .cursor/
  ...
```

No `/apps` or `/packages` yet; one repo, one Node app, one frontend folder.

### Phase 2 (Optional) — Monorepo with apps/packages

Only if you later need e.g. shared TypeScript types or a separate admin app:

```
tasktime-mvp/
  apps/
    web/                 # Main SPA (current frontend)
    api/                  # Node API (current backend)
  packages/
    database/             # Schema, migrations, shared client (if extracted)
    config/               # Shared env/constants
  modules/                # Shared domain modules used by api (or in api/)
    auth/
    users/
    ...
  docs/
```

**Recommendation for MVP:** Stay with **Phase 1**. Phase 2 can follow when you have a clear need (e.g. second app or shared package).

---

## 2. Phase 1 — Detailed Target

```
backend/
  server.js                 # Express: use(json), use(cookieParser), use('/api/auth', authApi), ...
  db.js                     # unchanged
  config.js                 # from process.env
  shared/
    auth.js                 # authMiddleware, adminMiddleware, requireRole
    audit.js                # audit(...)
    errors.js               # class AppError, NotFound, Forbidden, BadRequest
  modules/
    auth/
      api.js                # router: POST login, register, logout, me, impersonate
      service.js
      repository.js
    users/
      api.js                # GET /users, admin routes for users
      service.js
      repository.js
    projects/
      api.js
      service.js
      repository.js
    issues/
      api.js
      service.js
      repository.js
    comments/
      api.js
      service.js
      repository.js
    boards/
      api.js
      service.js
      repository.js
    sprints/
      api.js
      service.js
      repository.js
    time/
      api.js
      service.js
      repository.js
    audit/
      api.js                # GET activity (admin)
      repository.js
    admin/
      api.js                # stats, deploys, etc.
      service.js
  scripts/
    init-db.js
    seed.js
  schema.sql
  .env.example
```

Static serving stays in `server.js`: serve `frontend/` for `/`, `/app`, `/admin`, and static files.

---

## 3. Migrating Existing Code

### 3.1 Extract shared first

- **shared/auth.js** — Move JWT verify logic and `authMiddleware`, `adminMiddleware`, role helpers (`canReadTask`, `isAdminOrManager`, etc.) from server.js. Export middleware and helpers.
- **shared/audit.js** — Move current `backend/audit.js` into `shared/audit.js` (or keep file, re-export from shared for consistency).
- **shared/errors.js** — Add small helpers that set status and message; global error handler in server.js catches and sends JSON.

### 3.2 One module at a time

Order suggested (by dependency and risk):

1. **auth** — Routes: `/api/auth/*`. Move register, login, logout, me, impersonate. Depends: users repository (for find by email, create user). No other module depends on auth internals; others only use shared auth middleware.
2. **users** — Routes: `GET /api/users`; later move admin user list/patch here. Depends: nothing else.
3. **projects** — Routes: `GET/POST /api/projects`, `GET /api/projects/:id`. Depends: users (owner_name).
4. **issues** — Largest. Start with “issues” = current `tasks` + `task_items` concept: either keep both tables and wrap in one service, or migrate to single `issues` table later. Routes: tasks + task-items CRUD, status patch, task-links. Depends: users, projects.
5. **time** — Routes: time/start, time/stop, time-logs. Depends: issues (or tasks) for permission check.
6. **boards** — New or from “project board” logic; define columns. Depends: projects.
7. **sprints** — New. Depends: projects, issues.
8. **comments** — New. Depends: issues, users.
9. **teams** — Current product-teams + product_team_members. Routes: teams, members. Depends: users.
10. **audit** — Read-only activity for admin. Repository: query audit_log.
11. **admin** — Stats, users list, activity, deploys. Uses auth (adminMiddleware), audit, users.

For each module:

- Create `modules/<name>/api.js`, `service.js`, `repository.js`.
- Copy the relevant route handlers from server.js into api.js (thin: parse req, call service, res.json).
- Move SQL and data logic into repository; move permission and orchestration into service.
- In server.js, replace the block with: `app.use('/api/<name>', require('./modules/<name>/api')(app))` or pass `app` and let api attach routes.

### 3.3 Keep server.js thin

After migration, server.js should:

- Load config, db, shared middleware.
- Mount `express.json()`, `cookieParser()`.
- Mount route modules: `app.use('/api/auth', authApi)`, etc.
- Serve static and SPA routes (`/`, `/app`, `/admin`).
- Register global error handler.
- Start listen.

All business logic lives in modules.

### 3.4 Frontend

- **Phase 1:** No structural change. Keep `frontend/index.html`, `app.html`, `admin.html`. Optionally split `app.html` into multiple JS files (e.g. `app.js`, `features/dashboard.js`, `features/issues.js`) loaded via script tags; same entry point.
- **Later:** Move to feature-based folders (e.g. `frontend/features/issues/`, `frontend/components/`) when introducing a build step or framework.

---

## 4. File Moves Summary

| Current | Target |
|---------|--------|
| server.js (auth routes) | modules/auth/api.js + service.js + repository.js |
| server.js (user list) | modules/users/... |
| server.js (projects) | modules/projects/... |
| server.js (tasks + task-items + task-links) | modules/issues/... (or keep tasks + task_items and name module “tasks” then rename to “issues” after schema merge) |
| server.js (time logs) | modules/time/... |
| server.js (product-teams) | modules/teams/... |
| server.js (business-functions) | Drop or move to projects/labels later |
| server.js (dashboard, admin) | modules/admin/... + modules/audit for activity |
| audit.js | shared/audit.js |
| db.js | backend/db.js (unchanged) |

---

## 5. Risk Mitigation

- **Incremental:** One module per PR; feature flags or route coexistence (old and new route for a while) if needed.
- **Tests:** Add minimal integration tests per module (e.g. “POST /api/auth/login returns 200 and token”) before moving code; run after each move.
- **Rollback:** Each step is a refactor; no DB contract change in Phase 1. Revert commit if something breaks.
- **Documentation:** Update docs/API.md and cursorrules when routes move; keep DEPLOYMENT_STEPS.md in sync.

This plan is the basis for the detailed MIGRATION_PLAN.md (phases, order, and safety checks).
