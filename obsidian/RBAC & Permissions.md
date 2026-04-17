---
tags: [auth, rbac, security]
---

# RBAC & Permissions

## Системные роли (UserSystemRole)

| Роль | Доступ |
|------|-------|
| `SUPER_ADMIN` | Всё: создание/удаление пользователей, системные настройки |
| `ADMIN` | Управление пользователями, воркфлоу, кастомными полями |
| `RELEASE_MANAGER` | Управление релизами |
| `AUDITOR` | Чтение audit logs, статистика |
| `USER` | Базовый доступ |

## Проектные роли (UserProjectRole)

| Роль | Доступ в проекте |
|------|----------------|
| `ADMIN` | Полное управление проектом |
| `MANAGER` | Создание спринтов, управление командами |
| `USER` | Создание/редактирование задач |
| `VIEWER` | Только чтение |

## Middleware

`backend/src/shared/middleware/rbac.ts`:
- `requireRole(...roles)` — проверка системной роли
- `requireSuperAdmin` — только SUPER_ADMIN
- `checkProjectRole(role)` — проверка роли в конкретном проекте

## Поток аутентификации

```
POST /api/auth/login
  → bcrypt.compare(password, hash)
  → issue accessToken (JWT, 15min) + refreshToken (JWT, 7d)

Запрос с токеном:
  → authenticate middleware
  → decode JWT → req.user = { userId, email, systemRoles, projectRoles }
  → requireRole / checkProjectRole
```

→ [[Module - Auth]] · [[Model - User]] · [[Backend Architecture]]

## Где применяется RBAC

- [[Module - Admin]] — ADMIN, SUPER_ADMIN
- [[Module - Users]] — SUPER_ADMIN для создания/удаления
- [[Module - Workflows]] — ADMIN
- [[Module - Releases]] — RELEASE_MANAGER, ADMIN
- [[Module - Projects]] — projectRole ADMIN/MANAGER
