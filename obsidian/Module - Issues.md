---
tags: [module, issues, core]
---

# Module — Issues

Path: `backend/src/modules/issues/`

## Роуты

| Method | Path | Описание |
|--------|------|---------|
| GET | `/issues/search` | Глобальный поиск (q, excludeId) |
| GET | `/projects/:projectId/issues` | Список задач проекта (фильтры: status, type, priority, assignee, sprint) |
| POST | `/projects/:projectId/issues` | Создать задачу |
| GET | `/issues/key/:key` | По ключу (PROJ-42) |
| GET | `/issues/:id` | Детали задачи |
| PATCH | `/issues/:id` | Обновить (title, description, hours, dueDate) |
| PATCH | `/issues/:id/status` | Сменить статус → [[Module - Workflow Engine]] |
| PATCH | `/issues/:id/assign` | Назначить исполнителя |
| PATCH | `/issues/:id/ai-flags` | AI флаги (aiEligible, aiAssigneeType) |
| PATCH | `/issues/:id/ai-status` | AI статус выполнения |
| PATCH | `/issues/:id/change-type` | Сменить тип задачи |
| POST | `/issues/:id/move` | Перенести в другой спринт/проект |
| POST | `/issues/bulk-transition` | Массовый переход статусов |
| DELETE | `/issues/:id` | Удалить (require ADMIN) |

## Иерархия

```
EPIC
  └── STORY
        └── TASK
              └── SUBTASK
```

Через `parentId` (self-referential в [[Model - Issue]])

## Статусы и приоритеты

- **IssueStatus**: OPEN → IN_PROGRESS → REVIEW → DONE | CANCELLED
- **IssuePriority**: CRITICAL | HIGH | MEDIUM | LOW

Переходы управляются [[Module - Workflow Engine]]

## AI флаги

- `aiEligible` — задача разрешена для AI-исполнителя
- `aiAssigneeType` — HUMAN | AGENT | MIXED
- `aiExecutionStatus` — NOT_STARTED | IN_PROGRESS | DONE | FAILED

## Связи

- [[Model - Issue]] — Prisma-модель
- [[Module - Workflow Engine]] — валидация переходов статусов
- [[Module - Comments]] — комментарии к задаче
- [[Module - Time Tracking]] — логи времени
- [[Module - Issue Links]] — связи между задачами
- [[Module - Custom Fields]] — кастомные поля задачи
- [[Module - Sprints]] — принадлежность спринту
- [[Module - Boards]] — Kanban-колонки
- [[Module - AI]] — AI-оценка и декомпозиция
