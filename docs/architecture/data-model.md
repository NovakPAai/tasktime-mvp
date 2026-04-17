# Flow Universe — Data Model

> **Source:** `backend/src/prisma/schema.prisma`
> **Database:** PostgreSQL 16, ORM: Prisma 6
> **Last updated:** 2026-03-25

---

## Entity Overview

```
User ──────────────── RefreshToken
 │
 ├── assignedIssues ─────────────── Issue ──── Comment
 ├── createdIssues                    │ ├────── TimeLog ──── AiSession
 ├── auditLogs ─── AuditLog           │ ├────── AuditLog
 ├── timeLogs                         │ ├────── children (self)
 ├── aiSessions                       │
 └── teamMemberships ─── TeamMember   ├── Project ──── Sprint
                          │           │         └────── Release
                         Team
```

---

## Models

### User

```
users
├── id            UUID (PK)
├── email         String (unique)
├── password_hash String
├── name          String
├── role          UserRole (default: USER)
├── is_active     Boolean (default: true)
├── created_at    DateTime
└── updated_at    DateTime
```

**Relations:**
- `assignedIssues` → Issue[] (as assignee)
- `createdIssues` → Issue[] (as creator)
- `refreshTokens` → RefreshToken[]
- `auditLogs` → AuditLog[]
- `comments` → Comment[]
- `timeLogs` → TimeLog[]
- `aiSessions` → AiSession[]
- `teamMemberships` → TeamMember[]

---

### RefreshToken

```
refresh_tokens
├── id         UUID (PK)
├── token      String (unique)
├── user_id    UUID → users.id (CASCADE delete)
├── expires_at DateTime
└── created_at DateTime
```

---

### Project

```
projects
├── id          UUID (PK)
├── name        String
├── key         String (unique) — e.g. "DEMO", "TTMP"
├── description String?
├── created_at  DateTime
└── updated_at  DateTime
```

**Relations:** `issues` → Issue[], `sprints` → Sprint[], `releases` → Release[]

---

### Issue

The central model of the system. Supports full hierarchy.

```
issues
├── id               UUID (PK)
├── project_id       UUID → projects.id (CASCADE)
├── number           Int — sequential per project
├── title            String
├── description      String?
├── type             IssueType (default: TASK)
├── status           IssueStatus (default: OPEN)
├── priority         IssuePriority (default: MEDIUM)
├── order_index      Int (default: 0) — for board ordering
│
├── ai_eligible           Boolean (default: false)
├── ai_execution_status   AiExecutionStatus (default: NOT_STARTED)
├── ai_assignee_type      AiAssigneeType (default: HUMAN)
│
├── parent_id        UUID? → issues.id (self-reference)
├── assignee_id      UUID? → users.id
├── creator_id       UUID → users.id
├── sprint_id        UUID? → sprints.id
├── release_id       UUID? → releases.id
├── estimated_hours  Decimal(6,2)?
├── created_at       DateTime
└── updated_at       DateTime
```

**Indexes:** `[project_id, status]`, `[project_id, status, ai_eligible]`, `[assignee_id]`, `[parent_id]`, `[sprint_id]`, `[release_id]`

**Unique constraint:** `[project_id, number]` → generates keys like `TTMP-42`

**Issue key format:** `{project.key}-{issue.number}` (e.g. `DEMO-7`, `TTMP-83`)

---

### Sprint

```
sprints
├── id               UUID (PK)
├── project_id       UUID → projects.id (CASCADE)
├── name             String
├── goal             String?
├── start_date       DateTime?
├── end_date         DateTime?
├── state            SprintState (default: PLANNED)
├── project_team_id  UUID? → teams.id
├── business_team_id UUID? → teams.id
├── flow_team_id     UUID? → teams.id
├── created_at       DateTime
└── updated_at       DateTime
```

**Unique:** `[project_id, name]`

---

### Release

```
releases
├── id           UUID (PK)
├── project_id   UUID → projects.id (CASCADE)
├── name         String — version string e.g. "1.2.0"
├── description  String?
├── level        ReleaseLevel (default: MINOR)
├── state        ReleaseState (default: DRAFT)
├── release_date Date?
├── created_at   DateTime
└── updated_at   DateTime
```

**Unique:** `[project_id, name]`

---

### Comment

```
comments
├── id         UUID (PK)
├── issue_id   UUID → issues.id (CASCADE)
├── author_id  UUID → users.id
├── body       String
├── created_at DateTime
└── updated_at DateTime
```

---

### TimeLog

Supports both human-logged and AI-agent-logged time.

```
time_logs
├── id               UUID (PK)
├── issue_id         UUID → issues.id (CASCADE)
├── user_id          UUID? → users.id
├── hours            Decimal(6,2)
├── note             String?
├── started_at       DateTime?
├── stopped_at       DateTime?
├── log_date         Date (default: now)
├── source           TimeSource (default: HUMAN)
├── agent_session_id UUID? → ai_sessions.id
├── cost_money       Decimal(10,4)?
└── created_at       DateTime
```

---

### AiSession

Records Claude API usage per issue.

```
ai_sessions
├── id             UUID (PK)
├── issue_id       UUID? → issues.id
├── user_id        UUID? → users.id
├── model          String — e.g. "claude-sonnet-4-6"
├── provider       String — e.g. "anthropic"
├── started_at     DateTime
├── finished_at    DateTime
├── tokens_input   Int
├── tokens_output  Int
├── cost_money     Decimal(10,4)
├── notes          String?
└── created_at     DateTime
```

---

### AuditLog

All system mutations are logged here (ФЗ-152 compliance).

```
audit_logs
├── id           UUID (PK)
├── action       String — e.g. "issue.created", "issue.status_changed"
├── entity_type  String — e.g. "issue", "project"
├── entity_id    String
├── user_id      UUID? → users.id
├── details      JSON?
├── ip_address   String?
├── user_agent   String?
└── created_at   DateTime
```

**Indexes:** `[entity_type, entity_id]`, `[user_id]`, `[created_at]`

---

### Team

```
teams
├── id          UUID (PK)
├── name        String
├── description String?
├── created_at  DateTime
└── updated_at  DateTime
```

**Relations:** `members` → TeamMember[], linked to sprints as `projectTeam`, `businessTeam`, `flowTeam`

---

### TeamMember

```
team_members
├── id         UUID (PK)
├── team_id    UUID → teams.id (CASCADE)
├── user_id    UUID → users.id
├── role       String? — per-team role e.g. "LEAD", "DEVELOPER"
└── created_at DateTime
```

**Unique:** `[team_id, user_id]`

---

## Enums

### UserRole

| Value | Access level |
|-------|-------------|
| `SUPER_ADMIN` | Full system access, can assign ADMIN role |
| `ADMIN` | User management, all project access |
| `MANAGER` | Project management, all issue access |
| `USER` | Standard — own issues + assigned issues |
| `VIEWER` | Read-only access (e.g. CIO) |

### IssueType

| Value | Can be parent of | Can be child of |
|-------|-----------------|-----------------|
| `EPIC` | STORY, TASK | — (top level) |
| `STORY` | TASK, SUBTASK | EPIC |
| `TASK` | SUBTASK | EPIC, STORY |
| `SUBTASK` | — (leaf) | STORY, TASK |
| `BUG` | SUBTASK | EPIC, STORY |

### IssueStatus

`OPEN` → `IN_PROGRESS` → `REVIEW` → `DONE` / `CANCELLED`

### IssuePriority

`CRITICAL` | `HIGH` | `MEDIUM` | `LOW`

### SprintState

`PLANNED` → `ACTIVE` → `CLOSED`

### ReleaseLevel / ReleaseState

Level: `MINOR` (bug fixes, small improvements) | `MAJOR` (new features)
State: `DRAFT` → `READY` → `RELEASED`

### AiExecutionStatus

`NOT_STARTED` | `IN_PROGRESS` | `DONE` | `FAILED`

### AiAssigneeType

`HUMAN` | `AGENT` | `MIXED`

### TimeSource

`HUMAN` | `AGENT`

---

## How to update this doc

When `backend/src/prisma/schema.prisma` changes → update this file.
Run `make docs` to check for staleness warnings.

<!-- AUTO-GENERATED:START -->
> ⚡ Авто-сгенерировано из `backend/src/prisma/schema.prisma`
> Обновляется автоматически при каждом изменении схемы.

## Модели (48)

### User

| Поле | Тип | Nullable | Примечание |
|------|-----|----------|------------|
| `id` | `String` | нет | PK, default: uuid( |
| `email` | `String` | нет | UNIQUE |
| `passwordHash` | `String` | нет |  |
| `name` | `String` | нет |  |
| `isActive` | `Boolean` | нет | default: true |
| `isSystem` | `Boolean` | нет | default: false |
| `mustChangePassword` | `Boolean` | нет | default: false |
| `createdAt` | `DateTime` | нет | default: now( |
| `updatedAt` | `DateTime` | нет |  |
| `assignedIssues` | `Issue[]` | нет |  |
| `createdIssues` | `Issue[]` | нет |  |
| `refreshTokens` | `RefreshToken[]` | нет |  |
| `auditLogs` | `AuditLog[]` | нет |  |
| `comments` | `Comment[]` | нет |  |
| `timeLogs` | `TimeLog[]` | нет |  |
| `aiSessions` | `AiSession[]` | нет |  |
| `teamMemberships` | `TeamMember[]` | нет |  |
| `createdLinks` | `IssueLink[]` | нет |  |
| `ownedProjects` | `Project[]` | нет |  |
| `projectRoles` | `UserProjectRole[]` | нет |  |
| `systemRoles` | `UserSystemRole[]` | нет |  |
| `customFieldUpdates` | `IssueCustomFieldValue[]` | нет |  |
| `createdReleases` | `Release[]` | нет |  |
| `addedReleaseItems` | `ReleaseItem[]` | нет |  |
| `groupMemberships` | `UserGroupMember[]` | нет |  |
| `addedGroupMembers` | `UserGroupMember[]` | нет |  |

### UserSystemRole

| Поле | Тип | Nullable | Примечание |
|------|-----|----------|------------|
| `id` | `String` | нет | PK, default: uuid( |
| `userId` | `String` | нет |  |
| `role` | `SystemRoleType` | нет |  |
| `createdAt` | `DateTime` | нет | default: now( |
| `createdBy` | `String` | да |  |
| `user` | `User` | нет |  |

### RefreshToken

| Поле | Тип | Nullable | Примечание |
|------|-----|----------|------------|
| `id` | `String` | нет | PK, default: uuid( |
| `token` | `String` | нет | UNIQUE |
| `userId` | `String` | нет |  |
| `expiresAt` | `DateTime` | нет |  |
| `createdAt` | `DateTime` | нет | default: now( |
| `user` | `User` | нет |  |

### UserProjectRole

| Поле | Тип | Nullable | Примечание |
|------|-----|----------|------------|
| `id` | `String` | нет | PK, default: uuid( |
| `userId` | `String` | нет |  |
| `projectId` | `String` | нет |  |
| `role` | `ProjectRole` | нет |  |
| `roleId` | `String` | да |  |
| `schemeId` | `String` | да |  |
| `source` | `RoleAssignmentSource` | нет | default: DIRECT |
| `createdAt` | `DateTime` | нет | default: now( |
| `user` | `User` | нет |  |
| `project` | `Project` | нет |  |
| `roleDefinition` | `ProjectRoleDefinition` | да |  |

### ProjectCategory

| Поле | Тип | Nullable | Примечание |
|------|-----|----------|------------|
| `id` | `String` | нет | PK, default: uuid( |
| `name` | `String` | нет | UNIQUE |
| `description` | `String` | да |  |
| `createdAt` | `DateTime` | нет | default: now( |
| `updatedAt` | `DateTime` | нет |  |
| `projects` | `Project[]` | нет |  |

### Project

| Поле | Тип | Nullable | Примечание |
|------|-----|----------|------------|
| `id` | `String` | нет | PK, default: uuid( |
| `name` | `String` | нет |  |
| `key` | `String` | нет | UNIQUE |
| `description` | `String` | да |  |
| `ownerId` | `String` | да |  |
| `categoryId` | `String` | да |  |
| `createdAt` | `DateTime` | нет | default: now( |
| `updatedAt` | `DateTime` | нет |  |
| `owner` | `User` | да |  |
| `category` | `ProjectCategory` | да |  |
| `issues` | `Issue[]` | нет |  |
| `sprints` | `Sprint[]` | нет |  |
| `releases` | `Release[]` | нет |  |
| `issueTypeScheme` | `IssueTypeSchemeProject` | да |  |
| `userRoles` | `UserProjectRole[]` | нет |  |
| `groupRoles` | `ProjectGroupRole[]` | нет |  |
| `fieldSchemaBindings` | `FieldSchemaBinding[]` | нет |  |
| `workflowScheme` | `WorkflowSchemeProject` | да |  |
| `roleScheme` | `ProjectRoleSchemeProject` | да |  |

### IssueTypeConfig

| Поле | Тип | Nullable | Примечание |
|------|-----|----------|------------|
| `id` | `String` | нет | PK, default: uuid( |
| `name` | `String` | нет |  |
| `description` | `String` | да |  |
| `iconName` | `String` | нет |  |
| `iconColor` | `String` | нет |  |
| `isSubtask` | `Boolean` | нет | default: false |
| `isEnabled` | `Boolean` | нет | default: true |
| `isSystem` | `Boolean` | нет | default: false |
| `systemKey` | `String` | да | UNIQUE |
| `orderIndex` | `Int` | нет | default: 0 |
| `createdAt` | `DateTime` | нет | default: now( |
| `updatedAt` | `DateTime` | нет |  |
| `schemeItems` | `IssueTypeSchemeItem[]` | нет |  |
| `issues` | `Issue[]` | нет |  |
| `fieldSchemaBindings` | `FieldSchemaBinding[]` | нет |  |
| `workflowSchemeItems` | `WorkflowSchemeItem[]` | нет |  |

### IssueTypeScheme

| Поле | Тип | Nullable | Примечание |
|------|-----|----------|------------|
| `id` | `String` | нет | PK, default: uuid( |
| `name` | `String` | нет |  |
| `description` | `String` | да |  |
| `isDefault` | `Boolean` | нет | default: false |
| `createdAt` | `DateTime` | нет | default: now( |
| `updatedAt` | `DateTime` | нет |  |
| `items` | `IssueTypeSchemeItem[]` | нет |  |
| `projects` | `IssueTypeSchemeProject[]` | нет |  |

### IssueTypeSchemeItem

| Поле | Тип | Nullable | Примечание |
|------|-----|----------|------------|
| `id` | `String` | нет | PK, default: uuid( |
| `schemeId` | `String` | нет |  |
| `typeConfigId` | `String` | нет |  |
| `orderIndex` | `Int` | нет | default: 0 |
| `scheme` | `IssueTypeScheme` | нет |  |
| `typeConfig` | `IssueTypeConfig` | нет |  |

### IssueTypeSchemeProject

| Поле | Тип | Nullable | Примечание |
|------|-----|----------|------------|
| `id` | `String` | нет | PK, default: uuid( |
| `schemeId` | `String` | нет |  |
| `projectId` | `String` | нет | UNIQUE |
| `createdAt` | `DateTime` | нет | default: now( |
| `scheme` | `IssueTypeScheme` | нет |  |
| `project` | `Project` | нет |  |

### Issue

| Поле | Тип | Nullable | Примечание |
|------|-----|----------|------------|
| `id` | `String` | нет | PK, default: uuid( |
| `projectId` | `String` | нет |  |
| `number` | `Int` | нет |  |
| `title` | `String` | нет |  |
| `description` | `String` | да |  |
| `issueTypeConfigId` | `String` | да |  |
| `status` | `IssueStatus` | нет | default: OPEN |
| `priority` | `IssuePriority` | нет | default: MEDIUM |
| `orderIndex` | `Int` | нет | default: 0 |
| `aiEligible` | `Boolean` | нет | default: false |
| `aiExecutionStatus` | `AiExecutionStatus` | нет | default: NOT_STARTED |
| `aiAssigneeType` | `AiAssigneeType` | нет | default: HUMAN |
| `parentId` | `String` | да |  |
| `parent` | `Issue` | да |  |
| `children` | `Issue[]` | нет |  |
| `assigneeId` | `String` | да |  |
| `creatorId` | `String` | нет |  |
| `assignee` | `User` | да |  |
| `creator` | `User` | нет |  |
| `sprintId` | `String` | да |  |
| `sprint` | `Sprint` | да |  |
| `releaseId` | `String` | да |  |
| `release` | `Release` | да |  |
| `estimatedHours` | `Decimal` | да |  |
| `dueDate` | `DateTime` | да |  |
| `acceptanceCriteria` | `String` | да |  |
| `aiReasoning` | `String` | да |  |
| `createdAt` | `DateTime` | нет | default: now( |
| `updatedAt` | `DateTime` | нет |  |
| `workflowStatusId` | `String` | да |  |
| `issueTypeConfig` | `IssueTypeConfig` | да |  |
| `workflowStatus` | `WorkflowStatus` | да |  |
| `project` | `Project` | нет |  |
| `comments` | `Comment[]` | нет |  |
| `timeLogs` | `TimeLog[]` | нет |  |
| `aiSessions` | `AiSession[]` | нет |  |
| `sourceLinks` | `IssueLink[]` | нет |  |
| `targetLinks` | `IssueLink[]` | нет |  |
| `customFieldValues` | `IssueCustomFieldValue[]` | нет |  |
| `releaseItems` | `ReleaseItem[]` | нет |  |

### Sprint

| Поле | Тип | Nullable | Примечание |
|------|-----|----------|------------|
| `id` | `String` | нет | PK, default: uuid( |
| `projectId` | `String` | нет |  |
| `name` | `String` | нет |  |
| `goal` | `String` | да |  |
| `startDate` | `DateTime` | да |  |
| `endDate` | `DateTime` | да |  |
| `state` | `SprintState` | нет | default: PLANNED |
| `projectTeamId` | `String` | да |  |
| `businessTeamId` | `String` | да |  |
| `flowTeamId` | `String` | да |  |
| `releaseId` | `String` | да |  |
| `createdAt` | `DateTime` | нет | default: now( |
| `updatedAt` | `DateTime` | нет |  |
| `project` | `Project` | нет |  |
| `issues` | `Issue[]` | нет |  |
| `projectTeam` | `Team` | да |  |
| `businessTeam` | `Team` | да |  |
| `flowTeam` | `Team` | да |  |
| `release` | `Release` | да |  |

### ReleaseStatus

| Поле | Тип | Nullable | Примечание |
|------|-----|----------|------------|
| `id` | `String` | нет | PK, default: uuid( |
| `name` | `String` | нет | UNIQUE |
| `category` | `ReleaseStatusCategory` | нет |  |
| `color` | `String` | нет | default: "#888888" |
| `description` | `String` | да |  |
| `orderIndex` | `Int` | нет | default: 0 |
| `createdAt` | `DateTime` | нет | default: now( |
| `updatedAt` | `DateTime` | нет |  |
| `releases` | `Release[]` | нет |  |
| `workflowSteps` | `ReleaseWorkflowStep[]` | нет |  |
| `transitionsFrom` | `ReleaseWorkflowTransition[]` | нет |  |
| `transitionsTo` | `ReleaseWorkflowTransition[]` | нет |  |

### ReleaseWorkflow

| Поле | Тип | Nullable | Примечание |
|------|-----|----------|------------|
| `id` | `String` | нет | PK, default: uuid( |
| `name` | `String` | нет | UNIQUE |
| `description` | `String` | да |  |
| `releaseType` | `ReleaseType` | да |  |
| `isDefault` | `Boolean` | нет | default: false |
| `isActive` | `Boolean` | нет | default: true |
| `createdAt` | `DateTime` | нет | default: now( |
| `updatedAt` | `DateTime` | нет |  |
| `steps` | `ReleaseWorkflowStep[]` | нет |  |
| `transitions` | `ReleaseWorkflowTransition[]` | нет |  |
| `releases` | `Release[]` | нет |  |

### ReleaseWorkflowStep

| Поле | Тип | Nullable | Примечание |
|------|-----|----------|------------|
| `id` | `String` | нет | PK, default: uuid( |
| `workflowId` | `String` | нет |  |
| `statusId` | `String` | нет |  |
| `isInitial` | `Boolean` | нет | default: false |
| `orderIndex` | `Int` | нет | default: 0 |
| `workflow` | `ReleaseWorkflow` | нет |  |
| `status` | `ReleaseStatus` | нет |  |

### ReleaseWorkflowTransition

| Поле | Тип | Nullable | Примечание |
|------|-----|----------|------------|
| `id` | `String` | нет | PK, default: uuid( |
| `workflowId` | `String` | нет |  |
| `name` | `String` | нет |  |
| `fromStatusId` | `String` | нет |  |
| `toStatusId` | `String` | нет |  |
| `conditions` | `Json` | да |  |
| `isGlobal` | `Boolean` | нет | default: false |
| `workflow` | `ReleaseWorkflow` | нет |  |
| `fromStatus` | `ReleaseStatus` | нет |  |
| `toStatus` | `ReleaseStatus` | нет |  |

### ReleaseItem

| Поле | Тип | Nullable | Примечание |
|------|-----|----------|------------|
| `id` | `String` | нет | PK, default: uuid( |
| `releaseId` | `String` | нет |  |
| `issueId` | `String` | нет |  |
| `addedAt` | `DateTime` | нет | default: now( |
| `addedById` | `String` | нет |  |
| `release` | `Release` | нет |  |
| `issue` | `Issue` | нет |  |
| `addedBy` | `User` | нет |  |

### Release

| Поле | Тип | Nullable | Примечание |
|------|-----|----------|------------|
| `id` | `String` | нет | PK, default: uuid( |
| `type` | `ReleaseType` | нет | default: ATOMIC |
| `projectId` | `String` | да |  |
| `name` | `String` | нет |  |
| `description` | `String` | да |  |
| `level` | `ReleaseLevel` | нет | default: MINOR |
| `state` | `ReleaseState` | нет | default: DRAFT |
| `statusId` | `String` | да |  |
| `workflowId` | `String` | да |  |
| `releaseDate` | `DateTime` | да |  |
| `plannedDate` | `DateTime` | да |  |
| `createdById` | `String` | да |  |
| `createdAt` | `DateTime` | нет | default: now( |
| `updatedAt` | `DateTime` | нет |  |
| `project` | `Project` | да |  |
| `status` | `ReleaseStatus` | да |  |
| `workflow` | `ReleaseWorkflow` | да |  |
| `createdBy` | `User` | да |  |
| `items` | `ReleaseItem[]` | нет |  |
| `issues` | `Issue[]` | нет |  |
| `sprints` | `Sprint[]` | нет |  |

### Comment

| Поле | Тип | Nullable | Примечание |
|------|-----|----------|------------|
| `id` | `String` | нет | PK, default: uuid( |
| `issueId` | `String` | нет |  |
| `authorId` | `String` | нет |  |
| `body` | `String` | нет |  |
| `createdAt` | `DateTime` | нет | default: now( |
| `updatedAt` | `DateTime` | нет |  |
| `issue` | `Issue` | нет |  |
| `author` | `User` | нет |  |

### TimeLog

| Поле | Тип | Nullable | Примечание |
|------|-----|----------|------------|
| `id` | `String` | нет | PK, default: uuid( |
| `issueId` | `String` | нет |  |
| `userId` | `String` | да |  |
| `hours` | `Decimal` | нет |  |
| `note` | `String` | да |  |
| `startedAt` | `DateTime` | да |  |
| `stoppedAt` | `DateTime` | да |  |
| `logDate` | `DateTime` | нет | default: now( |
| `createdAt` | `DateTime` | нет | default: now( |
| `source` | `TimeSource` | нет | default: HUMAN |
| `agentSessionId` | `String` | да |  |
| `agentSession` | `AiSession` | да |  |
| `costMoney` | `Decimal` | да |  |
| `issue` | `Issue` | нет |  |
| `user` | `User` | да |  |

### AiSession

| Поле | Тип | Nullable | Примечание |
|------|-----|----------|------------|
| `id` | `String` | нет | PK, default: uuid( |
| `issueId` | `String` | да |  |
| `userId` | `String` | да |  |
| `model` | `String` | нет |  |
| `provider` | `String` | нет |  |
| `startedAt` | `DateTime` | нет |  |
| `finishedAt` | `DateTime` | нет |  |
| `tokensInput` | `Int` | нет |  |
| `tokensOutput` | `Int` | нет |  |
| `costMoney` | `Decimal` | нет |  |
| `notes` | `String` | да |  |
| `createdAt` | `DateTime` | нет | default: now( |
| `issue` | `Issue` | да |  |
| `user` | `User` | да |  |
| `logs` | `TimeLog[]` | нет |  |

### AuditLog

| Поле | Тип | Nullable | Примечание |
|------|-----|----------|------------|
| `id` | `String` | нет | PK, default: uuid( |
| `action` | `String` | нет |  |
| `entityType` | `String` | нет |  |
| `entityId` | `String` | нет |  |
| `userId` | `String` | да |  |
| `details` | `Json` | да |  |
| `ipAddress` | `String` | да |  |
| `userAgent` | `String` | да |  |
| `createdAt` | `DateTime` | нет | default: now( |
| `user` | `User` | да |  |

### IssueLinkType

| Поле | Тип | Nullable | Примечание |
|------|-----|----------|------------|
| `id` | `String` | нет | PK, default: uuid( |
| `name` | `String` | нет | UNIQUE |
| `outboundName` | `String` | нет |  |
| `inboundName` | `String` | нет |  |
| `isActive` | `Boolean` | нет | default: true |
| `isSystem` | `Boolean` | нет | default: false |
| `createdAt` | `DateTime` | нет | default: now( |
| `updatedAt` | `DateTime` | нет |  |
| `links` | `IssueLink[]` | нет |  |

### IssueLink

| Поле | Тип | Nullable | Примечание |
|------|-----|----------|------------|
| `id` | `String` | нет | PK, default: uuid( |
| `sourceIssueId` | `String` | нет |  |
| `targetIssueId` | `String` | нет |  |
| `linkTypeId` | `String` | нет |  |
| `createdById` | `String` | нет |  |
| `createdAt` | `DateTime` | нет | default: now( |
| `sourceIssue` | `Issue` | нет |  |
| `targetIssue` | `Issue` | нет |  |
| `linkType` | `IssueLinkType` | нет |  |
| `createdBy` | `User` | нет |  |

### CustomField

| Поле | Тип | Nullable | Примечание |
|------|-----|----------|------------|
| `id` | `String` | нет | PK, default: uuid( |
| `name` | `String` | нет |  |
| `description` | `String` | да |  |
| `fieldType` | `CustomFieldType` | нет |  |
| `options` | `Json` | да |  |
| `isSystem` | `Boolean` | нет | default: false |
| `isEnabled` | `Boolean` | нет | default: true |
| `orderIndex` | `Int` | нет | default: 0 |
| `createdAt` | `DateTime` | нет | default: now( |
| `updatedAt` | `DateTime` | нет |  |
| `schemaItems` | `FieldSchemaItem[]` | нет |  |
| `values` | `IssueCustomFieldValue[]` | нет |  |
| `transitionScreenItems` | `TransitionScreenItem[]` | нет |  |

### IssueCustomFieldValue

| Поле | Тип | Nullable | Примечание |
|------|-----|----------|------------|
| `id` | `String` | нет | PK, default: uuid( |
| `issueId` | `String` | нет |  |
| `customFieldId` | `String` | нет |  |
| `value` | `Json` | нет |  |
| `updatedAt` | `DateTime` | нет |  |
| `updatedById` | `String` | нет |  |
| `issue` | `Issue` | нет |  |
| `customField` | `CustomField` | нет |  |
| `updatedBy` | `User` | нет |  |

### FieldSchema

| Поле | Тип | Nullable | Примечание |
|------|-----|----------|------------|
| `id` | `String` | нет | PK, default: uuid( |
| `name` | `String` | нет |  |
| `description` | `String` | да |  |
| `status` | `FieldSchemaStatus` | нет | default: DRAFT |
| `isDefault` | `Boolean` | нет | default: false |
| `copiedFromId` | `String` | да |  |
| `createdAt` | `DateTime` | нет | default: now( |
| `updatedAt` | `DateTime` | нет |  |
| `items` | `FieldSchemaItem[]` | нет |  |
| `bindings` | `FieldSchemaBinding[]` | нет |  |
| `copiedFrom` | `FieldSchema` | да |  |
| `copies` | `FieldSchema[]` | нет |  |

### FieldSchemaItem

| Поле | Тип | Nullable | Примечание |
|------|-----|----------|------------|
| `id` | `String` | нет | PK, default: uuid( |
| `schemaId` | `String` | нет |  |
| `customFieldId` | `String` | нет |  |
| `orderIndex` | `Int` | нет | default: 0 |
| `isRequired` | `Boolean` | нет | default: false |
| `showOnKanban` | `Boolean` | нет | default: false |
| `schema` | `FieldSchema` | нет |  |
| `customField` | `CustomField` | нет |  |

### FieldSchemaBinding

| Поле | Тип | Nullable | Примечание |
|------|-----|----------|------------|
| `id` | `String` | нет | PK, default: uuid( |
| `schemaId` | `String` | нет |  |
| `scopeType` | `FieldScopeType` | нет |  |
| `projectId` | `String` | да |  |
| `issueTypeConfigId` | `String` | да |  |
| `createdAt` | `DateTime` | нет | default: now( |
| `schema` | `FieldSchema` | нет |  |
| `project` | `Project` | да |  |
| `issueTypeConfig` | `IssueTypeConfig` | да |  |

### SystemSetting

| Поле | Тип | Nullable | Примечание |
|------|-----|----------|------------|
| `key` | `String` | нет | PK |
| `value` | `String` | нет |  |
| `updatedAt` | `DateTime` | нет |  |

### Team

| Поле | Тип | Nullable | Примечание |
|------|-----|----------|------------|
| `id` | `String` | нет | PK, default: uuid( |
| `name` | `String` | нет |  |
| `description` | `String` | да |  |
| `createdAt` | `DateTime` | нет | default: now( |
| `updatedAt` | `DateTime` | нет |  |
| `members` | `TeamMember[]` | нет |  |
| `projectSprints` | `Sprint[]` | нет |  |
| `businessSprints` | `Sprint[]` | нет |  |
| `flowSprints` | `Sprint[]` | нет |  |

### TeamMember

| Поле | Тип | Nullable | Примечание |
|------|-----|----------|------------|
| `id` | `String` | нет | PK, default: uuid( |
| `teamId` | `String` | нет |  |
| `userId` | `String` | нет |  |
| `role` | `String` | да |  |
| `createdAt` | `DateTime` | нет | default: now( |
| `team` | `Team` | нет |  |
| `user` | `User` | нет |  |

### WorkflowStatus

| Поле | Тип | Nullable | Примечание |
|------|-----|----------|------------|
| `id` | `String` | нет | PK, default: uuid( |
| `name` | `String` | нет |  |
| `description` | `String` | да |  |
| `category` | `StatusCategory` | нет |  |
| `color` | `String` | нет | default: "#9E9E9E" |
| `iconName` | `String` | да |  |
| `isSystem` | `Boolean` | нет | default: false |
| `systemKey` | `String` | да | UNIQUE |
| `createdAt` | `DateTime` | нет | default: now( |
| `updatedAt` | `DateTime` | нет |  |
| `transitionsFrom` | `WorkflowTransition[]` | нет |  |
| `transitionsTo` | `WorkflowTransition[]` | нет |  |
| `workflowSteps` | `WorkflowStep[]` | нет |  |
| `issues` | `Issue[]` | нет |  |

### Workflow

| Поле | Тип | Nullable | Примечание |
|------|-----|----------|------------|
| `id` | `String` | нет | PK, default: uuid( |
| `name` | `String` | нет |  |
| `description` | `String` | да |  |
| `isDefault` | `Boolean` | нет | default: false |
| `isSystem` | `Boolean` | нет | default: false |
| `createdAt` | `DateTime` | нет | default: now( |
| `updatedAt` | `DateTime` | нет |  |
| `steps` | `WorkflowStep[]` | нет |  |
| `transitions` | `WorkflowTransition[]` | нет |  |
| `schemeItems` | `WorkflowSchemeItem[]` | нет |  |

### WorkflowStep

| Поле | Тип | Nullable | Примечание |
|------|-----|----------|------------|
| `id` | `String` | нет | PK, default: uuid( |
| `workflowId` | `String` | нет |  |
| `statusId` | `String` | нет |  |
| `isInitial` | `Boolean` | нет | default: false |
| `orderIndex` | `Int` | нет | default: 0 |
| `workflow` | `Workflow` | нет |  |
| `status` | `WorkflowStatus` | нет |  |

### WorkflowTransition

| Поле | Тип | Nullable | Примечание |
|------|-----|----------|------------|
| `id` | `String` | нет | PK, default: uuid( |
| `workflowId` | `String` | нет |  |
| `name` | `String` | нет |  |
| `fromStatusId` | `String` | да |  |
| `toStatusId` | `String` | нет |  |
| `isGlobal` | `Boolean` | нет | default: false |
| `orderIndex` | `Int` | нет | default: 0 |
| `conditions` | `Json` | да |  |
| `validators` | `Json` | да |  |
| `postFunctions` | `Json` | да |  |
| `screenId` | `String` | да |  |
| `createdAt` | `DateTime` | нет | default: now( |
| `updatedAt` | `DateTime` | нет |  |
| `workflow` | `Workflow` | нет |  |
| `fromStatus` | `WorkflowStatus` | да |  |
| `toStatus` | `WorkflowStatus` | нет |  |
| `screen` | `TransitionScreen` | да |  |

### TransitionScreen

| Поле | Тип | Nullable | Примечание |
|------|-----|----------|------------|
| `id` | `String` | нет | PK, default: uuid( |
| `name` | `String` | нет |  |
| `description` | `String` | да |  |
| `createdAt` | `DateTime` | нет | default: now( |
| `updatedAt` | `DateTime` | нет |  |
| `transitions` | `WorkflowTransition[]` | нет |  |
| `items` | `TransitionScreenItem[]` | нет |  |

### TransitionScreenItem

| Поле | Тип | Nullable | Примечание |
|------|-----|----------|------------|
| `id` | `String` | нет | PK, default: uuid( |
| `screenId` | `String` | нет |  |
| `customFieldId` | `String` | да |  |
| `systemFieldKey` | `String` | да |  |
| `isRequired` | `Boolean` | нет | default: false |
| `orderIndex` | `Int` | нет | default: 0 |
| `screen` | `TransitionScreen` | нет |  |
| `customField` | `CustomField` | да |  |

### WorkflowScheme

| Поле | Тип | Nullable | Примечание |
|------|-----|----------|------------|
| `id` | `String` | нет | PK, default: uuid( |
| `name` | `String` | нет |  |
| `description` | `String` | да |  |
| `isDefault` | `Boolean` | нет | default: false |
| `createdAt` | `DateTime` | нет | default: now( |
| `updatedAt` | `DateTime` | нет |  |
| `items` | `WorkflowSchemeItem[]` | нет |  |
| `projects` | `WorkflowSchemeProject[]` | нет |  |

### WorkflowSchemeItem

| Поле | Тип | Nullable | Примечание |
|------|-----|----------|------------|
| `id` | `String` | нет | PK, default: uuid( |
| `schemeId` | `String` | нет |  |
| `workflowId` | `String` | нет |  |
| `issueTypeConfigId` | `String` | да |  |
| `scheme` | `WorkflowScheme` | нет |  |
| `workflow` | `Workflow` | нет |  |
| `issueTypeConfig` | `IssueTypeConfig` | да |  |

### WorkflowSchemeProject

| Поле | Тип | Nullable | Примечание |
|------|-----|----------|------------|
| `id` | `String` | нет | PK, default: uuid( |
| `schemeId` | `String` | нет |  |
| `projectId` | `String` | нет | UNIQUE |
| `createdAt` | `DateTime` | нет | default: now( |
| `scheme` | `WorkflowScheme` | нет |  |
| `project` | `Project` | нет |  |

### ProjectRoleScheme

| Поле | Тип | Nullable | Примечание |
|------|-----|----------|------------|
| `id` | `String` | нет | PK, default: uuid( |
| `name` | `String` | нет |  |
| `description` | `String` | да |  |
| `isDefault` | `Boolean` | нет | default: false |
| `createdAt` | `DateTime` | нет | default: now( |
| `updatedAt` | `DateTime` | нет |  |
| `roles` | `ProjectRoleDefinition[]` | нет |  |
| `projects` | `ProjectRoleSchemeProject[]` | нет |  |

### ProjectRoleDefinition

| Поле | Тип | Nullable | Примечание |
|------|-----|----------|------------|
| `id` | `String` | нет | PK, default: uuid( |
| `schemeId` | `String` | нет |  |
| `name` | `String` | нет |  |
| `key` | `String` | нет |  |
| `description` | `String` | да |  |
| `color` | `String` | да |  |
| `isSystem` | `Boolean` | нет | default: false |
| `createdAt` | `DateTime` | нет | default: now( |
| `updatedAt` | `DateTime` | нет |  |
| `scheme` | `ProjectRoleScheme` | нет |  |
| `permissions` | `ProjectRolePermission[]` | нет |  |
| `userProjectRoles` | `UserProjectRole[]` | нет |  |
| `projectGroupRoles` | `ProjectGroupRole[]` | нет |  |

### ProjectRolePermission

| Поле | Тип | Nullable | Примечание |
|------|-----|----------|------------|
| `id` | `String` | нет | PK, default: uuid( |
| `roleId` | `String` | нет |  |
| `permission` | `ProjectPermission` | нет |  |
| `granted` | `Boolean` | нет | default: false |
| `role` | `ProjectRoleDefinition` | нет |  |

### ProjectRoleSchemeProject

| Поле | Тип | Nullable | Примечание |
|------|-----|----------|------------|
| `id` | `String` | нет | PK, default: uuid( |
| `schemeId` | `String` | нет |  |
| `projectId` | `String` | нет | UNIQUE |
| `createdAt` | `DateTime` | нет | default: now( |
| `scheme` | `ProjectRoleScheme` | нет |  |
| `project` | `Project` | нет |  |

### UserGroup

| Поле | Тип | Nullable | Примечание |
|------|-----|----------|------------|
| `id` | `String` | нет | PK, default: uuid( |

### UserGroupMember

| Поле | Тип | Nullable | Примечание |
|------|-----|----------|------------|
| `groupId` | `String` | нет |  |
| `userId` | `String` | нет |  |
| `addedAt` | `DateTime` | нет | default: now( |
| `addedById` | `String` | да |  |
| `group` | `UserGroup` | нет |  |
| `user` | `User` | нет |  |
| `addedBy` | `User` | да |  |

### ProjectGroupRole

| Поле | Тип | Nullable | Примечание |
|------|-----|----------|------------|
| `id` | `String` | нет | PK, default: uuid( |
| `groupId` | `String` | нет |  |
| `projectId` | `String` | нет |  |
| `roleId` | `String` | нет |  |
| `schemeId` | `String` | нет |  |
| `createdAt` | `DateTime` | нет | default: now( |
| `group` | `UserGroup` | нет |  |
| `project` | `Project` | нет |  |
| `roleDefinition` | `ProjectRoleDefinition` | нет |  |

## Перечисления (18)

### SystemRoleType

- `SUPER_ADMIN`
- `ADMIN`
- `RELEASE_MANAGER`
- `USER`
- `AUDITOR`

### ProjectRole

- `ADMIN`
- `MANAGER`
- `USER`
- `VIEWER`

### RoleAssignmentSource

- `DIRECT`
- `GROUP`

### IssueStatus

- `OPEN`
- `IN_PROGRESS`
- `REVIEW`
- `DONE`
- `CANCELLED`

### IssuePriority

- `CRITICAL`
- `HIGH`
- `MEDIUM`
- `LOW`

### AiExecutionStatus

- `NOT_STARTED`
- `IN_PROGRESS`
- `DONE`
- `FAILED`

### AiAssigneeType

- `HUMAN`
- `AGENT`
- `MIXED`

### SprintState

- `PLANNED`
- `ACTIVE`
- `CLOSED`

### ReleaseType

- `ATOMIC       // атомарный — одна система/проект`
- `INTEGRATION  // интеграционный — кросс-проектный`

### ReleaseLevel

- `MINOR   // мелкие улучшения, баг-фиксы`
- `MAJOR   // новые фичи`

### ReleaseState

- `DRAFT    // сбор задач`
- `READY    // готов к выпуску`
- `RELEASED // выпущен`

### ReleaseStatusCategory

- `PLANNING      // сбор, планирование`
- `IN_PROGRESS   // в работе (сборка, тестирование, стабилизация)`
- `DONE          // выпущен, закрыт`
- `CANCELLED     // отменён`

### TimeSource

- `HUMAN`
- `AGENT`

### CustomFieldType

- `TEXT`
- `TEXTAREA`
- `NUMBER`
- `DECIMAL`
- `DATE`
- `DATETIME`
- `URL`
- `CHECKBOX`
- `SELECT`
- `MULTI_SELECT`
- `USER`
- `LABEL`
- `REFERENCE`

### FieldSchemaStatus

- `DRAFT`
- `ACTIVE`

### FieldScopeType

- `GLOBAL`
- `PROJECT`
- `ISSUE_TYPE`
- `PROJECT_ISSUE_TYPE`

### StatusCategory

- `TODO`
- `IN_PROGRESS`
- `DONE`

### ProjectPermission

- `ISSUES_VIEW`
- `ISSUES_CREATE`
- `ISSUES_EDIT`
- `ISSUES_DELETE`
- `ISSUES_ASSIGN`
- `ISSUES_CHANGE_STATUS`
- `ISSUES_CHANGE_TYPE`
- `SPRINTS_VIEW`
- `SPRINTS_CREATE            // TTSEC-2`
- `SPRINTS_EDIT              // TTSEC-2`
- `SPRINTS_DELETE            // TTSEC-2`
- `SPRINTS_MANAGE            // deprecated: Postgres не поддерживает DROP VALUE, скрыто из UI-матрицы`
- `RELEASES_VIEW`
- `RELEASES_CREATE           // TTSEC-2`
- `RELEASES_EDIT             // TTSEC-2`
- `RELEASES_DELETE           // TTSEC-2`
- `RELEASES_MANAGE           // deprecated`
- `MEMBERS_VIEW`
- `MEMBERS_MANAGE`
- `TIME_LOGS_VIEW`
- `TIME_LOGS_CREATE`
- `TIME_LOGS_DELETE_OTHERS   // TTSEC-2: модерация чужих time logs`
- `TIME_LOGS_MANAGE`
- `COMMENTS_VIEW`
- `COMMENTS_CREATE`
- `COMMENTS_DELETE_OTHERS    // TTSEC-2: модерация чужих комментариев`
- `COMMENTS_MANAGE`
- `PROJECT_SETTINGS_VIEW`
- `PROJECT_SETTINGS_EDIT`
- `BOARDS_VIEW`
- `BOARDS_MANAGE`
- `USER_GROUP_VIEW           // TTSEC-2: system-level`
- `USER_GROUP_MANAGE         // TTSEC-2: system-level`
<!-- AUTO-GENERATED:END -->
