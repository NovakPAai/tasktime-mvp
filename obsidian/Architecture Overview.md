---
tags: [architecture, overview]
---

# Architecture Overview

TaskTime MVP — модульный монолит (modular monolith) на Node.js + React.

## Стек

| Слой | Технологии |
|------|-----------|
| Frontend | React 18, Vite, Ant Design, Zustand, Axios |
| Backend | Node.js, Express, TypeScript |
| ORM | Prisma 6 + PostgreSQL 16 |
| Cache | Redis 7 |
| Auth | JWT (access + refresh) |
| Validation | Zod |
| Testing | Vitest, Supertest, Playwright |

## Три слоя

```
Browser (React) ──→ REST API (Express) ──→ PostgreSQL
                          │
                          └──→ Redis (cache, timers, token blacklist)
```

## Ключевые паттерны

- **Module pattern** — каждый домен: `router.ts` + `service.ts` + `dto.ts`
- **RBAC** — см. [[RBAC & Permissions]]
- **Audit log** — все мутации логируются в [[Model - AuditLog]]
- **Workflow engine** — переходы статусов через [[Module - Workflow Engine]]
- **Redis** — кэш воркфлоу, таймеры, blacklist токенов — см. [[Redis Cache]]

## Связанные ноты

- [[Backend Architecture]] — структура backend
- [[Frontend Architecture]] — структура frontend
- [[Database Schema]] — все 28 Prisma-моделей
- [[Dev Workflow]] — как запускать и деплоить
