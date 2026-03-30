# Flow Universe — Performance Strategy

**Purpose:** Strategies for large boards, many issues, caching, and pagination. MVP-focused; avoid overengineering.  
**Date:** March 2025

---

## 1. Large Boards and Many Issues

### 1.1 Problem

- Board with many columns and hundreds of issues: single “all issues for project” response can be slow and heavy.
- DOM with hundreds of cards: layout and drag-and-drop can lag.
- List views (backlog, issue list): slow and heavy if unbounded.

### 1.2 Backend

- **Indexes:** Ensure indexes on (project_id, status), (project_id, sprint_id), (assignee_id, status) for list/board queries. See schema and DOMAIN_MODEL.md.
- **Limit response size:** All list endpoints support `?limit=` and `?offset=` (or `?page=&limit=`). Default limit (e.g. 50), max limit (e.g. 200). Document in API.md.
- **Board load:** Option A — single GET with filters: `GET /api/issues?project_id=X&sprint_id=Y&limit=500`. Option B — one request per column: `GET /api/issues?project_id=X&status=open&limit=100` etc. Option A is simpler and one round-trip; use Option B when columns have very different sizes and you want to lazy-load heavy columns.
- **Fields:** Return only fields needed for board cards (id, title, status, assignee_id, order_index, priority, type) in list; full body only for GET /api/issues/:id.

### 1.3 Frontend

- **Virtualization:** For long lists (backlog, or a column with 100+ cards), use a virtual list (only render visible items). Libraries: e.g. vanilla virtual-scroller or a small custom window. MVP: can defer and use pagination first.
- **Pagination:** For backlog and “all issues” list: load first page (e.g. 50); “Load more” or infinite scroll loads next page (offset += limit).
- **Board columns:** If a column has many issues, render only first N (e.g. 20) with “Show 15 more” or lazy-load on column expand. Keeps DOM small.
- **Debounce:** Debounce search/filter input (e.g. 300 ms) before calling API.

---

## 2. Caching

### 2.1 HTTP Caching (API)

- **GET list/board:** Add `Cache-Control: private, max-age=0` or `no-store` so clients do not cache stale lists. Optional: short max-age (e.g. 10–30 s) for GET /api/issues?… if you want to reduce load; then invalidate on mutation (harder without versioned URLs). MVP: no cache or short private cache.
- **GET /api/issues/:id:** Can send `ETag` or `Last-Modified`; 304 if not modified. Optional for MVP.
- **Static assets:** Frontend HTML/JS/CSS: cache with max-age (e.g. 1 hour) and versioned filenames or query string when you have a build step.

### 2.2 Client-Side (Browser)

- **In-memory:** Keep last-loaded board/issues in a variable; reuse until user navigates away or triggers “Refresh.” On any mutation (create, update, delete, move), invalidate or patch that cache.
- **No localStorage for full lists:** Avoid storing large lists in localStorage (size limits, staleness). Token and user prefs only.
- **Optimistic update:** Already described in KANBAN_ARCHITECTURE.md; reduces perceived latency without server cache.

### 2.3 Server-Side (Optional Later)

- **Redis/memory cache:** Cache “board state” (list of issue ids per column) with short TTL (e.g. 30 s); invalidate on any issue update in that project. Not required for MVP unless response time is high even with indexes.
- **DB connection pool:** Already in place (pg Pool); tune max connections if needed under load.

---

## 3. Pagination

### 3.1 Contract

- **Query params:** `limit` (default 20, max 100), `offset` (default 0). Or `page` (1-based) and `limit`: offset = (page - 1) * limit.
- **Response:** Array of items. Optional: total count in header (`X-Total-Count`) or in body (`{ items: [], total: N }`) for “Page 1 of 10” UI. If total is expensive, omit or make it a separate endpoint (e.g. GET /api/issues/count?project_id=…).

### 3.2 Where to Apply

- **GET /api/issues** (or /api/projects/:id/issues): paginated.
- **GET /api/projects:** paginated if many projects.
- **GET /api/admin/activity:** already limit/offset; keep.
- **Backlog:** Same as issues list with sprint_id=null; paginated.
- **Board:** Either load one page of “all issues for board” (and accept partial columns) or load per-column with limit per column. Prefer one request with limit for MVP (e.g. 200 issues max); “Load more” in UI if needed.

### 3.3 Ordering

- **Stable sort:** Use order_index, then id (or created_at) so pagination is stable and new inserts do not shuffle pages.
- **Consistent ordering:** Same ORDER BY in list and in reorder logic.

---

## 4. Database

- **Indexes:** See DOMAIN_MODEL.md and schema. At least: issues(project_id), issues(project_id, status), issues(sprint_id), issues(assignee_id).
- **N+1:** Avoid loading issues then one query per issue for assignee name. Use JOIN or batch load assignees and return in list payload.
- **Counts:** If “total” is needed, consider a separate lightweight count query (COUNT(*) with same filters) or a materialized count updated on write. MVP: single count query per list request is acceptable.

---

## 5. Summary

| Area | Strategy |
|------|----------|
| **Large boards** | Limit issues per request; per-column or single list with limit; virtualization or “load more” in heavy columns. |
| **Many issues** | Pagination (limit/offset or page/limit); stable sort; indexes on project_id, status, sprint_id. |
| **Caching** | Client: in-memory last result; invalidate on mutation. Server: optional short TTL for list; no cache for MVP is fine. |
| **Pagination** | All list endpoints; optional total count; document in API. |

Keep MVP simple: indexes + limit/offset + small payloads + optional “load more” in UI. Add virtualization and server cache when metrics justify.
