---
tags: [model, prisma, user]
---

# Model — User

```prisma
model User {
  id                String             @id @default(uuid())
  email             String             @unique
  passwordHash      String
  name              String
  isActive          Boolean            @default(true)
  mustChangePassword Boolean           @default(false)
  createdAt         DateTime           @default(now())
  updatedAt         DateTime           @updatedAt

  systemRoles       UserSystemRole[]
  projectRoles      UserProjectRole[]
  refreshTokens     RefreshToken[]
  issues            Issue[]            // assigned
  createdIssues     Issue[]            // created
  comments          Comment[]
  timeLogs          TimeLog[]
  aiSessions        AiSession[]
  teamMembers       TeamMember[]
  auditLogs         AuditLog[]
}

model UserSystemRole {
  id      String @id
  userId  String
  role    SystemRole  // SUPER_ADMIN | ADMIN | RELEASE_MANAGER | USER | AUDITOR
}

model UserProjectRole {
  id        String @id
  userId    String
  projectId String
  role      ProjectRole // ADMIN | MANAGER | USER | VIEWER
}

model RefreshToken {
  token     String   @id
  userId    String
  expiresAt DateTime
}
```

## Связанные модули

- [[Module - Auth]] — логин, токены
- [[Module - Users]] — CRUD
- [[Module - Admin]] — управление пользователями
- [[RBAC & Permissions]] — роли
- [[Module - Time Tracking]] — тайм-логи пользователя
- [[Module - Teams]] — членство в командах
