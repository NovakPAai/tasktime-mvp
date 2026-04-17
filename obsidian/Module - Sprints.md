---
tags: [module, sprints, agile]
---

# Module — Sprints

Path: `backend/src/modules/sprints/`

## Роуты

| Method | Path | Описание |
|--------|------|---------|
| GET | `/sprints` | Список активных спринтов |
| GET | `/sprints/:id` | Детали + задачи |
| POST | `/projects/:projectId/sprints` | Создать спринт |
| PATCH | `/sprints/:id` | Обновить (name, goal, endDate, teamIds) |
| DELETE | `/sprints/:id` | Удалить (только PLANNED) |
| POST | `/sprints/:id/start` | PLANNED → ACTIVE |
| POST | `/sprints/:id/close` | ACTIVE → CLOSED (незакрытые → backlog) |
| POST | `/sprints/:id/issues` | Добавить задачу |
| DELETE | `/sprints/:id/issues/:issueId` | Убрать задачу |

## State machine

```
PLANNED ──start──→ ACTIVE ──close──→ CLOSED
```

При закрытии: незавершённые задачи (`sprintId = null`) уходят в backlog

## Ограничения

- Только один ACTIVE спринт на проект
- PLANNED спринт можно удалить, ACTIVE/CLOSED — нет

## Команды в спринте

Спринт может быть связан с тремя типами команд:
- `projectTeamId` — проектная команда
- `businessTeamId` — бизнес-команда  
- `flowTeamId` — flow-команда

## Связи

- [[Model - Sprint]] — Prisma-модель
- [[Module - Issues]] — задачи в спринте
- [[Module - Projects]] — спринт принадлежит проекту
- [[Module - Teams]] — команды спринта
- [[Module - Releases]] — спринт может быть привязан к релизу
- [[Frontend - Pages]] — `SprintsPage.tsx`, `GlobalSprintsPage.tsx`
