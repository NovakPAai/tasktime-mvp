---
tags: [module, admin]
---

# Module — Admin

Path: `backend/src/modules/admin/`

## Роуты (`/api/admin`)

| Method | Path | Роль | Описание |
|--------|------|------|---------|
| GET | `/admin/stats` | ADMIN, AUDITOR | Системная статистика |
| GET/POST | `/admin/users` | ADMIN, SUPER_ADMIN | Список / создать пользователя |
| PATCH/DELETE | `/admin/users/:id` | | Обновить / удалить |
| PATCH | `/admin/users/:id/deactivate` | | Деактивировать |
| POST | `/admin/users/:id/reset-password` | | Сбросить пароль |
| GET/POST | `/admin/users/:id/system-roles` | SUPER_ADMIN | Системные роли |
| DELETE | `/admin/users/:id/system-roles/:roleId` | | |
| GET | `/admin/activity` | ADMIN, AUDITOR | Audit log |
| GET/PATCH | `/admin/settings/registration` | SUPER_ADMIN | Открыть/закрыть регистрацию |
| GET/PATCH | `/admin/settings/system` | SUPER_ADMIN | Системные настройки |
| GET | `/admin/uat-tests` | | UAT тест-сценарии |
| GET/POST/PUT/DELETE | `/admin/issue-type-configs` | ADMIN | Типы задач |

## Типы задач (IssueTypeConfig)

Определяет: EPIC, STORY, TASK, SUBTASK, BUG + кастомные
- `isSubtask` — является ли конечным узлом иерархии
- `iconName`, `iconColor`
- `isEnabled` — вкл/выкл

## Схемы типов (IssueTypeScheme)

Привязывает набор типов к проекту — `AdminIssueTypeSchemesPage`

## Связи

- [[RBAC & Permissions]] — роли для admin endpoints
- [[Module - Users]] — управление пользователями
- [[Module - Workflows]] — admin/workflow-* роуты
- [[Module - Custom Fields]] — admin/custom-fields роуты
- [[Frontend - Pages]] — 13 Admin Pages
