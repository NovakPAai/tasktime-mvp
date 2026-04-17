---
tags: [module, boards, kanban]
---

# Module — Boards

Path: `backend/src/modules/boards/`

## Роуты (`/api/projects/:projectId/board`)

| Method | Path | Описание |
|--------|------|---------|
| GET | `/projects/:projectId/board` | Kanban: колонки по статусу + задачи с orderIndex |
| PATCH | `/projects/:projectId/board/reorder` | Переместить задачу (toStatusId, newOrderIndex) |

## Как работает Kanban

1. Статусы колонок берутся из [[Module - Workflow Engine]] (резолвинг воркфлоу проекта)
2. Задачи группируются по `status`
3. Порядок задач — `orderIndex` поле на [[Model - Issue]]
4. Drag-n-drop через `@hello-pangea/dnd` на фронте

## Reorder логика

```
PATCH /board/reorder { issueId, toStatusId, newOrderIndex }
  → validate transition (Workflow Engine)
  → update issue.status + issue.orderIndex
  → reorder siblings in toStatus column
```

## Связи

- [[Module - Issues]] — задачи на доске
- [[Module - Workflow Engine]] — допустимые переходы
- [[Module - Projects]] — контекст проекта
- [[Frontend - Pages]] — `BoardPage.tsx`
