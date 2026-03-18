# Flow Universe — Current Database / Domain Model Analysis

**Purpose:** Extract and analyze the existing schema for migration and MVP domain design.  
**Date:** March 2025

---

## 1. Entity Diagram (Current Schema)

```mermaid
erDiagram
  users ||--o{ tasks : "assignee"
  users ||--o{ tasks : "creator"
  users ||--o{ time_logs : "logs"
  users ||--o{ audit_log : "actor"
  users ||--o{ projects : "owner"
  users ||--o{ product_teams : "lead"
  users ||--o{ product_team_members : "member"
  users ||--o{ task_items : "assignee"
  users ||--o{ task_items : "creator"
  users ||--o{ task_items : "reviewer"

  projects ||--o{ tasks : "project_id"
  projects }o--o{ task_items : "context project"

  product_teams ||--o{ product_team_members : "members"
  product_teams }o--o{ task_items : "context product_team"

  business_functions }o--o{ task_items : "context quick"

  tasks ||--o{ time_logs : "task"
  tasks ||--o{ task_item_links : "task"
  task_items ||--o{ task_item_links : "item"
  task_items ||--o{ task_items : "parent"
  task_items ||--o{ time_logs : "task_item"

  users {
    int id PK
    string email UK
    string password_hash
    string name
    string role
    bool is_blocked
    timestamptz created_at
    timestamptz updated_at
  }

  tasks {
    int id PK
    string title
    text description
    string type
    string priority
    string status
    int assignee_id FK
    int creator_id FK
    decimal estimated_hours
    int project_id FK
    timestamptz created_at
    timestamptz updated_at
  }

  time_logs {
    int id PK
    int task_id FK
    int task_item_id FK
    int user_id FK
    timestamptz started_at
    timestamptz ended_at
    int duration_minutes
  }

  audit_log {
    bigint id PK
    int user_id FK
    string action
    string entity_type
    string entity_id
    string level
    jsonb details
    string ip
    text user_agent
    timestamptz created_at
  }

  projects {
    int id PK
    string name
    text description
    string project_type
    text business_goal
    numeric budget
    numeric planned_revenue
    int owner_id FK
    string status
    timestamptz created_at
    timestamptz updated_at
  }

  product_teams {
    int id PK
    string name
    text description
    int lead_id FK
    string status
    timestamptz created_at
  }

  product_team_members {
    int team_id PK,FK
    int user_id PK,FK
    string role
  }

  business_functions {
    int id PK
    string name
    text description
    timestamptz created_at
  }

  task_items {
    int id PK
    int parent_id FK
    string level
    int order_index
    string title
    text description
    text acceptance_criteria
    string context_type
    int context_id
    string type
    string priority
    string status
    int story_points
    decimal estimated_hours
    int assignee_id FK
    int creator_id FK
    int reviewer_id FK
    timestamptz created_at
    timestamptz updated_at
  }

  task_item_links {
    int task_id PK,FK
    int task_item_id PK,FK
    string link_type PK
    timestamptz created_at
  }
```

---

## 2. Entity Summary

| Entity | Purpose | Key relationships |
|--------|---------|-------------------|
| **users** | Accounts, roles, blocking | Referenced by tasks, task_items, projects, teams, time_logs, audit_log |
| **tasks** | Flat “legacy” tasks | project_id, assignee_id, creator_id; linked to task_items via task_item_links |
| **time_logs** | Time tracking | task_id (required), task_item_id (optional), user_id |
| **audit_log** | Audit trail / SIEM | user_id, entity_type, entity_id, details (JSONB) |
| **projects** | Project container | owner_id; task_items use context_type='project', context_id=projects.id |
| **product_teams** | Team container | lead_id; members in product_team_members; task_items context_type='product_team' |
| **product_team_members** | Team membership | team_id, user_id, role |
| **business_functions** | “Quick” context label | task_items context_type='quick', context_id=business_functions.id (polymorphic) |
| **task_items** | Hierarchical work (epic/story/subtask) | parent_id (self), context_type/context_id (project/quick/product_team) |
| **task_item_links** | Link flat task ↔ hierarchical item | task_id, task_item_id, link_type |

---

## 3. Missing Entities (for Jira-like MVP)

| Missing | Impact |
|---------|--------|
| **organizations** | No multi-tenancy; all data is global. Hard to add org-level settings, billing, or isolation later. |
| **comments** | No discussion thread on tasks/issues. Required for collaboration. |
| **sprints** | No sprint entity; cannot assign issues to a time-boxed sprint or show sprint backlog. |
| **boards** | No board entity; “board” is implicit (e.g. project view by status). Cannot have multiple boards per project. |
| **board_columns** | Status is freeform/enum in code; no first-class column definition, order, or WIP limits. |
| **labels** | No labels table; cannot tag issues with multiple labels. |
| **statuses** | Status is string/CHECK in columns; not a shared entity. Different workflows per project/board require new schema. |
| **issue_history** | No change history for issue fields (who changed status when, etc.); only audit_log for high-level actions. |

---

## 4. Risky Schema Decisions

- **Dual task model (tasks + task_items):** Two ways to represent work (flat `tasks` and hierarchical `task_items`) with an optional link. Logic is split (e.g. “create story from task”), and RBAC/APIs must handle both. Unifying into a single “Issue” model would simplify the domain and AI usage.
- **Polymorphic context (task_items):** `context_type` + `context_id` point to project, product_team, or business_functions. No FK to a single table; harder to enforce referential integrity and to query “all items in project” with one join. A single `project_id` (nullable) plus optional `team_id` would be clearer for MVP.
- **tasks.project_id added after projects:** Schema order: tasks created first, then projects, then ALTER tasks ADD project_id. Circular reference risk is avoided by creation order, but migration and init order are fragile.
- **time_logs dual reference:** Can attach to `task_id` and/or `task_item_id`. Ambiguity: which one is “canonical” for a given log? Unifying to one issue entity would remove this.
- **Role in users:** Role is a single string (admin, manager, user, cio, viewer, super-admin). No per-project/per-team roles; scaling to project-level permissions would require a new table (e.g. project_members with role).
- **No soft delete:** DELETE is hard delete. Restore or “archived” state would need new columns or tables.

---

## 5. Normalization Issues

- **Denormalized names in responses:** API often returns `assignee_name`, `creator_name`, `project_name`, `lead_name` via JOINs. Not stored redundantly; acceptable for read path. No materialized aggregates for counts (e.g. “stories per project” are computed on the fly).
- **task_items:** Well normalized; context_type/context_id are polymorphic but not redundant. Order within context is `order_index` on the same table.
- **audit_log.details JSONB:** Flexible but untyped; no schema enforcement. Good for extensibility; bad for strict querying/analytics without conventions.
- **product_team_members.role:** Freeform string (e.g. lead, member). Not normalized to a roles table; acceptable for MVP.

---

## 6. Index Usage (Current)

- **tasks:** assignee_id, creator_id, status, project_id — suitable for list/filter.
- **time_logs:** task_id, user_id — suitable for “logs for task” and “my logs.”
- **audit_log:** created_at, user_id, (entity_type, entity_id), level — suitable for activity and admin views.
- **task_items:** parent_id, (context_type, context_id), assignee_id, status — suitable for tree and context lists.
- **task_item_links:** task_id, task_item_id — suitable for resolving links.

Missing for future scale: composite indexes for “open issues in project by order_index,” “issues in sprint by column,” etc., once sprints/boards exist.

---

## 7. Conclusion

The current schema supports projects, product teams, flat tasks, hierarchical task_items, time logging, and audit. For a Jira-like MVP, the main gaps are: **organizations**, **comments**, **sprints**, **boards/columns**, **labels**, and **issue history**. The **dual task model** and **polymorphic context** are the main architectural risks to address in the MVP domain model and migration (see MVP_DOMAIN_MODEL.md and MIGRATION_PLAN.md).
