---
tags: [model, prisma, release]
---

# Model — Release

```prisma
model Release {
  id           String        @id
  type         ReleaseType   // ATOMIC | INTEGRATION
  level        ReleaseLevel  // MINOR | MAJOR
  name         String
  projectId    String
  statusId     String
  workflowId   String
  releaseDate  DateTime?
  plannedDate  DateTime?
  createdById  String

  project      Project
  status       ReleaseStatus
  workflow     ReleaseWorkflow
  items        ReleaseItem[]
  sprints      Sprint[]
}

model ReleaseItem {
  releaseId  String
  issueId    String
  addedById  String
  issue      Issue
}

model ReleaseStatus {
  id       String          @id
  name     String
  category ReleaseCategory // PLANNING | IN_PROGRESS | DONE | CANCELLED
}

model ReleaseWorkflow {
  id          String
  name        String
  releaseType ReleaseType
  isDefault   Boolean
  isActive    Boolean
  steps       ReleaseWorkflowStep[]
  transitions ReleaseWorkflowTransition[]
}
```

## Связанные модули

- [[Module - Releases]] — CRUD, переходы статусов
- [[Module - Issues]] — задачи в релизе (ReleaseItem)
- [[Module - Sprints]] — спринты привязаны к релизу
- [[Model - Project]] — релиз принадлежит проекту
