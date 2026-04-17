---
tags: [module, releases]
---

# Module — Releases

Path: `backend/src/modules/releases/`

## Роуты (`/api/releases`)

| Method | Path | Описание |
|--------|------|---------|
| GET | `/releases` | Список (фильтры: status, type, projectId) |
| POST | `/releases` | Создать релиз |
| GET | `/releases/:id` | Детали + items |
| PATCH | `/releases/:id` | Обновить |
| DELETE | `/releases/:id` | Удалить (не released) |
| POST | `/releases/:id/items` | Добавить задачу в релиз |
| DELETE | `/releases/:id/items/:issueId` | Убрать задачу |
| PATCH | `/releases/:id/status` | Сменить статус (через workflow) |

## Admin роуты

- `/api/admin/release-statuses` — CRUD статусов
- `/api/admin/release-workflows` — CRUD release workflows

## Типы релизов

- `ATOMIC` — один проект
- `INTEGRATION` — кросс-проектный (несколько команд)

## Уровни

- `MINOR` — малый релиз
- `MAJOR` — мажорный релиз

## Release Workflow

Аналог [[Module - Workflow Engine]] но для релизов:
```
ReleaseWorkflow
  ├── ReleaseWorkflowStep → ReleaseStatus
  └── ReleaseWorkflowTransition (from → to, conditions, isGlobal)
```

## Pipeline Dashboard

`PipelineDashboardPage.tsx` — пакетное создание, деплой, тестирование, релиз

## Связи

- [[Model - Release]] — Prisma-модель
- [[Module - Issues]] — `releaseId` на задаче
- [[Module - Sprints]] — `releaseId` на спринте
- [[Module - Projects]] — релиз принадлежит проекту
- [[Frontend - Pages]] — `ReleasesPage`, `GlobalReleasesPage`, `PipelineDashboardPage`
