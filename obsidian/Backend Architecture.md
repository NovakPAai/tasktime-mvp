---
tags: [architecture, backend]
---

# Backend Architecture

Path: `backend/src/`

## Структура модуля

```
modules/<name>/
├── <name>.router.ts    # Express routes + middleware stack
├── <name>.service.ts   # Бизнес-логика + Prisma
├── <name>.dto.ts       # Zod-схемы валидации
└── <name>.test.ts      # Unit/integration тесты
```

## Request Flow

```
HTTP Request
  → authenticate (JWT) → req.user = { userId, email, systemRoles }
  → requireRole / checkProjectRole (RBAC)
  → validate(ZodSchema)
  → router handler
  → service (Prisma + Redis)
  → JSON Response
  → auditMiddleware (пишет в audit_logs)
```

## Middleware стек

Все middleware — в `backend/src/shared/middleware/`:

| Файл | Назначение |
|------|-----------|
| `auth.ts` | JWT → `req.user` |
| `rbac.ts` | Проверка ролей |
| `audit.ts` | Логирование мутаций |
| `validate.ts` | Zod-валидация DTO |
| `error-handler.ts` | Глобальный обработчик ошибок |
| `metrics.ts` | Request timing, счётчики |

Подробнее → [[RBAC & Permissions]]

## 28 Backend модулей

[[Module - Auth]] · [[Module - Users]] · [[Module - Projects]] · [[Module - Issues]] ·
[[Module - Boards]] · [[Module - Sprints]] · [[Module - Time Tracking]] · [[Module - Comments]] ·
[[Module - Teams]] · [[Module - Releases]] · [[Module - Workflows]] · [[Module - Workflow Engine]] ·
[[Module - Custom Fields]] · [[Module - Field Schemas]] · [[Module - Issue Links]] ·
[[Module - AI]] · [[Module - Admin]] · [[Module - Integrations]] · [[Module - Monitoring]]

## Redis

Используется в:
- Кэш workflow resolution (`wf:{projectId}:{issueTypeId}`, TTL 300s)
- Таймеры (`timer:{userId}:{issueId}`)
- Blacklist refresh-токенов

→ [[Redis Cache]]

## База данных

28 Prisma-моделей → [[Database Schema]]

Prisma client: `backend/src/prisma/client.ts`
Schema: `backend/src/prisma/schema.prisma`
