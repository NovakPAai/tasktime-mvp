---
tags: [model, prisma, project]
---

# Model — Project

```prisma
model Project {
  id          String   @id
  name        String
  key         String   @unique  // DEMO, BACK, ...
  description String?
  isActive    Boolean  @default(true)
  ownerId     String
  categoryId  String?

  owner       User
  category    ProjectCategory?
  issues      Issue[]
  sprints     Sprint[]
  releases    Release[]
  memberRoles UserProjectRole[]
}

model ProjectCategory {
  id          String @id
  name        String
  description String?
  projects    Project[]
}
```

## Связанные модули

- [[Module - Projects]] — CRUD
- [[Module - Issues]] — задачи проекта
- [[Module - Sprints]] — спринты проекта
- [[Module - Boards]] — Kanban
- [[Module - Releases]] — релизы
- [[Module - Teams]] — команды
- [[RBAC & Permissions]] — UserProjectRole
