---
tags: [infra, postgresql, database]
---

# Infra — PostgreSQL

PostgreSQL 16, ORM — Prisma 6.

## Schema management

```bash
npx prisma db push          # синхронизировать schema без миграции (dev)
npx prisma migrate dev      # создать migration + применить
npx prisma migrate deploy   # применить миграции в prod
npx prisma studio           # GUI
```

## Оптимизации

- Индексы на `projectId`, `status`, `assigneeId`, `createdAt`, `sprintId`
- Foreign keys с cascade delete где уместно
- Enum-типы PostgreSQL (native)
- Soft delete через `isActive` (User, Project) — не hard delete

## Миграции

`backend/src/prisma/migrations/` — история SQL-миграций

## Seed

`backend/src/prisma/seed.ts` → `make seed`

Создаёт:
- 4 пользователя (admin, manager, dev, viewer)
- 2 проекта (DEMO, BACK)
- Набор задач, спринтов, воркфлоу

## Связи

- [[Database Schema]] — все 28 моделей
- [[Infra - Docker]] — Postgres в Docker
- [[Backend Architecture]] — Prisma client
