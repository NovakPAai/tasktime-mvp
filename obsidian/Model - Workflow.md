---
tags: [model, prisma, workflow]
---

# Model — Workflow

```prisma
model WorkflowStatus {
  id        String           @id
  name      String
  category  StatusCategory   // TODO | IN_PROGRESS | DONE
  color     String
  iconName  String?
  isSystem  Boolean
  systemKey String?
}

model Workflow {
  id          String @id
  name        String
  isDefault   Boolean
  isSystem    Boolean
  steps       WorkflowStep[]
  transitions WorkflowTransition[]
}

model WorkflowStep {
  workflowId  String
  statusId    String
  isInitial   Boolean
  orderIndex  Int
  status      WorkflowStatus
}

model WorkflowTransition {
  id             String  @id
  workflowId     String
  name           String
  fromStatusId   String?  // null = global (из любого)
  toStatusId     String
  isGlobal       Boolean
  orderIndex     Int
  conditions     Json?
  validators     Json?
  postFunctions  Json?
  screenId       String?
  screen         TransitionScreen?
}

model WorkflowScheme {
  id        String @id
  name      String
  isDefault Boolean
  items     WorkflowSchemeItem[]
  projects  WorkflowSchemeProject[]
}

model WorkflowSchemeItem {
  schemeId          String
  workflowId        String
  issueTypeConfigId String?  // null = default для всех типов
}
```

## Связанные модули

- [[Module - Workflows]] — CRUD воркфлоу и статусов
- [[Module - Workflow Engine]] — резолвинг и исполнение
- [[Module - Issues]] — переходы статусов
