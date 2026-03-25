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
