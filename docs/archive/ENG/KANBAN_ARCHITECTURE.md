# Flow Universe — Kanban Board Architecture

**Purpose:** Design a performant Kanban board: drag-and-drop, optimistic updates, issue ordering, and column structure.  
**Date:** March 2025

---

## 1. Column Structure

- **Board** has many **BoardColumns** (ordered by order_index).
- Each **BoardColumn** has: status_key (e.g. `open`, `in_progress`, `in_review`, `done`), order_index, optional wip_limit.
- **Issues** are grouped by `issue.status === column.status_key`. Same project (and optional sprint filter).
- **Column order** is fixed by board definition; issue order **within** a column is by `issue.order_index` (or created_at if not set).

**Data flow:**

1. **GET /api/boards/:boardId** (or /api/projects/:projectId/board) → board + columns (ordered).
2. **GET /api/projects/:projectId/issues?status=open,in_progress,in_review,done** (or one request per column for lazy load) → issues.
3. Frontend groups issues by status and sorts by order_index; renders one column per BoardColumn.

---

## 2. Drag and Drop

### 2.1 UX

- User drags an issue card from one column (source) to another (target), or reorders within the same column.
- **Same column:** Only order changes (order_index).
- **Different column:** Status changes + order_index in target column.

### 2.2 Client

- Use HTML5 Drag and Drop API (dragstart, dragover, drop) or a small library (e.g. Sortable.js, dnd-kit) for accessibility and touch. Prefer native for MVP to avoid extra deps.
- **Data:** On drag start, set issue id (and optionally current status/column) in dataTransfer. On drop, get target column (status_key) and optional index among siblings.
- **Request:** After drop, call API to update status and/or reorder (see below).

### 2.3 API

- **Option A — Single PATCH:** `PATCH /api/issues/:id` with `{ "status": "in_progress", "order_index": 2 }`. Backend updates issue; returns updated issue. Client then refreshes list or applies optimistic update.
- **Option B — Move endpoint:** `POST /api/issues/:id/move` with body `{ "status": "in_progress", "order_index": 2 }`. Same effect; clearer semantics for “move on board.”
- **Option C — Reorder batch:** For reorder-only (same column), `PATCH /api/issues/reorder` with `{ "status": "in_progress", "issue_ids": [5, 3, 1] }`. Backend sets order_index by position in array.

**Recommendation:** Use **PATCH /api/issues/:id** for move (status + order_index). Add **PATCH /api/issues/reorder** when reordering many issues in one column (e.g. after multi-select drag). Both support optimistic updates.

---

## 3. Optimistic Updates

**Goal:** Board feels instant; avoid waiting for server before updating UI.

**Flow:**

1. On drop, **immediately** move the card in the DOM to the target column at the target position (or update order in same column).
2. **Then** send PATCH (or reorder) to the server.
3. **On success:** Keep UI as is; optionally sync any server-returned fields (e.g. updated_at).
4. **On failure (4xx/5xx):** Revert the card to its previous column/position; show error (toast or inline). Optionally retry once.

**Implementation:**

- Keep a shallow copy of “previous state” (issue id → { status, order_index }) before applying optimistic change.
- On failure, restore from copy and re-render affected column(s).
- Do not optimistically remove the issue from the list; only move it. Deletes stay pessimistic (confirm then delete).

**Concurrent edits:** If another user moves the same issue, next refresh or WebSocket (if added later) will show the conflict. MVP: last-write-wins; no real-time conflict resolution.

---

## 4. Issue Ordering Within Column

- **order_index** (integer) on Issue. Interpretation: lower value = higher in list (or vice versa; be consistent).
- **On move to column:** Set issue.status = target status; set issue.order_index = target position. Options:
  - **A.** Target position = “end of column”: set order_index to max(current column order_index) + 1 (or 0 if empty).
  - **B.** Target position = “between two cards”: set order_index to value between left and right neighbor (e.g. average), or renumber all in column (1, 2, 3, …).
- **Renumbering:** To avoid fractional indices, periodically or on reorder run a “compact” step: UPDATE issues SET order_index = row_number WHERE project_id = ? AND status = ? ORDER BY order_index. Optional; can be a background job or on next reorder.

**API:**  
- **PATCH /api/issues/:id** with `{ "status", "order_index" }` for single move.  
- **PATCH /api/issues/reorder** with `{ "status": "in_progress", "issue_ids": [id1, id2, id3] }` to set order_index by array index (1, 2, 3, …). Service updates each issue’s order_index in one transaction.

---

## 5. Performance (Summary)

- **Load board:** One request for board + columns; one request for all issues in scope (project + optional sprint), or one per column if you prefer lazy load. Prefer single list + group by status for MVP (fewer round-trips).
- **Pagination:** If issue count is large, load issues by column (e.g. GET /api/issues?project_id=&status=open&limit=50). See PERFORMANCE_PLAN.md.
- **Caching:** Client can cache issue list for the current board/sprint; invalidate on move/create/delete or after a short TTL.
- **No WebSocket in MVP:** Polling or “refresh” after mutations is enough; add real-time later if needed.

---

## 6. WIP Limits (Optional)

- **BoardColumn.wip_limit:** Optional integer. If set, frontend can show “3 / 5” and warn or block when count > wip_limit.
- **Enforcement:** MVP: display only. Later: service layer can reject move into column if new count would exceed wip_limit (return 400 with message).

---

## 7. Summary

- **Columns:** From board definition (status_key + order); issues grouped by status, ordered by order_index.
- **Drag-and-drop:** Client handles DnD; on drop call PATCH /api/issues/:id (status + order_index) or reorder endpoint; support reorder within column via PATCH /api/issues/reorder.
- **Optimistic updates:** Update UI immediately; on failure revert and show error.
- **Ordering:** order_index on issue; reorder API to set order by position in array for a given status.
- **Performance:** Single issue list for board scope (or per-column); pagination when needed; optional client cache invalidation on mutation.

This design integrates with ISSUE_ENGINE.md and PERFORMANCE_PLAN.md.
