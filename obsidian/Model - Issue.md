---
tags: [model, prisma, issue, core]
---

# Model — Issue

```prisma
model Issue {
  id                 String              @id
  projectId          String
  number             Int                 // авто-инкремент в рамках проекта
  title              String
  description        String?
  status             String              // ссылка на WorkflowStatus
  priority           IssuePriority       // CRITICAL | HIGH | MEDIUM | LOW
  orderIndex         Int                 // порядок в Kanban-колонке
  estimatedHours     Float?
  dueDate            DateTime?
  acceptanceCriteria String?

  parentId           String?             // EPIC → STORY → TASK → SUBTASK
  sprintId           String?
  releaseId          String?
  assigneeId         String?
  creatorId          String

  // AI поля
  aiEligible         Boolean             @default(false)
  aiAssigneeType     AiAssigneeType      // HUMAN | AGENT | MIXED
  aiExecutionStatus  AiExecutionStatus   // NOT_STARTED | IN_PROGRESS | DONE | FAILED
  aiReasoning        String?

  // Тип задачи
  issueTypeConfigId  String?

  project            Project
  parent             Issue?
  children           Issue[]
  sprint             Sprint?
  release            Release?
  assignee           User?
  creator            User

  comments           Comment[]
  timeLogs           TimeLog[]
  auditLogs          AuditLog[]
  customFields       IssueCustomFieldValue[]
  links              IssueLink[]
  releaseItems       ReleaseItem[]
}
```

## Ключ задачи

`{project.key}-{issue.number}` — например `DEMO-42`

## Иерархия

```
EPIC (parentId = null)
  └── STORY
        └── TASK
              └── SUBTASK (isSubtask = true)
```

## Связанные модули

- [[Module - Issues]] — CRUD, статусы, AI флаги
- [[Module - Workflow Engine]] — переходы статусов
- [[Module - Boards]] — Kanban (orderIndex)
- [[Module - Sprints]] — принадлежность спринту
- [[Module - Releases]] — принадлежность релизу
- [[Module - Comments]] — комментарии
- [[Module - Time Tracking]] — тайм-логи
- [[Module - Custom Fields]] — кастомные поля
- [[Module - Issue Links]] — связи с другими задачами
- [[Module - AI]] — оценка, декомпозиция
