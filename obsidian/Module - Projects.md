---
tags: [module, projects, core]
---

# Module — Projects

Path: `backend/src/modules/projects/`

## Роуты (`/api/projects`)

| Method | Path | Описание |
|--------|------|---------|
| GET | `/projects` | Список проектов (paginated) |
| POST | `/projects` | Создать проект |
| GET | `/projects/:id` | Детали проекта |
| PATCH | `/projects/:id` | Обновить |
| DELETE | `/projects/:id` | Soft delete |
| GET | `/projects/:id/teams` | Команды проекта |
| POST | `/projects/:id/teams` | Добавить команду |
| DELETE | `/projects/:id/teams/:teamId` | Убрать команду |
| GET | `/projects/:id/issue-types` | Типы задач проекта |

## DTO

- `CreateProjectDto` — name, key, description, categoryId, ownerId
- `UpdateProjectDto` — name, description, categoryId

## Ключ проекта

Уникальный `key` (например `DEMO`, `BACK`) — используется в issue ключах (`DEMO-42`)

## Связи

- [[Model - Project]] — Prisma-модель
- [[Module - Issues]] — задачи проекта
- [[Module - Sprints]] — спринты проекта
- [[Module - Boards]] — Kanban по проекту
- [[Module - Releases]] — релизы проекта
- [[Module - Teams]] — команды, привязанные к проекту
- [[Module - Workflows]] + [[Module - Workflow Engine]] — воркфлоу проекта
- [[RBAC & Permissions]] — UserProjectRole
