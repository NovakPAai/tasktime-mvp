---
tags: [model, prisma, sprint]
---

# Model — Sprint

```prisma
model Sprint {
  id              String       @id
  projectId       String
  name            String
  goal            String?
  startDate       DateTime?
  endDate         DateTime?
  state           SprintState  // PLANNED | ACTIVE | CLOSED

  projectTeamId   String?
  businessTeamId  String?
  flowTeamId      String?
  releaseId       String?

  project         Project
  issues          Issue[]
  release         Release?
}
```

## Связанные модули

- [[Module - Sprints]] — state machine, CRUD
- [[Module - Issues]] — задачи спринта
- [[Module - Teams]] — команды
- [[Module - Releases]] — привязка к релизу
- [[Model - Project]] — контекст
