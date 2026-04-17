---
tags: [database, prisma, schema]
---

# Database Schema

28 Prisma-моделей. Файл: `backend/src/prisma/schema.prisma`

## Users & Auth

```
User ──── UserSystemRole   (SUPER_ADMIN | ADMIN | RELEASE_MANAGER | USER | AUDITOR)
     ──── UserProjectRole  (ADMIN | MANAGER | USER | VIEWER)
     ──── RefreshToken
```

→ [[Model - User]] · [[Module - Auth]] · [[RBAC & Permissions]]

## Projects

```
Project ──── ProjectCategory
        ──── UserProjectRole
        ──── Sprint
        ──── Issue
        ──── Release
```

→ [[Model - Project]] · [[Module - Projects]]

## Issues & Hierarchy

```
Issue ──── parentId → Issue   (self-referential: EPIC → STORY → TASK → SUBTASK)
      ──── sprintId → Sprint
      ──── releaseId → Release
      ──── assigneeId → User
      ──── IssueLink (blocks | depends-on | relates-to)
      ──── IssueCustomFieldValue
      ──── Comment
      ──── TimeLog
      ──── AuditLog
```

Enums:
- `IssueStatus`: OPEN | IN_PROGRESS | REVIEW | DONE | CANCELLED
- `IssuePriority`: CRITICAL | HIGH | MEDIUM | LOW
- `AiExecutionStatus`: NOT_STARTED | IN_PROGRESS | DONE | FAILED
- `AiAssigneeType`: HUMAN | AGENT | MIXED

→ [[Model - Issue]] · [[Module - Issues]]

## Sprints

```
Sprint ──── projectId → Project
       ──── Issue[]
       ──── Team refs (projectTeamId, businessTeamId, flowTeamId)
       ──── releaseId → Release
```

States: PLANNED → ACTIVE → CLOSED

→ [[Model - Sprint]] · [[Module - Sprints]]

## Releases

```
Release ──── ReleaseStatus
        ──── ReleaseWorkflow
        ──── ReleaseWorkflowStep
        ──── ReleaseWorkflowTransition
        ──── ReleaseItem → Issue[]
```

Types: ATOMIC | INTEGRATION
Levels: MINOR | MAJOR

→ [[Model - Release]] · [[Module - Releases]]

## Workflow Engine

```
Workflow ──── WorkflowStep → WorkflowStatus
         ──── WorkflowTransition (from → to, conditions, validators, postFunctions, screenId)

WorkflowScheme ──── WorkflowSchemeItem (workflow + issueType)
               ──── WorkflowSchemeProject → Project

WorkflowStatus (name, category: TODO|IN_PROGRESS|DONE, color)
TransitionScreen ──── TransitionScreenItem (fields + systemFields)
```

→ [[Model - Workflow]] · [[Module - Workflows]] · [[Module - Workflow Engine]]

## Teams

```
Team ──── TeamMember → User
```

→ [[Model - Team]] · [[Module - Teams]]

## Time Tracking

```
TimeLog (issueId, userId, hours, note, startedAt, source: HUMAN|AGENT, costMoney)
AiSession (issueId, userId, model, tokensInput, tokensOutput, costMoney)
```

→ [[Model - TimeLog]] · [[Module - Time Tracking]] · [[Module - AI]]

## Custom Fields & Schemas

```
CustomField (name, fieldType: TEXT|SELECT|MULTI_SELECT|NUMBER|DATE|URL|CHECKBOX|USER|LABEL|REFERENCE)
FieldSchema ──── FieldSchemaItem → CustomField
            ──── FieldSchemaBinding (scopeType: GLOBAL|PROJECT|ISSUE_TYPE|PROJECT_ISSUE_TYPE)

IssueCustomFieldValue (issueId, customFieldId, value)
```

→ [[Module - Custom Fields]] · [[Module - Field Schemas]]

## Issue Links

```
IssueLinkType (name, outboundName, inboundName)
IssueLink (sourceIssueId, targetIssueId, linkTypeId)
```

→ [[Module - Issue Links]]

## System

```
SystemSetting (key, value)
AuditLog (action, entityType, entityId, userId, details, ipAddress)
```
