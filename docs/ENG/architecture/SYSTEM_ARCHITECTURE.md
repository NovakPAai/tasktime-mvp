# Flow Universe — System Architecture (Final Summary)

**Purpose:** Single entry point for architecture: diagram, domain model, module layout, and migration roadmap. Start here for any architecture understanding or MVP implementation.  
**Date:** March 2025

---

## 1. Architecture Diagram (Target)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Client (Browser)                               │
│  frontend/index.html  │  frontend/app.html  │  frontend/admin.html     │
│  (login)              │  (SPA: board, backlog, projects, …)            │
│                       │  apiFetch() → /api/*  │  (admin panel)          │
└─────────────────────────────────────────────────────────────────────────┘
                                        │
                                        │ HTTPS (JWT Bearer or cookie)
                                        ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     Nginx (reverse proxy, static optional)                │
└─────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     Node.js (Express) — backend/server.js                │
│  • express.json(), cookieParser()                                        │
│  • Mount: /api/auth, /api/users, /api/projects, /api/issues, …          │
│  • Serve: /, /app, /admin, static from frontend/                         │
│  • Global error handler                                                  │
└─────────────────────────────────────────────────────────────────────────┘
         │                │                │                │
         ▼                ▼                ▼                ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ shared/      │  │ modules/     │  │ modules/     │  │ modules/     │
│ auth.js      │  │ auth/        │  │ issues/      │  │ boards/      │
│ audit.js     │  │ users/       │  │ comments/    │  │ sprints/     │
│ errors.js    │  │ projects/    │  │ time/        │  │ teams/       │
│              │  │              │  │ audit/       │  │ admin/       │
└──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘
       │                 │                 │                 │
       │                 └─────────────────┼─────────────────┘
       │                                   │
       ▼                                   ▼
┌──────────────┐                  ┌──────────────────────────────────────┐
│ backend/db.js│                  │           PostgreSQL                  │
│ pg.Pool      │◄─────────────────│  users, issues, projects, comments,   │
└──────────────┘                  │  sprints, boards, board_columns,      │
                                  │  labels, time_logs, audit_log, …      │
                                  └──────────────────────────────────────┘
```

**Current state:** Single server.js with all routes; no modules yet. Diagram above is the **target** after Phase 1 migration.

---

## 2. Domain Model (Target MVP)

- **Organization** (optional) — Tenant; has Users, Teams, Projects.
- **User** — Auth, role; assignee/creator on issues; member of teams.
- **Team** — Product team; members (user + role); can be linked to projects.
- **Project** — Container for issues, one default board, backlog, sprints.
- **Issue** — Single work unit; project_id, type, status, assignee, optional sprint_id, parent_id (hierarchy).
- **Comment** — On issue; author, body.
- **Sprint** — Time-box; project_id; issues have sprint_id.
- **Board** — Project has board(s); columns (status_key, order, wip_limit).
- **BoardColumn** — Part of board; maps to status; issues grouped by status.
- **Label** — Project-scoped; many-to-many with issues.
- **TimeLog** — Links to issue (or task); user, started_at, ended_at, duration.
- **AuditLog** — Append-only; action, entity_type, entity_id, details.

See **MVP_DOMAIN_MODEL.md** for ER diagram and relationships.

---

## 3. Module Layout (Target)

| Module    | Responsibility                    | Key API (examples)                          |
|-----------|-----------------------------------|---------------------------------------------|
| auth      | Login, register, JWT, impersonate  | POST /api/auth/login, /register, GET /me    |
| users     | User list, admin user CRUD        | GET /api/users, PATCH /api/admin/users/:id |
| projects  | Project CRUD                      | GET/POST /api/projects, GET /api/projects/:id |
| issues    | Issue CRUD, status, reorder       | GET/POST/PUT/PATCH/DELETE /api/issues/*     |
| comments  | Comments on issues               | GET/POST /api/issues/:id/comments          |
| boards    | Board + columns                  | GET /api/projects/:id/board                 |
| sprints   | Sprint CRUD, assign issues       | GET/POST /api/projects/:id/sprints         |
| time      | Time log start/stop, list        | POST /api/issues/:id/time/start|stop        |
| teams     | Teams and members                | GET/POST /api/teams, …/members             |
| audit     | Read activity (admin)            | GET /api/admin/activity                     |
| admin     | Stats, users, deploys            | GET /api/admin/stats, /users, /deploys      |

Each module: **api.js** (routes) → **service.js** (logic) → **repository.js** (SQL). No cross-module repository imports.

See **REPO_RESTRUCTURE_PLAN.md** for folder structure and migration steps.

---

## 4. Migration Roadmap

| Phase | What | Risk  | Outcome |
|-------|------|-------|---------|
| **0** | Shared auth, errors, audit, config | Low   | Prep for modules |
| **1** | Extract modules (auth, users, projects, tasks, time, teams, admin) | Low   | server.js thin; feature modules in place |
| **2** | New domain: comments, sprints, boards, labels | Medium | New tables + APIs; no removal |
| **3** | Unify tasks + task_items → issues | High  | Single Issue model; migration script |
| **4** | Frontend structure; optional org | Low–Med | Maintainable UI; optional multi-tenant |

**Constraint:** No deploy without explicit user confirmation. Each phase is deployable and testable.

---

## 5. Document Index (MVP — single entry point)

This document is the **single entry point** for architecture. For MVP implementation only the following are required:

| Document | Purpose |
|----------|---------|
| **SYSTEM_ARCHITECTURE.md** | This document — diagram, domain summary, modules, roadmap |
| **MVP_DOMAIN_MODEL.md** | Target entities, ER diagram, relationships |
| **REPO_RESTRUCTURE_PLAN.md** | Target folder structure, how to migrate code into modules |
| **ISSUE_ENGINE.md** | Issue lifecycle, statuses, board, sprint, history |
| **FRONTEND_UI_ARCHITECTURE.md** | Frontend UI: layout, pages, design system, components, API mapping |

Other architecture and planning documents (CURRENT_ARCHITECTURE, DOMAIN_MODEL, ARCHITECTURE_PROPOSAL, MIGRATION_PLAN, PERFORMANCE_PLAN, KANBAN_ARCHITECTURE, AI_AGENTS, CURSOR_RULES) have been moved to **docs/archive/** (ENG and RU). See **docs/ARCHITECTURE_HISTORY.md** for what was archived and why.

---

## 6. Principles (Recap)

- **Simplicity over flexibility** — MVP first; extend later.
- **Developer velocity** — Clear modules and rules; AI-friendly.
- **Modular monolith** — One deployable; strict boundaries.
- **Safe migration** — Incremental; no big-bang; backward compatibility until explicit change.
- **No overengineering** — No microservices, no heavy framework for MVP.

This document is the entry point for architecture decisions and implementation planning.
