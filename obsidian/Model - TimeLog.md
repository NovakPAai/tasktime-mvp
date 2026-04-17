---
tags: [model, prisma, time]
---

# Model — TimeLog

```prisma
model TimeLog {
  id             String     @id
  issueId        String
  userId         String
  hours          Float
  note           String?
  startedAt      DateTime?
  stoppedAt      DateTime?
  logDate        DateTime
  source         LogSource  // HUMAN | AGENT
  agentSessionId String?
  costMoney      Float?

  issue          Issue
  user           User
  aiSession      AiSession?
}

model AiSession {
  id           String    @id
  issueId      String
  userId       String
  model        String
  provider     String
  startedAt    DateTime
  finishedAt   DateTime?
  tokensInput  Int
  tokensOutput Int
  costMoney    Float?
  notes        String?

  issue        Issue
  user         User
  timeLogs     TimeLog[]
}
```

## Связанные модули

- [[Module - Time Tracking]] — таймер и ручной лог
- [[Module - AI]] — AI-сессии и агентские логи
- [[Model - Issue]] — задача, к которой привязан лог
- [[Model - User]] — кто залогировал
