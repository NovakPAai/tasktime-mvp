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

<!-- AUTO-GENERATED:START -->
> ⚡ Авто-сгенерировано из `frontend/src/App.tsx`
> 🔒 = требует авторизации. Обновляется автоматически.

| Путь | Компонент | Файл | Авторизация |
|------|-----------|------|-------------|
| `/login` | `LoginPage` | `frontend/src/pages/LoginPage` | — |
| `/change-password` | `ChangePasswordPage` | `frontend/src/pages/ChangePasswordPage` | — |
| `/` | `AppLayout` | `frontend/src/pages/AppLayout` | — |
| `/projects` | `ProjectsPage` | `frontend/src/pages/ProjectsPage` | — |
| `/business-teams` | `BusinessTeamsPage` | `frontend/src/pages/BusinessTeamsPage` | — |
| `/flow-teams` | `FlowTeamsPage` | `frontend/src/pages/FlowTeamsPage` | — |
| `/projects/:id` | `ProjectDetailPage` | `frontend/src/pages/ProjectDetailPage` | — |
| `/projects/:id/board` | `BoardPage` | `frontend/src/pages/BoardPage` | — |
| `/projects/:id/sprints` | `SprintsPage` | `frontend/src/pages/SprintsPage` | — |
| `/projects/:id/releases` | `ReleasesPage` | `frontend/src/pages/ReleasesPage` | — |
| `/sprints` | `GlobalSprintsPage` | `frontend/src/pages/GlobalSprintsPage` | — |
| `/releases` | `GlobalReleasesPage` | `frontend/src/pages/GlobalReleasesPage` | — |
| `/issues/:id` | `IssueDetailPage` | `frontend/src/pages/IssueDetailPage` | — |
| `/time` | `TimePage` | `frontend/src/pages/TimePage` | — |
| `/teams` | `TeamsPage` | `frontend/src/pages/TeamsPage` | — |
| `/search` | `SearchPage` | `frontend/src/pages/SearchPage` | — |
| `/search/help` | `SearchHelpPage` | `frontend/src/pages/SearchHelpPage` | — |
| `/search/saved/:filterId` | `SearchPage` | `frontend/src/pages/SearchPage` | — |
| `/uat` | `UatTestsPage` | `frontend/src/pages/UatTestsPage` | — |
| `/admin` | `Navigate` | `frontend/src/pages/Navigate` | — |
| `/admin/dashboard` | `AdminDashboardPage` | `frontend/src/pages/admin/AdminDashboardPage` | — |
| `/admin/monitoring` | `AdminMonitoringPage` | `frontend/src/pages/admin/AdminMonitoringPage` | — |
| `/admin/projects` | `AdminProjectsPage` | `frontend/src/pages/admin/AdminProjectsPage` | — |
| `/admin/categories` | `AdminCategoriesPage` | `frontend/src/pages/admin/AdminCategoriesPage` | — |
| `/admin/link-types` | `AdminLinkTypesPage` | `frontend/src/pages/admin/AdminLinkTypesPage` | — |
| `/admin/issue-type-configs` | `AdminIssueTypeConfigsPage` | `frontend/src/pages/admin/AdminIssueTypeConfigsPage` | — |
| `/admin/issue-type-schemes` | `AdminIssueTypeSchemesPage` | `frontend/src/pages/admin/AdminIssueTypeSchemesPage` | — |
| `/admin/users` | `AdminUsersPage` | `frontend/src/pages/admin/AdminUsersPage` | — |
| `/admin/roles` | `AdminRolesPage` | `frontend/src/pages/admin/AdminRolesPage` | — |
| `/admin/custom-fields` | `AdminCustomFieldsPage` | `frontend/src/pages/admin/AdminCustomFieldsPage` | — |
| `/admin/field-schemas` | `AdminFieldSchemasPage` | `frontend/src/pages/admin/AdminFieldSchemasPage` | — |
| `/admin/field-schemas/:id` | `AdminFieldSchemaDetailPage` | `frontend/src/pages/admin/AdminFieldSchemaDetailPage` | — |
| `/admin/workflow-statuses` | `AdminWorkflowStatusesPage` | `frontend/src/pages/admin/AdminWorkflowStatusesPage` | — |
| `/admin/workflows` | `AdminWorkflowsPage` | `frontend/src/pages/admin/AdminWorkflowsPage` | — |
| `/admin/workflows/:id` | `AdminWorkflowEditorPage` | `frontend/src/pages/admin/AdminWorkflowEditorPage` | — |
| `/admin/workflow-schemes` | `AdminWorkflowSchemesPage` | `frontend/src/pages/admin/AdminWorkflowSchemesPage` | — |
| `/admin/workflow-schemes/:id` | `AdminWorkflowSchemeEditorPage` | `frontend/src/pages/admin/AdminWorkflowSchemeEditorPage` | — |
| `/admin/role-schemes` | `AdminRoleSchemesPage` | `frontend/src/pages/admin/AdminRoleSchemesPage` | — |
| `/admin/role-schemes/:id` | `AdminRoleSchemeDetailPage` | `frontend/src/pages/admin/AdminRoleSchemeDetailPage` | — |
| `/admin/user-groups` | `AdminGate` | `frontend/src/pages/AdminGate` | — |
| `/admin/user-groups/:id` | `AdminGate` | `frontend/src/pages/AdminGate` | — |
| `/admin/transition-screens` | `AdminTransitionScreensPage` | `frontend/src/pages/admin/AdminTransitionScreensPage` | — |
| `/admin/transition-screens/:id` | `AdminTransitionScreenEditorPage` | `frontend/src/pages/admin/AdminTransitionScreenEditorPage` | — |
| `/admin/release-workflows` | `AdminReleaseWorkflowsPage` | `frontend/src/pages/admin/AdminReleaseWorkflowsPage` | — |
| `/admin/release-workflows/:id` | `AdminReleaseWorkflowEditorPage` | `frontend/src/pages/admin/AdminReleaseWorkflowEditorPage` | — |
| `/admin/release-statuses` | `AdminReleaseStatusesPage` | `frontend/src/pages/admin/AdminReleaseStatusesPage` | — |
| `/admin/release-checkpoint-types` | `AdminGate` | `frontend/src/pages/AdminGate` | — |
| `/admin/release-checkpoint-templates` | `AdminGate` | `frontend/src/pages/AdminGate` | — |
| `/admin/checkpoint-audit` | `AdminGate` | `frontend/src/pages/AdminGate` | — |
| `/admin/system` | `AdminSystemPage` | `frontend/src/pages/admin/AdminSystemPage` | — |
| `/settings` | `SettingsPage` | `frontend/src/pages/SettingsPage` | — |
| `/pipeline` | `PipelineDashboardPage` | `frontend/src/pages/PipelineDashboardPage` | — |
| `/*` | `Navigate` | `frontend/src/pages/Navigate` | — |
<!-- AUTO-GENERATED:END -->

<!-- AUTO-GENERATED:START:stores -->
> ⚡ Авто-сгенерировано из `frontend/src/store/*.ts`
> Обновляется при изменении store-файлов.

### `auth.store`

Файл: `frontend/src/store/auth.store.ts` · 2 полей состояния · 4 экшенов

| Поле / Экшен | Тип | Вид |
|-------------|-----|-----|
| `user` | `User | null` | состояние |
| `loading` | `boolean` | состояние |
| `login` | `(email: string, password: string) => Promise<void>` | экшен |
| `register` | `(email: string, password: string, name: string) => Promis...` | экшен |
| `logout` | `() => Promise<void>` | экшен |
| `loadUser` | `() => Promise<void>` | экшен |

### `issues.store`

Файл: `frontend/src/store/issues.store.ts` · 8 полей состояния · 3 экшенов

| Поле / Экшен | Тип | Вид |
|-------------|-----|-----|
| `issues` | `Issue[]` | состояние |
| `loading` | `boolean` | состояние |
| `error` | `string | null` | состояние |
| `total` | `number` | состояние |
| `currentPage` | `number` | состояние |
| `pageSize` | `number` | состояние |
| `currentProjectId` | `string | null` | состояние |
| `filters` | `IssuesFilters` | состояние |
| `setFilters` | `(filters: Partial<IssuesFilters>) => void` | экшен |
| `resetFilters` | `() => void` | экшен |
| `fetchIssues` | `(projectId: string, page?: number) => Promise<void>` | экшен |

### `projects.store`

Файл: `frontend/src/store/projects.store.ts` · 2 полей состояния · 1 экшенов

| Поле / Экшен | Тип | Вид |
|-------------|-----|-----|
| `projects` | `Project[]` | состояние |
| `loading` | `boolean` | состояние |
| `fetchProjects` | `() => Promise<void>` | экшен |

### `savedFilters.store`

Файл: `frontend/src/store/savedFilters.store.ts` · 7 полей состояния · 7 экшенов

| Поле / Экшен | Тип | Вид |
|-------------|-----|-----|
| `mine` | `SavedFilter[]` | состояние |
| `favorite` | `SavedFilter[]` | состояние |
| `public` | `SavedFilter[]` | состояние |
| `shared` | `SavedFilter[]` | состояние |
| `recent` | `SavedFilter[]` | состояние |
| `loading` | `boolean` | состояние |
| `error` | `string | null` | состояние |
| `load` | `(scope: SavedFilterScope) => Promise<void>` | экшен |
| `loadAll` | `() => Promise<void>` | экшен |
| `create` | `(input: CreateSavedFilterInput) => Promise<SavedFilter>` | экшен |
| `update` | `(id: string, input: UpdateSavedFilterInput) => Promise<Sa...` | экшен |
| `remove` | `(id: string) => Promise<void>` | экшен |
| `toggleFavorite` | `(id: string, value: boolean) => Promise<void>` | экшен |
| `share` | `(id: string, input: ShareSavedFilterInput) => Promise<void>` | экшен |

### `theme.store`

Файл: `frontend/src/store/theme.store.ts` · 1 полей состояния · 2 экшенов

| Поле / Экшен | Тип | Вид |
|-------------|-----|-----|
| `mode` | `ThemeMode` | состояние |
| `setMode` | `(mode: ThemeMode) => void` | экшен |
| `toggle` | `() => void` | экшен |

### `uatOnboarding.store`

Файл: `frontend/src/store/uatOnboarding.store.ts` · 2 полей состояния · 4 экшенов

| Поле / Экшен | Тип | Вид |
|-------------|-----|-----|
| `activeTest` | `UatTest | null` | состояние |
| `currentStepIndex` | `number` | состояние |
| `startTest` | `(test: UatTest) => void` | экшен |
| `nextStep` | `() => void` | экшен |
| `prevStep` | `() => void` | экшен |
| `stopTest` | `() => void` | экшен |

### `ui.store`

Файл: `frontend/src/store/ui.store.ts` · 1 полей состояния · 2 экшенов

| Поле / Экшен | Тип | Вид |
|-------------|-----|-----|
| `sidebarCollapsed` | `boolean` | состояние |
| `setSidebarCollapsed` | `(collapsed: boolean) => void` | экшен |
| `toggleSidebar` | `() => void` | экшен |
<!-- AUTO-GENERATED:END:stores -->
