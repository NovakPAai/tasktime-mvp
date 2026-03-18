# Flow Universe — Safe Incremental Migration Plan

**Purpose:** Phased migration from current monolith to modular architecture and (optionally) to the new domain model, without breaking the running MVP.  
**Date:** March 2025

---

## 1. Principles

- **No big-bang:** One slice at a time; each phase is deployable and testable.
- **Backward compatibility:** API contracts (paths, request/response shapes) stay the same until we explicitly version or change them.
- **High-risk changes isolated:** Schema changes (e.g. tasks → issues) in dedicated phases with migration scripts and rollback plan.
- **Feature parity first:** Restructure (extract modules) before adding new domain (sprints, boards, comments); then add new features on the new structure.

---

## 2. Phase Overview

| Phase | Goal | Risk | Duration (estimate) |
|-------|------|------|----------------------|
| **0** | Prep: shared auth, errors, audit | Low | 1–2 days |
| **1** | Extract modules (auth, users, projects, tasks, time, teams, admin) | Low | 1–2 weeks |
| **2** | Add new domain (comments, sprints, boards/columns, labels) | Medium | 2–3 weeks |
| **3** | Unify tasks + task_items → issues (schema + API) | High | 2–3 weeks |
| **4** | Frontend structure + optional org | Low–Medium | 1–2 weeks |

---

## 3. Phase 0 — Preparation

**Goal:** Shared infrastructure and no change to route behavior.

**Tasks:**

1. Add **shared/errors.js**: `NotFound`, `Forbidden`, `BadRequest`, `Unauthorized` with status codes; optional global error handler in server.js that catches these and sends JSON.
2. Move **auth middleware and role helpers** from server.js to **shared/auth.js**. server.js only imports and uses them. No route logic moved yet.
3. Move **audit.js** to **shared/audit.js** (or keep path and add re-export from shared). Ensure all call sites still work.
4. Add **config.js** that reads `process.env` (PORT, JWT_SECRET, PG_*, etc.) and exports a single object. server.js and (later) modules use config instead of process.env.

**Validation:** All existing API and UI tests pass; manual smoke test (login, list tasks, create task, time start/stop).

**Rollback:** Revert commits; no DB or API contract change.

---

## 4. Phase 1 — Extract Modules (No Contract Change)

**Goal:** Move route handlers and logic into feature modules; server.js only mounts routers. Same URLs and JSON.

**Order of extraction:**

1. **auth** — Register, login, logout, me, impersonate. New: `modules/auth/api.js` (router), `service.js`, `repository.js`. server.js: `app.use('/api/auth', authApi)`.
2. **users** — GET /api/users. New: `modules/users/...`. Mount at `/api/users` (or keep under `/api` with same path in router).
3. **projects** — GET/POST /api/projects, GET /api/projects/:id. New: `modules/projects/...`.
4. **tasks** — All /api/tasks and /api/task-items, /api/task-links. New: `modules/tasks/...` (name “tasks” for now; rename to “issues” in Phase 3). This is the largest slice; split into 2 PRs if needed (tasks CRUD first, then task-items and links).
5. **time** — POST /api/tasks/:id/time/start|stop, GET /api/tasks/:id/time-logs, GET /api/time-logs. New: `modules/time/...`. Depends on tasks (permission: can read task).
6. **teams** — Product-teams and members. New: `modules/teams/...`.
7. **admin** — Dashboard (main, cio), admin/stats, admin/users, admin/activity, admin/deploys. New: `modules/admin/...`, `modules/audit/...` for activity read.
8. **business-functions** — Either move to a small module or remove from API if unused; document in API.md.

**Per-module steps:**

- Create `api.js` (Express Router), `service.js`, `repository.js`.
- Copy handlers from server.js; in api.js only call service and send response.
- Move SQL to repository; move permission checks and orchestration to service.
- Remove duplicated code from server.js; mount router.
- Run tests and manual checks.

**Validation:** Full regression: login, tasks CRUD, task-items, projects, teams, time logs, dashboards, admin panel. No change in response shape or status codes.

**Rollback:** Revert module commit; restore handlers in server.js.

---

## 5. Phase 2 — New Domain (Comments, Sprints, Boards, Labels)

**Goal:** Add new entities and APIs without removing existing ones. DB schema additive only.

**Tasks:**

1. **Schema:** Add tables: `comments`, `sprints`, `boards`, `board_columns`, `labels`, `issue_labels` (see MVP_DOMAIN_MODEL.md). Keep `tasks` and `task_items` as-is for now; link new tables to them where needed (e.g. comment.task_id and comment.task_item_id, or single issue_id after Phase 3). For Phase 2, optional: add `issue_id` to a single “issues” view or keep comments by task_id + task_item_id.
2. **Comments:** New module `comments`. API: GET/POST /api/tasks/:id/comments and GET/POST /api/task-items/:id/comments (or unified /api/issues/:id/comments if you introduce a virtual “issue” id). Service + repository.
3. **Sprints:** New module `sprints`. API: CRUD /api/projects/:projectId/sprints; PATCH /api/tasks/:id or task-items to set sprint_id (add column to tasks/task_items or link table). Add `sprint_id` to task_items (or tasks) for “backlog vs sprint” split.
4. **Boards:** New module `boards`. API: GET/POST /api/projects/:projectId/board (or /boards). Board has columns (status_key, order_index, wip_limit). Frontend can render Kanban by status using board column order.
5. **Labels:** New module or part of projects. Tables: labels (project_id, name, color), issue_labels (issue_id could be task_id or task_item_id for now). API: GET/POST /api/projects/:id/labels; PATCH issue to set labels.

**Validation:** New endpoints work; existing endpoints unchanged. Optional: add simple E2E tests for new flows.

**Rollback:** Drop new tables (or leave them unused); remove new routes. No data loss on existing tables.

---

## 6. Phase 3 — Unify Tasks + Task Items → Issues (High Risk)

**Goal:** Single “Issue” model and table; migrate data from tasks and task_items; deprecate dual APIs or map them to issue API.

**Risks:** Data migration mistakes, downtime, frontend breakage. Isolate with feature flag or parallel API.

**Tasks:**

1. **Design:** Finalize issues table (see MVP_DOMAIN_MODEL.md). Add `issues` table; add `issue_id` to time_logs, comments, issue_labels. Plan mapping: task_items → issues (direct); tasks → issues (one-to-one, or merge into task_items then into issues).
2. **Migration script:** Idempotent SQL + Node script: create `issues` table; copy task_items into issues (with type, parent_id, project_id from context); copy tasks into issues (with project_id); set time_logs.issue_id from task_id/task_item_id; set comments.issue_id; update issue_labels. Preserve IDs where possible (e.g. issue.id = task_item.id for first batch) to minimize frontend changes.
3. **Dual-write period (optional):** New code writes to both tasks/task_items and issues; read from issues. Run for a short period, then switch reads to issues only and stop writing to old tables.
4. **API:** New routes under /api/projects/:projectId/issues (or /api/issues with project_id filter). Old routes /api/tasks and /api/task-items redirect or delegate to issue service with mapping. Deprecation header for old routes.
5. **Frontend:** Point to new issue API; remove task/task-item specific code over time. Or keep adapter in API that translates issue → task shape for backward compatibility.
6. **Cleanup:** Drop task_item_links, then tasks/task_items (or rename to _deprecated and drop later). Remove dual-write.

**Validation:** Full E2E; verify time logs, comments, and labels point to correct issues; rollback script (restore from backup or revert migration).

**Rollback:** Keep old tables; revert app to previous version; run rollback script if data was migrated.

---

## 7. Phase 4 — Frontend Structure and Optional Org

**Goal:** Improve frontend maintainability; optionally add organization (multi-tenant) support.

**Tasks:**

1. **Frontend:** Split app.html into logical files (e.g. router, api client, features: dashboard, issues, projects, teams) and load via script tags; or introduce a minimal build (e.g. Vite) and keep one entry. Same UX and API calls.
2. **Organizations (optional):** If required: add organizations table; add org_id to users, projects, teams; default org for existing data; API scoping by org (from user’s org). Otherwise skip.

**Validation:** All pages and flows work; no regression.

---

## 8. Checklist Per Phase

- [ ] Schema changes (if any) documented and idempotent.
- [ ] Migration/rollback script tested on copy of production DB.
- [ ] API contract unchanged (or versioned) and documented in docs/API.md.
- [ ] Manual smoke test (login, create/read/update, critical paths).
- [ ] DEPLOYMENT_STEPS.md updated if deploy or env changed.
- [ ] No deploy without explicit confirmation (per project rules).

---

## 9. Summary

- **Phase 0–1:** Restructure only; no new domain, no schema break. Safe and reversible.
- **Phase 2:** Additive schema and new features (comments, sprints, boards, labels). Low risk if tested.
- **Phase 3:** Unify to issues; highest risk; do after restructure and new domain are stable.
- **Phase 4:** Frontend and optional org; low risk if done incrementally.

This plan keeps the MVP running at every step and isolates high-impact changes (Phase 3) with clear rollback and validation.
