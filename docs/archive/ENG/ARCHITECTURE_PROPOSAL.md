# Flow Universe — Modular Monolith Architecture Proposal

**Purpose:** Propose a clean, AI-friendly backend and app structure optimized for fast, vibe-style development.  
**Date:** March 2025

---

## 1. Principles

- **Feature-based modules** — Code grouped by domain (auth, users, projects, issues, etc.), not by layer (all routes, all services).
- **Strict module boundaries** — Modules expose a small public API (services); no cross-import of repositories or internals.
- **Layered within each module** — API (HTTP) → Service → Repository → DB. DTOs at boundaries.
- **Simplicity over flexibility** — One tech stack, one deployable; avoid microservices for MVP.
- **AI-friendly** — Predictable paths, naming, and patterns so agents can navigate and change code safely.

---

## 2. Module List and Responsibilities

| Module | Responsibility | Key entities |
|--------|----------------|--------------|
| **auth** | Login, register, logout, JWT issue/verify, impersonation, password hash | — |
| **users** | User CRUD, list, roles, block/unblock; used by auth and admin | User |
| **organizations** | Org CRUD (optional MVP); tenant scope | Organization |
| **teams** | Team CRUD, members add/remove | Team, TeamMember |
| **projects** | Project CRUD, settings; entry point for boards/backlog | Project |
| **issues** | Issue CRUD, status change, assignee, hierarchy (parent/child), list/filter | Issue |
| **comments** | Comment CRUD on issues | Comment |
| **boards** | Board and column definition; which statuses map to columns | Board, BoardColumn |
| **sprints** | Sprint CRUD, start/close; assign issues to sprint | Sprint |
| **time** | Time log start/stop, list by task/user | TimeLog |
| **notifications** | Placeholder for future (e.g. in-app or email); no-op or stub | — |
| **audit** | Append-only audit log (used by other modules) | AuditLog |
| **admin** | Stats, user list, activity log, deploy log (reads audit, users) | — |

Shared infrastructure (DB pool, env, logger) lives outside modules in a **shared** or **core** area.

---

## 3. Layering (Per Module)

Each module follows the same layout:

```
module/
  api.js          # Express routes: parse request, call service, send response
  service.js      # Business logic: orchestration, validation, permissions
  repository.js   # DB access: queries only, no business rules
  dto.js          # Request/response shapes (optional; can use JSDoc + plain objects)
```

- **API** — HTTP only. Validates input (body/query/params), calls service, maps result to JSON. No SQL.
- **Service** — Orchestrates repositories and other services; enforces permissions (or delegates to a shared auth helper); returns domain-shaped objects or DTOs.
- **Repository** — Functions that run SQL and return rows/ids; no knowledge of HTTP or roles.
- **DTO** — Optional file with JSDoc types or simple factories for request/response; keeps contracts explicit for AI and docs.

**Dependency rules:**

- API → Service only (within module).
- Service → Repository (within module); Service → other Services (allowed, but avoid deep chains).
- Repository → DB pool only (shared); no Repository → Service.
- No cross-module Repository or internal imports; cross-module only via Service (e.g. issues service may call comments service to get count).

---

## 4. Folder Structure (Target)

```
backend/
  server.js                 # App entry: Express setup, mount routes, error handler
  db.js                     # Pool, query, getClient (unchanged)
  config.js                 # Env (PORT, JWT_SECRET, PG_*, etc.)

  shared/
    auth.js                 # JWT verify middleware, requireAuth, requireRole
    audit.js                # audit({ userId, action, entityType, entityId, ... })
    errors.js               # HTTP error constructors (NotFound, Forbidden, BadRequest)

  modules/
    auth/
      api.js
      service.js
      repository.js
    users/
      api.js
      service.js
      repository.js
    organizations/
      api.js
      service.js
      repository.js
    teams/
      api.js
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
    notifications/
      api.js
      service.js              # stub
    audit/
      api.js                  # read-only activity log for admin
      repository.js
    admin/
      api.js
      service.js              # uses audit + users repos via their services or shared read)
  scripts/
    init-db.js
    seed.js
  schema.sql
  .env.example
```

Frontend can stay in `frontend/` with a similar feature-based split later (e.g. `frontend/pages/`, `frontend/features/issues/`, etc.).

---

## 5. Dependency Rules (Summary)

1. **Modules do not import other modules’ repositories or api.** They call other modules’ **services** when needed (e.g. issues.service may call comments.service.listByIssue(issueId)).
2. **Shared** is the only place for cross-cutting code: auth middleware, audit helper, errors, config, db.
3. **server.js** wires routes: `app.use('/api/auth', authApi)` etc. Each module’s `api.js` exports a Router.
4. **No circular service dependencies.** If A and B need each other, extract shared logic to a third module or shared.
5. **Repositories** receive `db` (or `query`/`getClient`) via argument or shared import; no direct require of another module.

---

## 6. Naming Conventions

- **Files:** `api.js`, `service.js`, `repository.js`, `dto.js` per module; `kebab-case` for new multi-word files.
- **Functions:** `getById`, `list`, `create`, `update`, `remove` in repository; service methods describe use case: `createIssue`, `moveIssueToSprint`.
- **Routes:** REST: `GET /api/issues`, `GET /api/issues/:id`, `POST /api/issues`, `PUT /api/issues/:id`, `PATCH /api/issues/:id/status`, `DELETE /api/issues/:id`.
- **Errors:** Use shared `errors.NotFound()`, `errors.Forbidden()` etc., and a global error handler that maps to 404/403/400/500.

---

## 7. Benefits for AI Development

- **Locality:** “Add a field to Issue” → one module (`issues`), three files (api, service, repository); schema change in one place.
- **Predictability:** Same layering everywhere; agents can infer where to add code.
- **Contracts:** DTOs or JSDoc at API/service boundary make request/response shape clear for prompts and tests.
- **Safe refactors:** Moving a route from monolith to module is a cut-paste plus import change; no hidden dependencies if rules are followed.

This structure is the basis for the repository restructure plan and migration plan.
