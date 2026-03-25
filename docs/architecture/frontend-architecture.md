# Flow Universe — Frontend Architecture

> **Source:** `frontend/src/`
> **Stack:** React 18 + Vite 6 + Ant Design 5 + Zustand 5 + React Router 7
> **Last updated:** 2026-03-25

---

## Route Map

All routes are protected by `<PrivateRoute>` (redirects to `/login` if no JWT).

| Path | Page | Min role | Description |
|------|------|----------|-------------|
| `/login` | LoginPage | Public | Authentication form |
| `/` | DashboardPage | All | Overview, stats, recent activity |
| `/projects` | ProjectsPage | All | Projects list |
| `/projects/:id` | ProjectDetailPage | All | Issues list, backlog |
| `/projects/:id/board` | BoardPage | All | Kanban board |
| `/projects/:id/sprints` | SprintsPage | All | Sprint management |
| `/projects/:id/releases` | ReleasesPage | All | Release management |
| `/sprints` | GlobalSprintsPage | All | All sprints across projects |
| `/issues/:id` | IssueDetailPage | All | Issue detail, comments, time, history |
| `/time` | TimePage | All | My time logs, timer |
| `/teams` | TeamsPage | All | Teams overview |
| `/business-teams` | BusinessTeamsPage | All | Business team view |
| `/flow-teams` | FlowTeamsPage | All | Flow team view |
| `/uat` | UatTestsPage | All | UAT checklist (QA testing) |
| `/admin` | AdminPage | ADMIN+ | Admin panel (tabs: users, stats, reports, monitoring, UAT) |

---

## Page Descriptions

### LoginPage (`/login`)
Email + password form. On success: stores JWT in auth store, redirects to `/`.

### DashboardPage (`/`)
Statistics cards (open issues, active sprints, recent activity). Quick links to projects.

### ProjectsPage (`/projects`)
Grid of `ProjectCard` components. Create project button (ADMIN/MANAGER). Status badges.

### ProjectDetailPage (`/projects/:id`)
Issue list with filters (status, type, priority, assignee, sprint, search). Tabs: Backlog / Issues. Create issue button.

### BoardPage (`/projects/:id/board`)
Kanban board with 5 columns: OPEN | IN_PROGRESS | REVIEW | DONE | CANCELLED.
Drag-and-drop via `@hello-pangea/dnd`. Saves status + orderIndex on drop.

### SprintsPage (`/projects/:id/sprints`)
Sprint list. Create/start/close sprint. `SprintPlanningDrawer` for issue assignment. `SprintIssuesDrawer` for sprint details.

### ReleasesPage (`/projects/:id/releases`)
Release list. Create/update releases. Assign issues to releases.

### GlobalSprintsPage (`/sprints`)
All sprints across all projects in one view.

### IssueDetailPage (`/issues/:id`)
Full issue card:
- Fields: title, type, status, priority, assignee, sprint, release, estimated hours
- AI flags section (for ADMIN/MANAGER): aiEligible toggle, aiAssigneeType selector
- Comments section (CRUD)
- Time logs section (start/stop timer, manual entry)
- History tab (audit log entries)
- Children/sub-issues list
- Custom fields (if schema configured)
- Issue links (parent, related)

### TimePage (`/time`)
My time logs. Calendar/list view. Daily totals. Manual time entry. Active timer indicator.

### TeamsPage (`/teams`)
Team list. Create/edit teams. Manage members. Role assignment within team.

### AdminPage (`/admin`)
Admin-only. Tabs:
- **Dashboard** — system stats (uptime, RAM, DB, Redis, error count)
- **Users** — user management (create, edit role, block/unblock)
- **Reports** — issues by status, issues by assignee
- **Monitoring** — real-time system metrics
- **UAT** — UAT test checklist by role

---

## Component Structure

```
frontend/src/components/
├── layout/
│   ├── AppLayout.tsx       # Main shell: sidebar + top bar + <Outlet>
│   ├── Sidebar.tsx         # Navigation menu (role-aware items)
│   └── TopBar.tsx          # User avatar, notifications, active timer display
│
├── issues/
│   ├── IssuePreviewDrawer.tsx    # Quick-view drawer (hover/click on issue)
│   ├── IssueLinksSection.tsx     # Parent/child/related links
│   ├── IssueCustomFieldsSection.tsx  # Custom field values
│   ├── CustomFieldInput.tsx      # Generic field input by type
│   └── KanbanCardCustomFields.tsx # Custom fields on board card
│
├── sprints/
│   ├── SprintPlanningDrawer.tsx  # Assign issues to sprint
│   └── SprintIssuesDrawer.tsx    # View sprint contents
│
├── admin/
│   ├── AdminProjectsTab.tsx
│   ├── AdminUsersTab.tsx (implicit in AdminPage)
│   ├── AdminIssueTypeSchemesTab.tsx
│   ├── AdminIssueTypeConfigsTab.tsx
│   ├── AdminCategoriesTab.tsx
│   ├── AdminMonitoringTab.tsx
│   └── SchemaConflictsModal.tsx
│
├── ui/
│   ├── ProjectCard.tsx        # Project grid card
│   ├── IssuePriorityTag.tsx   # Colored priority badge
│   ├── IssueTypeTag.tsx       # Type icon + label
│   ├── ProjectStatusBadge.tsx # Status indicator
│   ├── ProgressBar.tsx        # Sprint/release progress
│   └── AvatarGroup.tsx        # Multiple user avatars
│
├── common/
│   └── LoadingSpinner.tsx     # Centered spinner
│
└── uat/
    └── UatOnboardingOverlay.tsx  # First-time user walkthrough
```

---

## State Management (Zustand)

Located in `frontend/src/store/`:

| Store | State | Key actions |
|-------|-------|-------------|
| `auth.store.ts` | `user`, `token`, `loading` | `login()`, `logout()`, `loadUser()` |
| `project.store.ts` | `projects`, `currentProject` | `fetchProjects()`, `setCurrentProject()` |
| `issue.store.ts` | `issues`, `currentIssue` | `fetchIssues()`, `updateIssue()` |
| `sprint.store.ts` | `sprints`, `activeSprint` | `fetchSprints()`, `startSprint()` |
| `time.store.ts` | `activeTimer`, `timeLogs` | `startTimer()`, `stopTimer()` |
| `team.store.ts` | `teams` | `fetchTeams()` |
| `stores/monitoring.store.ts` | `metrics`, `polling` | `startPolling()`, `stopPolling()` |

---

## API Client Layer

Located in `frontend/src/api/`. Each module wraps Axios calls:

```
auth.ts, projects.ts, issues.ts, board.ts, sprints.ts, releases.ts,
comments.ts, time.ts, teams.ts, admin.ts, ai.ts,
links.ts, monitoring.ts
```

All calls include `Authorization: Bearer <token>` header (injected via Axios interceptor in auth store).

---

## Theme & Design System

- **Theme:** Dark mode (Ant Design `darkAlgorithm`)
- **Font:** Inter (system-ui fallback)
- **Border radius:** 4px
- **Accent color:** `var(--acc)` (CSS variable)
- **Design tokens:** `frontend/src/design-tokens.ts`
- **Theme config:** `frontend/src/lib/theme.ts`
- See [../design-system/overview.md](../design-system/overview.md) for full design system docs

---

## How to update this doc

When new pages/routes are added to `frontend/src/App.tsx`, or new major components to `frontend/src/components/` → update this file.
