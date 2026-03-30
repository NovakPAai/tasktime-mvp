# Access Rights in Flow Universe

## Role System Overview

The system has two levels of roles:

- **Global roles** — assigned to a user at registration or by an administrator. Define what a user can do across the entire system.
- **Project roles** — assigned to a user within a specific project. Stored in the `UserProjectRole` table, they provide fine-grained access control within a project scope.

---

## Global Roles

| Role | Description |
|------|-------------|
| `SUPER_ADMIN` | Superadministrator. Bypasses all permission checks. The only role that can assign project roles and delete users. |
| `ADMIN` | System administrator. Manages users, projects, and teams. Cannot delete users or assign project roles. |
| `MANAGER` | Project manager. Manages tasks, sprints, releases, and teams. Cannot manage system users. |
| `USER` | Regular team member. Creates and edits tasks, logs time, and leaves comments. Cannot manage sprints or teams. |
| `VIEWER` | Observer. Reads data and views statistics and activity logs. Cannot create or modify anything. |

---

## System-Level Permissions (Global)

### User Management

| Action | SUPER_ADMIN | ADMIN | MANAGER | USER | VIEWER |
|--------|:-----------:|:-----:|:-------:|:----:|:------:|
| View user list | ✅ | ✅ | ❌ | ❌ | ❌ |
| Create users | ✅ | ❌ | ❌ | ❌ | ❌ |
| Edit users | ✅ | ✅ | ❌ | ❌ | ❌ |
| Delete users | ✅ | ❌ | ❌ | ❌ | ❌ |
| Change user global role | ✅ | ✅ | ❌ | ❌ | ❌ |
| Deactivate user | ✅ | ✅ | ❌ | ❌ | ❌ |
| Reset user password | ✅ | ✅ | ❌ | ❌ | ❌ |
| Assign project roles to users | ✅ | ❌ | ❌ | ❌ | ❌ |
| View user project roles | ✅ | ✅ | ❌ | ❌ | ❌ |
| Change own password | ✅ | ✅ | ✅ | ✅ | ✅ |

### Project Management

| Action | SUPER_ADMIN | ADMIN | MANAGER | USER | VIEWER |
|--------|:-----------:|:-----:|:-------:|:----:|:------:|
| View project list | ✅ | ✅ | ✅ | ✅ | ✅ |
| View project details | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create project | ✅ | ✅ | ✅ | ❌ | ❌ |
| Edit project | ✅ | ✅ | ✅ | ❌ | ❌ |
| Delete project | ✅ | ✅ | ❌ | ❌ | ❌ |
| Manage project categories | ✅ | ✅ | ❌ | ❌ | ❌ |

### Issue Management

| Action | SUPER_ADMIN | ADMIN | MANAGER | USER | VIEWER |
|--------|:-----------:|:-----:|:-------:|:----:|:------:|
| View issues | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create issues | ✅ | ✅ | ✅ | ✅ | ❌ |
| Edit issues | ✅ | ✅ | ✅ | ✅ | ❌ |
| Change issue status | ✅ | ✅ | ✅ | ✅ | ❌ |
| Assign issue to user | ✅ | ✅ | ✅ | ❌ | ❌ |
| Delete issue | ✅ | ✅ | ❌ | ❌ | ❌ |
| Bulk update issues | ✅ | ✅ | ✅ | ❌ | ❌ |
| Bulk delete issues | ✅ | ✅ | ❌ | ❌ | ❌ |
| Manage issue AI flags | ✅ | ✅ | ✅ | ❌ | ❌ |
| Link issues | ✅ | ✅ | ✅ | ✅ | ❌ |
| Delete issue links | ✅ | ✅ | ❌ | ❌ | ❌ |
| View issue history | ✅ | ✅ | ✅ | ✅ | ✅ |
| Search issues (global) | ✅ | ✅ | ✅ | ✅ | ✅ |

### Sprint Management

| Action | SUPER_ADMIN | ADMIN | MANAGER | USER | VIEWER |
|--------|:-----------:|:-----:|:-------:|:----:|:------:|
| View sprints | ✅ | ✅ | ✅ | ✅ | ✅ |
| View backlog | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create sprint | ✅ | ✅ | ✅ | ❌ | ❌ |
| Edit sprint | ✅ | ✅ | ✅ | ❌ | ❌ |
| Start sprint | ✅ | ✅ | ✅ | ❌ | ❌ |
| Close sprint | ✅ | ✅ | ✅ | ❌ | ❌ |
| Move issues to sprint | ✅ | ✅ | ✅ | ❌ | ❌ |
| Move issues to backlog | ✅ | ✅ | ✅ | ✅ | ❌ |

### Kanban Board

| Action | SUPER_ADMIN | ADMIN | MANAGER | USER | VIEWER |
|--------|:-----------:|:-----:|:-------:|:----:|:------:|
| View board | ✅ | ✅ | ✅ | ✅ | ✅ |
| Drag and drop issues on board | ✅ | ✅ | ✅ | ✅ | ❌ |

### Release Management

| Action | SUPER_ADMIN | ADMIN | MANAGER | USER | VIEWER |
|--------|:-----------:|:-----:|:-------:|:----:|:------:|
| View releases | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create release | ✅ | ✅ | ✅ | ❌ | ❌ |
| Edit release | ✅ | ✅ | ✅ | ❌ | ❌ |
| Add issues to release | ✅ | ✅ | ✅ | ❌ | ❌ |
| Remove issues from release | ✅ | ✅ | ✅ | ❌ | ❌ |
| Mark release as READY | ✅ | ✅ | ✅ | ❌ | ❌ |
| Mark release as RELEASED | ✅ | ✅ | ✅ | ❌ | ❌ |

### Team Management

| Action | SUPER_ADMIN | ADMIN | MANAGER | USER | VIEWER |
|--------|:-----------:|:-----:|:-------:|:----:|:------:|
| View teams | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create team | ✅ | ✅ | ✅ | ❌ | ❌ |
| Edit team | ✅ | ✅ | ✅ | ❌ | ❌ |
| Delete team | ✅ | ✅ | ❌ | ❌ | ❌ |
| Manage team members | ✅ | ✅ | ✅ | ❌ | ❌ |

### Time Tracking

| Action | SUPER_ADMIN | ADMIN | MANAGER | USER | VIEWER |
|--------|:-----------:|:-----:|:-------:|:----:|:------:|
| Start / stop timer | ✅ | ✅ | ✅ | ✅ | ❌ |
| Add manual time entry | ✅ | ✅ | ✅ | ✅ | ❌ |
| View own time logs | ✅ | ✅ | ✅ | ✅ | ❌ |
| View other users' time logs | ✅ | ✅ | ✅ | ❌ | ❌ |
| View active timer | ✅ | ✅ | ✅ | ✅ | ❌ |

### Comments

| Action | SUPER_ADMIN | ADMIN | MANAGER | USER | VIEWER |
|--------|:-----------:|:-----:|:-------:|:----:|:------:|
| Read comments | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create comments | ✅ | ✅ | ✅ | ✅ | ❌ |
| Edit own comment | ✅ | ✅ | ✅ | ✅ | ❌ |
| Edit others' comments | ✅ | ✅ | ❌ | ❌ | ❌ |
| Delete own comment | ✅ | ✅ | ✅ | ✅ | ❌ |
| Delete others' comments | ✅ | ✅ | ❌ | ❌ | ❌ |

### AI Features

| Action | SUPER_ADMIN | ADMIN | MANAGER | USER | VIEWER |
|--------|:-----------:|:-----:|:-------:|:----:|:------:|
| AI effort estimation | ✅ | ✅ | ✅ | ✅ | ❌ |
| AI issue decomposition | ✅ | ✅ | ✅ | ✅ | ❌ |
| AI assignee suggestion | ✅ | ✅ | ✅ | ✅ | ❌ |
| Register AI session | ✅ | ✅ | ✅ | ❌ | ❌ |

### Administration & Monitoring

| Action | SUPER_ADMIN | ADMIN | MANAGER | USER | VIEWER |
|--------|:-----------:|:-----:|:-------:|:----:|:------:|
| View system statistics | ✅ | ✅ | ✅ | ❌ | ✅ |
| View activity log | ✅ | ✅ | ✅ | ❌ | ✅ |
| View performance metrics | ✅ | ✅ | ✅ | ❌ | ❌ |
| Clear metrics | ✅ | ✅ | ❌ | ❌ | ❌ |
| Manage issue type configs/schemes | ✅ | ✅ | ❌ | ❌ | ❌ |
| View issue type configs/schemes | ✅ | ✅ | ✅ | ❌ | ❌ |
| Manage link types | ✅ | ✅ | ❌ | ❌ | ❌ |
| View link types | ✅ | ✅ | ✅ | ❌ | ❌ |
| View UAT tests | ✅ | ✅ | ✅ | ✅ | ✅ |
| Upload Web Vitals (frontend) | ✅ | ✅ | ✅ | ✅ | ✅ |

---

## Project Roles

In addition to global roles, a user can be assigned a role within a specific project. Assignment is performed by `SUPER_ADMIN` via `/api/admin/users/:id/roles`.

| Role | Description |
|------|-------------|
| `ADMIN` (project) | Full control over the project: all actions with issues, members, and settings. |
| `MANAGER` (project) | Manages sprints, assigns issues, works with releases. |
| `USER` (project) | Works with issues: create, edit, log time, add comments. |
| `VIEWER` (project) | Read-only access to project data. |

> **Note:** In the current implementation (Sprints 1–5), project-level role checks are not enforced at the route level — only global roles are used. Project roles are stored in the `UserProjectRole` table and will be enforced in future versions for fine-grained access control.

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

The following endpoints are accessible without authentication:

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

- **SUPER_ADMIN bypasses all checks.** The `isSuperAdmin()` middleware check passes superadmins through without verifying any role.
- **Service-level checks.** Some permissions are enforced in service code rather than middleware: editing/deleting a comment (author or ADMIN), viewing other users' time logs (ADMIN/MANAGER only).
- **Audit log.** All mutations are recorded in the `AuditLog` table with user, action, entity, IP address, and User-Agent. Read operations are not logged.
