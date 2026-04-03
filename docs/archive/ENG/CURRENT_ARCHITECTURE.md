# Flow Universe MVP — Current Architecture

**Document purpose:** Snapshot of the existing codebase for migration and architecture proposal.  
**Date:** March 2025

---

## 1. Stack Summary

| Layer | Technology | Notes |
|-------|------------|--------|
| **Backend** | Node.js (≥18) + Express 4.x | Single process, no framework beyond Express |
| **Database** | PostgreSQL | Via `pg` driver, no ORM |
| **API** | REST | JSON request/response, no versioning prefix |
| **Auth** | JWT (Bearer + HttpOnly cookie) | bcryptjs for passwords, jsonwebtoken |
| **Frontend** | Vanilla HTML/CSS/JS | No build step, no React/Vue/Svelte |
| **State (frontend)** | None (ad-hoc) | DOM + global variables, `localStorage` for token |
| **Infrastructure** | Ubuntu VPS, Nginx, systemd | Single server, Node serves API + static files |

---

## 2. Backend

- **Entry:** `backend/server.js` — single file (~860 lines) containing all routes, middleware, and business logic.
- **DB access:** `backend/db.js` — `pg.Pool` with `query(text, params)` and `getClient()` for transactions.
- **Audit:** `backend/audit.js` — `audit({ userId, action, entityType, entityId, level, details, req })` writes to `audit_log`.
- **Schema:** `backend/schema.sql` — idempotent DDL (CREATE IF NOT EXISTS, ADD COLUMN IF NOT EXISTS); applied via `scripts/init-db.js`.
- **No ORM:** Raw SQL only; no Prisma, TypeORM, Knex, or Sequelize.

**API style:** REST. All endpoints under `/api/*`. Auth required except `/api/auth/register`, `/api/auth/login`, `/health`. No OpenAPI/Swagger; docs in `docs/API.md`.

---

## 3. Frontend

- **Entry points:** `frontend/index.html` (login), `frontend/app.html` (main SPA), `frontend/admin.html` (admin panel).
- **Main app:** `app.html` is a single file (~2200 lines) with inline CSS and JavaScript: routing by hash or section visibility, `apiFetch(path, options)` for all API calls, token from `localStorage` + `Authorization: Bearer`, `credentials: 'include'` for cookies.
- **No build:** No Vite, Webpack, or npm scripts for frontend; static files served by Express from `frontend/`.
- **State:** No Redux/Zustand/Context; data loaded per view (e.g. `loadTasks()`, `apiFetch('/api/dashboard/main')`) and kept in module-level variables; UI updated by direct DOM manipulation.

---

## 4. Database

- **Engine:** PostgreSQL (16 on current deploy).
- **Connection:** Pool in `db.js`; env: `PG_HOST`, `PG_PORT`, `PG_DATABASE`, `PG_USER`, `PG_PASSWORD`.
- **Migrations:** No migration runner; schema evolved via additive, idempotent SQL in `schema.sql` (e.g. `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS project_id ...`). Backward compatibility handled in code (e.g. fallback queries when `project_id` column is missing).

**Tables (current):**

- `users` — id, email, password_hash, name, role, is_blocked, created_at, updated_at
- `tasks` — flat tasks; id, title, description, type, priority, status, assignee_id, creator_id, estimated_hours, project_id, created_at, updated_at
- `time_logs` — task_id, task_item_id (optional), user_id, started_at, ended_at, duration_minutes
- `audit_log` — user_id, action, entity_type, entity_id, level, details (JSONB), ip, user_agent, created_at
- `projects` — id, name, description, project_type, business_goal, budget, planned_revenue, owner_id, status, created_at, updated_at
- `product_teams` — id, name, description, lead_id, status, created_at
- `product_team_members` — team_id, user_id, role (PK)
- `business_functions` — id, name, description, created_at
- `task_items` — hierarchical (epic/story/subtask); id, parent_id, level, order_index, title, description, acceptance_criteria, context_type, context_id, type, priority, status, story_points, estimated_hours, assignee_id, creator_id, reviewer_id, created_at, updated_at
- `task_item_links` — task_id, task_item_id, link_type (links flat `tasks` to `task_items`)

---

## 5. Auth Implementation

- **Registration:** POST `/api/auth/register` — email, password, name [, role]; returns user + JWT.
- **Login:** POST `/api/auth/login` — email, password; sets HttpOnly cookie (`tasktime_token`) and returns user + token. Blocked users get 403.
- **Verification:** Middleware reads `Authorization: Bearer <token>` or cookie; validates JWT; sets `req.user = { id, email, role }`.
- **Roles:** admin, super-admin, manager, cio, viewer, user. RBAC: user sees only own/assigned tasks; admin/manager full CRUD; cio/viewer read-only; super-admin for admin user management.
- **Impersonation:** POST `/api/auth/impersonate` (admin/super-admin only) returns a short-lived token for another user.

---

## 6. Infrastructure Assumptions

- **Deploy:** Git clone to server, run from `backend/` (e.g. `node server.js` or `node --watch server.js`); Nginx reverse proxy to Node; systemd unit for the process.
- **Static:** Express serves `/`, `/app`, `/admin`, and static assets from `frontend/` (no separate CDN in current docs).
- **Database:** PostgreSQL on same host or reachable host; no read replicas or connection pooler (e.g. PgBouncer) documented.
- **Secrets:** `.env` (JWT_SECRET, PG_*, etc.); not in repo.

---

## 7. Current Architecture (High-Level)

```
                    ┌─────────────────────────────────────────┐
                    │              Nginx (reverse proxy)        │
                    └─────────────────────┬───────────────────┘
                                          │
                    ┌─────────────────────▼───────────────────┐
                    │  Node.js (Express) — backend/server.js   │
                    │  • REST /api/*                           │
                    │  • Serves frontend/* (/, /app, /admin)   │
                    │  • JWT + cookie auth                     │
                    └─────────────────────┬───────────────────┘
                                          │
         ┌───────────────────────────────┼───────────────────────────────┐
         │                               │                               │
         ▼                               ▼                               ▼
  ┌──────────────┐              ┌──────────────┐              ┌──────────────┐
  │  db.js       │              │  audit.js    │              │  frontend/    │
  │  pg.Pool     │              │  audit_log   │              │  *.html       │
  └──────┬───────┘              └──────┬───────┘              └──────────────┘
         │                             │
         ▼                             ▼
  ┌──────────────────────────────────────────┐
  │           PostgreSQL                     │
  │  users, tasks, time_logs, audit_log,     │
  │  projects, product_teams, task_items, …  │
  └──────────────────────────────────────────┘
```

**Characteristics:**

- **Monolith:** One Node process; all API and static serving in one app.
- **No module boundaries:** Routes, permission checks, and SQL live in `server.js`; shared helpers in `db.js` and `audit.js`.
- **Dual task model:** Flat `tasks` (with optional project_id) and hierarchical `task_items` (epic → story → subtask) linked via `task_item_links`; API exposes both and some flows use both (e.g. “create story from task”).
- **Idempotent schema:** Single `schema.sql` with conditional DDL; no versioned migration history.

---

## 8. Technical Debt & Risks (Summary)

- **Single-file backend:** Hard to navigate and test; any change touches one large file.
- **No ORM/query layer:** Raw SQL and manual fallbacks for missing columns increase risk of inconsistencies and make refactors heavier.
- **Frontend monolith:** One large HTML file; no components or shared state; difficult to scale UI and onboard AI/developers.
- **No organizations:** Multi-tenancy not modeled; all users/projects/teams in one global space.
- **Missing Jira-like concepts:** No first-class boards, columns, sprints, comments, or labels; status/type are freeform or enum in code.
- **No API versioning:** Breaking changes would affect all clients.
- **Deploy:** No containerization (e.g. Docker) or CI/CD pipeline described in current docs; manual deploy steps in DEPLOY.md.

This document is the baseline for the architecture proposal and migration plan.
