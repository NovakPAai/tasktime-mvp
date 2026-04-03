# Flow Universe — Frontend UI Architecture

**Purpose:** Modern developer-focused UI: layout, pages, design system, components, and implementation guidance. Aligned with existing backend API; no backend or API contract changes.  
**Date:** March 2025

---

## 1. Goals and Constraints

### Design goals
- **Speed** — Fast load, instant feedback, minimal round-trips.
- **Keyboard workflows** — Shortcuts for search, create, navigate.
- **Compact information density** — Scannable lists and boards; minimal chrome.
- **Clarity for developers** — Linear/GitHub Issues–like usability.
- **Minimal interface noise** — No heavy enterprise patterns.

### Constraints (unchanged)
- Backend architecture, database schema, API contracts, and domain entities stay as-is.
- Frontend integrates with existing REST API (see API mapping below).

---

## 2. Mapping to Current API

The UI uses the following existing endpoints. No new backend endpoints are required for this architecture.

| UI concept        | Backend API |
|-------------------|-------------|
| User / auth       | `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout` |
| Projects list     | `GET /api/projects`, `GET /api/projects/:id` |
| Issues (list/detail) | `GET /api/tasks`, `GET /api/tasks/:id`, `POST /api/tasks`, `PUT /api/tasks/:id`, `DELETE /api/tasks/:id` |
| Issue status      | `PUT /api/tasks/:id` (body: `status`, `assignee_id`) |
| Board (by status) | Client-side grouping of `GET /api/tasks?project_id=X` by `status` |
| Time tracking     | `POST /api/tasks/:id/time/start`, `POST /api/tasks/:id/time/stop`, `GET /api/tasks/:id/time-logs`, `GET /api/time-logs` |
| Users (assignee)  | `GET /api/users` |
| Dashboard data    | `GET /api/dashboard/main` |
| Admin             | `GET /api/admin/stats`, `GET /api/admin/users`, etc. |

Task fields in API: `id`, `title`, `description`, `type`, `priority`, `status`, `assignee_id`, `creator_id`, `project_id`, `created_at`, `updated_at`, plus joined `assignee_name`, `creator_name`, `project_name`.  
Status values (MVP): use existing backend enum (e.g. open, in_progress, review, done) and map to board columns.

**Future:** When backend adds `/api/boards`, `/api/sprints`, `/api/issues/:id/comments`, the same UI structure will wire to those endpoints; no layout change.

---

## 3. Global Application Layout

### Structure
- **Sidebar** — Compact, fixed left; navigation only.
- **Topbar** — Minimal: global search trigger (⌘K), user avatar, optional “New issue”).
- **Main workspace** — Scrollable content area; no nested sidebars.

### Sidebar navigation (order)
1. **Home** — Dashboard (active work).
2. **Projects** — Project list.
3. **Issues** — Global issue list (with filters).
4. **Boards** — Entry to project boards (or “Board” per project).
5. **Sprints** — Sprint list / active sprint (when API exists; until then link to project or hide).
6. **Time** — User’s time logs.
7. **Reports** — Placeholder or link to dashboard/cio for managers.
8. **Teams** — Product teams (`GET /api/product-teams`).
9. **Users** — User list (admin/manager).
10. **Admin** — Link to existing admin panel (`/admin`).

Sidebar: icon + label; width ~200–220px; collapse to icons-only optional. Style: `#fafafa` background, subtle border, hover highlight only (no heavy selected state).

### Topbar
- Height ~48px; same `#fafafa` or white.
- Left: optional menu trigger for mobile.
- Center/left: “Search or jump…” + shortcut hint `⌘K`.
- Right: Quick “New issue” (or `C`), user avatar dropdown (profile, logout).

---

## 4. Page Structure and Routes

| Route | Purpose |
|-------|---------|
| `/` | Login (existing `index.html` behaviour). |
| `/app` | SPA entry; layout + outlet. |
| `/app/home` | Dashboard. |
| `/app/projects` | Project list. |
| `/app/projects/:id` | Project shell (sub-routes below). |
| `/app/projects/:id/backlog` | Backlog view. |
| `/app/projects/:id/board` | Kanban board. |
| `/app/projects/:id/issues` | Issue list (project-scoped). |
| `/app/projects/:id/sprints` | Sprints (when API exists). |
| `/app/projects/:id/reports` | Reports. |
| `/app/projects/:id/settings` | Project settings. |
| `/app/issues` | Global issue list. |
| `/app/issues/:id` | Issue detail. |
| `/app/boards` | Board index or redirect to first project board. |
| `/app/time` | Time logs. |
| `/app/teams` | Teams. |
| `/app/users` | Users. |
| `/admin` | Existing admin panel (separate page). |

---

## 5. Home / Dashboard

- **Not project-centric.** Focus on “what I work on now”.

### Sections
1. **Active work**
   - Issues assigned to me (from `GET /api/tasks?assignee_id=me` or dashboard/main).
   - Recently updated issues (from dashboard/main if available).
2. **Quick actions**
   - Create issue (primary).
   - Search (link to ⌘K).
3. **Recent projects**
   - Short list from `GET /api/projects` (e.g. last 5 used or first 5).

Use `GET /api/dashboard/main` for aggregated data when it provides “my tasks” / “recent”; otherwise use `GET /api/tasks` with `assignee_id` and sort by `updated_at`.

---

## 6. Project Page Structure

Inside a project (`/app/projects/:id/*`):

**Tabs (or horizontal nav):** Backlog | Board | Issues | Sprints | Reports | Settings.

- **Backlog** — List of issues in project, ordered; optional drag to reorder (if API supports order).
- **Board** — Kanban columns (see below).
- **Issues** — Same scope as backlog, table view with filters/sort.
- **Sprints** — Placeholder or list; when backend has sprints, show active and past.
- **Reports** — Placeholder or link to dashboard/cio.
- **Settings** — Name, description, members (when API exists).

---

## 7. Issue List Page

- **Layout:** Single data table; compact rows.

### Columns (default)
Status | Issue ID | Title | Assignee | Priority | Labels (if API supports) | Updated

- **Behaviour:** Keyboard nav (arrow keys, Enter to open), inline edit for status/assignee/priority where possible (PATCH/PUT on blur or Enter).
- **Filtering:** Bar above table (status, assignee, project, priority); query params map to `GET /api/tasks?status=…&assignee_id=…&project_id=…`.
- **Sorting:** Click column header (e.g. updated_at, priority).
- **Quick create:** “New issue” row or button; opens minimal modal or inline form (title, project, assignee, priority).

---

## 8. Kanban Board

- **Columns (default):** Backlog | Todo | In Progress | Review | Done  
  Map from backend `status` (e.g. open → Todo, in_progress → In Progress, review → Review, done → Done; Backlog can be “no status” or first column).

- **Issue card (compact):**
  - Issue ID (e.g. TASK-123 or id)
  - Title (one line)
  - Assignee avatar
  - Priority (badge)
  - Labels (if any)

- **Interaction:** Drag-and-drop between columns; on drop call `PUT /api/tasks/:id` with new `status`. Optimistic update + revert on error.

---

## 9. Issue Detail Page

- **Layout:** Two columns.
  - **Left (main):** Title (editable), description (editable), comments (when API exists), time log entries (from `GET /api/tasks/:id/time-logs`).
  - **Right (metadata panel):** Status, Assignee, Priority, Project, Labels, Created/Updated, Activity (when API exists).

- **Behaviour:** Inline edit for title/description; status/assignee/priority as dropdowns that PATCH/PUT on change. Start/stop timer from detail (existing time API).

---

## 10. Global Search (Command Palette)

- **Shortcut:** `Cmd + K` (Mac) / `Ctrl + K` (Win/Linux).
- **Behaviour:** Overlay/modal; single input; debounced request (e.g. `GET /api/tasks?q=…` when backend supports search, or client-side filter on cached list).
- **Capabilities:** Search issues (and projects when API supports); quick navigate to issue/project; “Create issue” action. Optional: recent pages.
- **Performance:** Cache recent results; minimal latency; no full-page load.

---

## 11. Quick Issue Creation

- **From anywhere:** Shortcut `C` or “New issue” in topbar/sidebar.
- **Form (minimal):** Title (required), Project, Assignee, Priority. Optional: Description, Labels (if API supports).
- **Submit:** `POST /api/tasks`; then redirect to new issue or stay in context. No heavy multi-step wizard.

---

## 12. Project List Page

- **Layout:** Lightweight cards or list.
- **Card content:** Project name, short description, issue count (from project or count of tasks per project), “active” count (e.g. not done).
- **Style:** White card, minimal border, hover highlight; avoid heavy shadows.

---

## 13. Design System

### Core components (reusable)
- **Button** — Primary, secondary, ghost, danger; sizes sm/default.
- **Input** — Text, number, with label and optional error.
- **Card** — Container with optional padding and border.
- **Badge** — Status, priority, label pills.
- **Avatar** — User initial or image; small/default.
- **Dropdown** — Menu for actions or single select (e.g. assignee, status).
- **ProgressBar** — For sprint or time (when needed).
- **Tabs** — Horizontal nav (e.g. project sub-routes).
- **Modal** — Overlay for forms and command palette.
- **IssueRow** — Table row for issue list (status, id, title, assignee, priority, updated).
- **IssueCard** — Board card (id, title, avatar, priority, labels).
- **BoardColumn** — Column wrapper with header and droppable area.

### Visual style
- **Background:** `#fafafa`.
- **Cards:** White `#ffffff`, border `#e5e7eb`, radius 8px; hover: subtle border or background change.
- **Typography:**  
  - Page title 20–22px, weight 600.  
  - Section title 14px, uppercase or 600.  
  - Card title 16px.  
  - Body 14px.  
  - Meta 12px, color `#6b7280`.
- **Primary action:** One accent color (e.g. `#0052cc`); use sparingly.

---

## 14. Interaction Patterns

- **Hover:** Highlight row/card (background or border), no heavy shadow.
- **Clickable rows:** Full row opens issue (or select for bulk when needed).
- **Inline editing:** Click to edit; save on blur or Enter; cancel on Escape.
- **Modals:** Only when necessary (create issue, command palette); prefer inline or slide-over for small edits.
- **Animations:** Short (150–200ms) for hover and open/close; no decorative motion.

---

## 15. Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `⌘K` / `Ctrl+K` | Global search (command palette) |
| `C` | New issue |
| `G` then `H` | Go to Home (optional) |
| `G` then `I` | Go to Issues (optional) |
| `Esc` | Close modal / command palette |
| Arrow keys | Move in list/board (when focused) |
| `Enter` | Open selected issue / submit |

---

## 16. Frontend Folder Structure

Proposed structure under `frontend/` (compatible with Vite + React or similar; current vanilla app can be migrated into this structure):

```
frontend/
  index.html              # Login (existing)
  app.html                # SPA shell (existing or replaced by app/index.html)
  admin.html             # Admin (existing)
  public/
    favicon.ico
  src/                    # If SPA with bundler
    app/
      layout/
        AppLayout.jsx     # Sidebar + Topbar + outlet
        Sidebar.jsx
        Topbar.jsx
      pages/
        HomePage.jsx
        ProjectListPage.jsx
        ProjectPage.jsx   # Project shell + tabs
        IssueListPage.jsx
        IssueDetailPage.jsx
        BoardPage.jsx
        TimeLogsPage.jsx
        TeamsPage.jsx
        UsersPage.jsx
      routes.jsx
    components/
      ui/
        Button.jsx
        Input.jsx
        Card.jsx
        Badge.jsx
        Avatar.jsx
        Dropdown.jsx
        ProgressBar.jsx
        Tabs.jsx
        Modal.jsx
      issues/
        IssueRow.jsx
        IssueCard.jsx
        IssueForm.jsx
      boards/
        BoardColumn.jsx
        Board.jsx
      projects/
        ProjectCard.jsx
    features/
      issues/
        useIssues.js
        useIssueMutations.js
      projects/
        useProjects.js
      boards/
        useBoard.js
      search/
        CommandPalette.jsx
        useSearch.js
    hooks/
      useAuth.js
      useKeyboardShortcuts.js
    services/
      api.js              # apiFetch(baseUrl, options), auth header
      endpoints.js        # URL builders
    types/
      (or shared constants for status, priority)
  styles/
    tokens.css            # CSS variables (colors, spacing, typography)
    design-system.css     # Base component styles (if not CSS-in-JS)
```

**Without a framework:** Same logical split under `frontend/` using plain JS modules and one or more entry HTML files; `components/` and `features/` as ES modules; `services/api.js` for `apiFetch`.

---

## 17. Implementation Guidance

1. **Start from layout:** Implement `AppLayout` (sidebar + topbar + main) and routing so every page shares the same chrome.
2. **Auth:** Keep existing pattern: check `localStorage` token or `GET /api/auth/me`; redirect to `/` if 401. Do not gate HTML delivery on server; protect only API (see developer skill).
3. **API layer:** Single `apiFetch(url, { method, body })` that adds `Authorization: Bearer <token>` and handles 401 (redirect to login). Reuse existing cookie/credential approach if the backend uses cookies.
4. **State:** For MVP, server state can be request-on-navigate (no global store required). Add caching (e.g. React Query or SWR) when needed for search and lists.
5. **Board:** Use a drag-and-drop library (e.g. @dnd-kit or react-beautiful-dnd) or native HTML5 DnD; keep card and column components thin.
6. **Command palette:** One component that listens for `⌘K`, renders a modal with input and result list; fetch or filter issues/projects on input; on select, navigate or run action.
7. **Keyboard:** `useKeyboardShortcuts` or global listener for `C`, `⌘K`, `Escape`; ensure focus management in modals (trap focus, restore on close).
8. **Design tokens:** Put colors, spacing, font sizes in `tokens.css` (or theme object); use in components for consistency.

---

## 18. Alignment with Current Architecture

- **Backend:** No changes. All data from existing REST API.
- **Auth:** SPA pattern: HTML always served; auth only on API and client-side redirect (see `.cursor/skills/developer/SKILL.md`).
- **Deploy:** Same static delivery from `frontend/` (or built `dist/`) by existing server; routes `/`, `/app`, `/admin` unchanged.
- **Documentation:** Update `docs/ENG/API.md` only if frontend introduces new query params or usage that should be documented; no API contract change.

This document is the single reference for frontend UI structure and design. Implementation can be phased: layout and dashboard first, then issue list and detail, then board and search, then quick create and shortcuts.
