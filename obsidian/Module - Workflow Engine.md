---
tags: [module, workflow-engine, core]
---

# Module — Workflow Engine

Path: `backend/src/modules/workflow-engine/`

## Роуты (`/api/workflow-engine`)

| Method | Path | Описание |
|--------|------|---------|
| GET | `/workflow-engine/transitions` | Доступные переходы для задачи |
| POST | `/workflow-engine/transitions` | Выполнить переход |
| GET | `/workflow-engine/resolve` | Резолвинг воркфлоу для задачи (с кэшем) |

## Как работает резолвинг

```
resolveWorkflow(projectId, issueTypeId)
  1. Redis lookup: wf:{projectId}:{issueTypeId}
  2. MISS → WorkflowScheme → SchemeItem → Workflow
  3. Cache result (TTL 300s)
```

## Выполнение перехода

```
executeTransition(issueId, toStatusId, screenValues, comment)
  1. resolveWorkflow → найти переход
  2. validateTransition → conditions + validators
  3. applyTransition → update issue.status
  4. postFunctions → side effects (assign, notify, etc.)
  5. logAudit
```

## Conditions & Validators (JSON в WorkflowTransition)

- `conditions` — предусловия (например, assignee != null)
- `validators` — блокирующие проверки (например, все subtasks DONE)
- `postFunctions` — действия после перехода (автоназначение, уведомление)

## Экран перехода

При переходе с `screenId` → показать поля [[Module - Workflows|TransitionScreen]] → взять `screenValues`

## Связи

- [[Module - Workflows]] — определения воркфлоу
- [[Module - Issues]] — `PATCH /issues/:id/status`
- [[Module - Boards]] — reorder с изменением статуса
- [[Redis Cache]] — кэш резолвинга
- [[Database Schema]] — Workflow, WorkflowTransition
