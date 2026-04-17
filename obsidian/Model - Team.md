---
tags: [model, prisma, team]
---

# Model — Team

```prisma
model Team {
  id          String       @id
  name        String
  description String?
  members     TeamMember[]
}

model TeamMember {
  teamId  String
  userId  String
  role    String
  team    Team
  user    User
}
```

## Связанные модули

- [[Module - Teams]] — CRUD
- [[Module - Sprints]] — projectTeamId, businessTeamId, flowTeamId
- [[Module - Projects]] — команды проекта
- [[Model - User]] — члены команды
