# Flow Universe — Issue Engine Design

**Purpose:** Design the core Issue system: lifecycle, status transitions, board columns, sprint assignment, and history.  
**Date:** March 2025

---

## 1. Issue Lifecycle (MVP)

An **Issue** is the single unit of work. It has:

- **Identity:** id, project_id, optional parent_id (for epic → story → subtask).
- **Type:** epic | story | task | subtask (or simplified: task | subtask for MVP).
- **State:** status (maps to board column), assignee, creator, optional sprint_id.
- **Content:** title, description, optional acceptance_criteria, story_points, estimated_hours.
- **Metadata:** created_at, updated_at.

**Lifecycle (conceptual):**

1. **Created** — In backlog (sprint_id = null) or directly in sprint. Status = first column (e.g. Open / To Do).
2. **In progress** — Status moves through board columns (e.g. In Progress, In Review). Optional: time logging on subtask/task.
3. **Done or cancelled** — Terminal states. Done = last column; Cancelled = explicit cancel (excluded from board or in a “Cancelled” column).

No formal “archived” in MVP; “cancelled” is the terminal negative state.

---

## 2. Status and Transitions

### 2.1 Status Model (MVP)

- **Fixed set (simple):** `open` | `in_progress` | `in_review` | `done` | `cancelled`. Stored as string on Issue. Same for all projects.
- **Per-project (later):** Status table (project_id, key, name, order); BoardColumn references status. Not required for first release.

### 2.2 Allowed Transitions

- Any non-terminal status → any other non-terminal status (e.g. open → in_progress → in_review → done).
- Any status → `cancelled` (except possibly `done` if you want to forbid “reopen” from done; MVP can allow done → cancelled for cleanup).
- `cancelled` → optional “reopen” to `open` (MVP: allow or disallow; document in API).

**Validation:** Service layer rejects invalid transitions (e.g. if you later restrict “only in_progress → in_review”). For MVP, any transition to a valid status value is allowed.

### 2.3 Who Can Change Status

- User with edit permission on the issue (assignee, creator, or admin/manager). Same as update permission.
- API: `PATCH /api/issues/:id` with `{ "status": "in_progress" }` or dedicated `PATCH /api/issues/:id/status`.

---

## 3. Board Columns

- **Board** belongs to a project; has an ordered list of **BoardColumns**.
- **BoardColumn** has: status_key (e.g. `open`, `in_progress`, …), order_index, optional wip_limit.
- **Rendering:** Frontend loads board with columns; for each column, queries issues where `issue.status = column.status_key` (and issue.project_id = board.project_id, optional sprint filter). Order within column by order_index on issue (or created_at).

**Default board (MVP):** One board per project; columns created from fixed status set in default order: Open, In Progress, In Review, Done. Cancelled can be a separate column or hidden from main board.

**WIP limit (optional):** If column has wip_limit, frontend (or API) can enforce or warn when column count exceeds limit. Enforcement in service layer is optional for MVP.

---

## 4. Sprint Assignment

- **Sprint** has: project_id, name, start_date, end_date, state (e.g. `open` | `active` | `closed`).
- **Issue** has optional **sprint_id**. `sprint_id = null` ⇒ issue is in **backlog**.
- **Backlog:** List issues for project where sprint_id is null (and optionally status not in done/cancelled). Order by order_index or created_at.
- **Sprint scope:** List issues where sprint_id = :sprintId. Same board column logic applies; board can show “current sprint” filter.

**Rules:**

- Moving issue to sprint: set issue.sprint_id = sprintId. Only issues in same project.
- Moving issue to backlog: set issue.sprint_id = null.
- When sprint is closed, issues with status != done can stay in sprint (visible in “closed sprint” view) or be moved back to backlog by policy (MVP: no auto-move; optional later).

---

## 5. Issue Ordering

- **order_index** (integer) on Issue. Lower = higher in list (or higher = higher; pick one and document).
- **Scope:** Per (project_id, sprint_id, status) or per (project_id, parent_id) for backlog/tree. MVP: one order_index per project (or per backlog vs per column).
- **API:** `PATCH /api/issues/reorder` with body e.g. `{ "issue_ids": [3, 1, 2] }` or per-column `{ "column_status": "in_progress", "issue_ids": [3, 1, 2] }`. Service updates order_index for each id.
- **Drag-and-drop:** Frontend sends new order after drop; backend persists (see KANBAN_ARCHITECTURE.md).

---

## 6. Issue History

**Requirement:** Audit trail of who changed what and when (for status, assignee, etc.).

**Options:**

- **A. Audit log only (current):** audit_log already stores action, entity_type, entity_id, details (JSONB). Add actions like `issue.status_changed`, `issue.assignee_changed` with details = { field, old_value, new_value }. No dedicated “issue_history” table; query audit_log by entity_type = 'issue', entity_id = id.
- **B. Dedicated issue_history table:** issue_id, field_name, old_value, new_value, user_id, created_at. Easier for “history for this issue” and for UI that shows a timeline. More storage; need to write on every change.

**Recommendation (MVP):** **Option A** — use audit_log with consistent action names and details. Add a dedicated “issue history” API that reads from audit_log filtered by entity_type/entity_id and returns a list of events. If product needs rich “field-level history” UI later, add Option B and backfill from audit_log or start fresh.

**Actions to log:** issue.created, issue.updated, issue.status_changed, issue.assignee_changed, issue.sprint_assigned, issue.deleted (if soft delete), comment.created.

---

## 7. API Summary (Issue-Centric)

| Action | Method | Endpoint | Body / Notes |
|--------|--------|----------|--------------|
| List (project) | GET | /api/projects/:projectId/issues | Query: sprint_id, status, assignee_id |
| List (backlog) | GET | /api/projects/:projectId/backlog | sprint_id=null |
| Get one | GET | /api/issues/:id | |
| Create | POST | /api/issues | project_id, type, title, … |
| Update | PUT | /api/issues/:id | Partial: status, assignee_id, sprint_id, … |
| Status | PATCH | /api/issues/:id/status | { status } |
| Reorder | PATCH | /api/issues/reorder | { issue_ids[] } or per column |
| Delete | DELETE | /api/issues/:id | |
| History | GET | /api/issues/:id/history | From audit_log or issue_history |

---

## 8. Summary

- **Lifecycle:** Created → (optional sprint) → status moves through columns → Done or Cancelled.
- **Status:** Fixed set for MVP; transitions allowed to any valid status; permission = issue edit permission.
- **Board columns:** One board per project; columns defined by status_key + order; issues grouped by status.
- **Sprint:** sprint_id on issue; null = backlog; reorder and filter by sprint in API and UI.
- **Ordering:** order_index on issue; reorder API for drag-and-drop.
- **History:** Use audit_log with issue.* actions and details; optional GET /api/issues/:id/history that reads from audit_log.

This design is the basis for the Kanban architecture and backend issue service implementation.
