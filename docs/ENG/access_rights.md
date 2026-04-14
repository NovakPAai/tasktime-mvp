# Access Rights in Flow Universe

## Role System Overview

The system has two levels of roles:

- **System roles** — assigned to a user at account creation or by an administrator. Define what a user can do across the entire system. Stored in the `UserSystemRole` junction table (multi-role: a user may hold multiple roles simultaneously).
- **Project roles** — assigned to a user within a specific project. Stored in the `UserProjectRole` table, they control access within a project scope.

---

## System Roles

| Role | Description |
|------|-------------|
| `SUPER_ADMIN` | Superadministrator. Bypasses all permission checks. The only role that can create users, assign project roles, modify system settings, and delete users. |
| `ADMIN` | System administrator. Manages users, projects, teams, sprints, and issues. Can assign system roles (except `SUPER_ADMIN` and `ADMIN`). |
| `RELEASE_MANAGER` | Release manager. Creates, edits, and transitions releases; adds/removes issues from releases. Cannot manage users, sprints, or teams. |
| `USER` | Base role. Automatically assigned to every user and cannot be revoked. Works with issues, comments, time tracking, and AI features. Access to projects is gated by project membership (`UserProjectRole`). |
| `AUDITOR` | Auditor. Reads system statistics, activity logs, and reports. Cannot create or modify data. |

> **Note:** Roles are additive. A user may hold multiple roles simultaneously (e.g. `USER` + `RELEASE_MANAGER`). `SUPER_ADMIN` bypasses all checks regardless of other roles.

> **Project access for USER:** Users with only the `USER` role (no `ADMIN` / `AUDITOR` / `RELEASE_MANAGER`) can see only the projects and issues they are explicitly members of via `UserProjectRole`.

---

## System-Level Permissions

### User Management

| Action | SUPER_ADMIN | ADMIN | RELEASE_MANAGER | USER | AUDITOR |
|--------|:-----------:|:-----:|:---------------:|:----:|:-------:|
| View user list | ✅ | ✅ | ✅ | ✅ | ✅ |
| View user profile | ✅ | ✅ | ✅ | ✅ | ✅ |
| Edit own profile | ✅ | ✅ | ✅ | ✅ | ✅ |
| Deactivate user | ✅ | ✅ | ❌ | ❌ | ❌ |
| Create user (Admin UI) | ✅ | ❌ | ❌ | ❌ | ❌ |
| Edit user (Admin UI) | ✅ | ✅ | ❌ | ❌ | ❌ |
| Delete user | ✅ | ❌ | ❌ | ❌ | ❌ |
| Reset user password | ✅ | ✅ | ❌ | ❌ | ❌ |
| View user system roles | ✅ | ✅ | ❌ | ❌ | ❌ |
| Assign system roles (RELEASE_MANAGER, USER, AUDITOR) | ✅ | ✅ | ❌ | ❌ | ❌ |
| Assign ADMIN / SUPER_ADMIN roles | ✅ | ❌ | ❌ | ❌ | ❌ |
| Assign project roles to users | ✅ | ❌ | ❌ | ❌ | ❌ |
| View user project roles | ✅ | ✅ | ❌ | ❌ | ❌ |
| Change own password | ✅ | ✅ | ✅ | ✅ | ✅ |

### Project Management

| Action | SUPER_ADMIN | ADMIN | RELEASE_MANAGER | USER | AUDITOR |
|--------|:-----------:|:-----:|:---------------:|:----:|:-------:|
| View project list | ✅ | ✅ | ✅ | ✅ * | ✅ |
| View project details | ✅ | ✅ | ✅ | ✅ * | ✅ |
| Create project | ✅ | ✅ | ❌ | ❌ | ❌ |
| Edit project | ✅ | ✅ | ❌ | ❌ | ❌ |
| Delete project | ✅ | ✅ | ❌ | ❌ | ❌ |
| Manage project categories | ✅ | ✅ | ❌ | ❌ | ❌ |

> \* USER sees only projects they are a member of via `UserProjectRole`.

### Issue Management

| Action | SUPER_ADMIN | ADMIN | RELEASE_MANAGER | USER | AUDITOR |
|--------|:-----------:|:-----:|:---------------:|:----:|:-------:|
| View issues | ✅ | ✅ | ✅ | ✅ * | ✅ |
| Create issues | ✅ | ✅ | ❌ | ✅ * | ❌ |
| Edit issues | ✅ | ✅ | ❌ | ✅ * | ❌ |
| Change issue status | ✅ | ✅ | ❌ | ✅ * | ❌ |
| Assign issue to user | ✅ | ✅ | ❌ | ❌ | ❌ |
| Delete issue | ✅ | ✅ | ❌ | ❌ | ❌ |
| Bulk update issues | ✅ | ✅ | ❌ | ❌ | ❌ |
| Bulk delete issues | ✅ | ✅ | ❌ | ❌ | ❌ |
| Manage issue AI flags | ✅ | ✅ | ❌ | ❌ | ❌ |
| Link issues | ✅ | ✅ | ❌ | ✅ * | ❌ |
| Delete issue links | ✅ | ✅ | ❌ | ❌ | ❌ |
| View issue history | ✅ | ✅ | ✅ | ✅ * | ✅ |
| Search issues (global) | ✅ | ✅ | ✅ | ✅ * | ✅ |

> \* USER — project membership required.

### Sprint Management

| Action | SUPER_ADMIN | ADMIN | RELEASE_MANAGER | USER | AUDITOR |
|--------|:-----------:|:-----:|:---------------:|:----:|:-------:|
| View sprints | ✅ | ✅ | ✅ | ✅ | ✅ |
| View backlog | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create sprint | ✅ | ✅ | ❌ | ❌ | ❌ |
| Edit sprint | ✅ | ✅ | ❌ | ❌ | ❌ |
| Start sprint | ✅ | ✅ | ❌ | ❌ | ❌ |
| Close sprint | ✅ | ✅ | ❌ | ❌ | ❌ |
| Move issues to sprint | ✅ | ✅ | ❌ | ❌ | ❌ |
| Move issues to backlog | ✅ | ✅ | ❌ | ❌ | ❌ |

### Kanban Board

| Action | SUPER_ADMIN | ADMIN | RELEASE_MANAGER | USER | AUDITOR |
|--------|:-----------:|:-----:|:---------------:|:----:|:-------:|
| View board | ✅ | ✅ | ✅ | ✅ * | ✅ |
| Drag and drop issues | ✅ | ✅ | ❌ | ✅ * | ❌ |

> \* USER — project membership required.

### Release Management

| Action | SUPER_ADMIN | ADMIN | RELEASE_MANAGER | USER | AUDITOR |
|--------|:-----------:|:-----:|:---------------:|:----:|:-------:|
| View releases | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create release | ✅ | ✅ | ✅ | ❌ | ❌ |
| Edit release | ✅ | ✅ | ✅ | ❌ | ❌ |
| Add issues to release | ✅ | ✅ | ✅ | ❌ | ❌ |
| Remove issues from release | ✅ | ✅ | ✅ | ❌ | ❌ |
| Mark release as READY | ✅ | ✅ | ✅ | ❌ | ❌ |
| Mark release as RELEASED | ✅ | ✅ | ✅ | ❌ | ❌ |

### Team Management

| Action | SUPER_ADMIN | ADMIN | RELEASE_MANAGER | USER | AUDITOR |
|--------|:-----------:|:-----:|:---------------:|:----:|:-------:|
| View teams | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create team | ✅ | ✅ | ❌ | ❌ | ❌ |
| Edit team | ✅ | ✅ | ❌ | ❌ | ❌ |
| Delete team | ✅ | ✅ | ❌ | ❌ | ❌ |
| Manage team members | ✅ | ✅ | ❌ | ❌ | ❌ |

### Time Tracking

| Action | SUPER_ADMIN | ADMIN | RELEASE_MANAGER | USER | AUDITOR |
|--------|:-----------:|:-----:|:---------------:|:----:|:-------:|
| Start / stop timer | ✅ | ✅ | ✅ | ✅ | ❌ |
| Add manual time entry | ✅ | ✅ | ✅ | ✅ | ❌ |
| View own time logs | ✅ | ✅ | ✅ | ✅ | ❌ |
| View other users' time logs | ✅ | ✅ | ❌ | ❌ | ❌ |
| View active timer | ✅ | ✅ | ✅ | ✅ | ❌ |

### Comments

| Action | SUPER_ADMIN | ADMIN | RELEASE_MANAGER | USER | AUDITOR |
|--------|:-----------:|:-----:|:---------------:|:----:|:-------:|
| Read comments | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create comments | ✅ | ✅ | ✅ | ✅ | ❌ |
| Edit own comment | ✅ | ✅ | ✅ | ✅ | ❌ |
| Edit others' comments | ✅ | ✅ | ❌ | ❌ | ❌ |
| Delete own comment | ✅ | ✅ | ✅ | ✅ | ❌ |
| Delete others' comments | ✅ | ✅ | ❌ | ❌ | ❌ |

### AI Features

| Action | SUPER_ADMIN | ADMIN | RELEASE_MANAGER | USER | AUDITOR |
|--------|:-----------:|:-----:|:---------------:|:----:|:-------:|
| AI effort estimation | ✅ | ✅ | ❌ | ✅ | ❌ |
| AI issue decomposition | ✅ | ✅ | ❌ | ✅ | ❌ |
| AI assignee suggestion | ✅ | ✅ | ❌ | ✅ | ❌ |
| Register AI session | ✅ | ✅ | ✅ | ✅ | ✅ |

### Administration & Monitoring

| Action | SUPER_ADMIN | ADMIN | RELEASE_MANAGER | USER | AUDITOR |
|--------|:-----------:|:-----:|:---------------:|:----:|:-------:|
| View system statistics | ✅ | ✅ | ❌ | ❌ | ✅ |
| View activity log | ✅ | ✅ | ❌ | ❌ | ✅ |
| View reports (by status / assignee) | ✅ | ✅ | ❌ | ❌ | ✅ |
| View performance metrics | ✅ | ✅ | ❌ | ❌ | ❌ |
| Clear metrics | ✅ | ✅ | ❌ | ❌ | ❌ |
| Manage issue type configs/schemes | ✅ | ✅ | ❌ | ❌ | ❌ |
| View issue type configs/schemes | ✅ | ✅ | ✅ | ❌ | ❌ |
| Manage link types | ✅ | ✅ | ❌ | ❌ | ❌ |
| View link types | ✅ | ✅ | ✅ | ❌ | ❌ |
| View UAT tests | ✅ | ✅ | ✅ | ✅ | ✅ |
| Upload Web Vitals (frontend) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Registration settings (read) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Registration settings (write) | ✅ | ❌ | ❌ | ❌ | ❌ |
| System settings (sessions, security) | ✅ | ❌ | ❌ | ❌ | ❌ |

---

## Project Roles

In addition to system roles, a user can be assigned a role within a specific project. Assignment is performed only by `SUPER_ADMIN` via `/api/admin/users/:id/roles`.

| Role | Description |
|------|-------------|
| `ADMIN` (project) | Full control over the project: all actions with issues, members, and settings. |
| `MANAGER` (project) | Manages sprints, assigns issues, works with releases. |
| `USER` (project) | Works with issues: create, edit, log time, add comments. |
| `VIEWER` (project) | Read-only access to project data. |

> **Current implementation:** Project roles are used to gate access for `USER` to projects and issues (`requireIssueAccess`, `requireProjectRole`). Users with system roles `ADMIN`, `RELEASE_MANAGER`, or `AUDITOR` have global read access to all projects without explicit membership.

### Project-Level Permissions by Role (Target Model)

| Action in Project | ADMIN | MANAGER | USER | VIEWER |
|-------------------|:-----:|:-------:|:----:|:------:|
| View issues | ✅ | ✅ | ✅ | ✅ |
| Create issues | ✅ | ✅ | ✅ | ❌ |
| Edit issues | ✅ | ✅ | ✅ | ❌ |
| Change issue status | ✅ | ✅ | ✅ | ❌ |
| Assign issue | ✅ | ✅ | ❌ | ❌ |
| Delete issues | ✅ | ❌ | ❌ | ❌ |
| Manage sprints | ✅ | ✅ | ❌ | ❌ |
| View Kanban board | ✅ | ✅ | ✅ | ✅ |
| Drag and drop on board | ✅ | ✅ | ✅ | ❌ |
| Log time | ✅ | ✅ | ✅ | ❌ |
| Leave comments | ✅ | ✅ | ✅ | ❌ |
| Manage releases | ✅ | ✅ | ❌ | ❌ |
| Configure project | ✅ | ❌ | ❌ | ❌ |
| Delete project | ✅ | ❌ | ❌ | ❌ |

---

## Public Endpoints (No Authentication Required)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/auth/register` | POST | Register a new user |
| `/api/auth/login` | POST | Log in |
| `/api/auth/refresh` | POST | Refresh access token |
| `/api/auth/logout` | POST | Log out |
| `/api/health` | GET | Health check |
| `/api/ready` | GET | Readiness check |
| `/api/integrations/gitlab/webhook` | POST | GitLab webhook (verified by secret token) |

---

## Implementation Notes

- **SUPER_ADMIN bypasses all checks.** The `isSuperAdmin()` check in middleware lets superadmins through without any role verification.
- **Multi-role RBAC.** Roles are stored in the `UserSystemRole` junction table. A user may hold multiple system roles; `hasAnySystemRole()` passes if at least one required role is present.
- **Global project read access.** `ADMIN`, `RELEASE_MANAGER`, `AUDITOR`, and `SUPER_ADMIN` can access all projects without explicit membership. A plain `USER` sees only projects they are a member of via `UserProjectRole`.
- **Service-level checks.** Some permissions are enforced in service code rather than middleware: editing/deleting a comment (author or ADMIN only), viewing other users' time logs (ADMIN only).
- **USER is the mandatory base role.** Attempting to remove the `USER` role returns an error. All other roles are optional add-ons.
- **Audit log.** All mutations are recorded in the `AuditLog` table with user, action, entity, IP address, and User-Agent. Read operations are not logged.
