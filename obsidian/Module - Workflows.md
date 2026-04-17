---
tags: [module, workflows, admin]
---

# Module — Workflows

Path: `backend/src/modules/workflows/`

## Роуты (`/api/admin/workflows`)

| Method | Path | Описание |
|--------|------|---------|
| GET/POST | `/admin/workflow-statuses` | Статусы воркфлоу |
| PATCH/DELETE | `/admin/workflow-statuses/:id` | |
| GET/POST | `/admin/workflows` | Воркфлоу |
| PATCH/DELETE | `/admin/workflows/:id` | |
| POST/PATCH/DELETE | `/admin/workflows/:id/steps` | Шаги воркфлоу |
| POST/PATCH/DELETE | `/admin/workflows/:id/transitions` | Переходы |
| GET | `/admin/workflows/:id/validate` | Валидация графа |

## Структура воркфлоу

```
Workflow
  ├── WorkflowStep (status + isInitial + orderIndex)
  └── WorkflowTransition
        ├── fromStatusId (null = global transition)
        ├── toStatusId
        ├── conditions   (JSON)
        ├── validators   (JSON)
        ├── postFunctions (JSON)
        └── screenId → TransitionScreen
```

## WorkflowStatus

- `name`, `category` (TODO | IN_PROGRESS | DONE), `color`, `iconName`
- `isSystem` — системные статусы нельзя удалить

## WorkflowScheme

Привязывает воркфлоу к проекту/типу задачи:
```
WorkflowScheme
  ├── WorkflowSchemeItem (workflow + issueTypeConfig)
  └── WorkflowSchemeProject → Project
```

Роуты: `/api/admin/workflow-schemes`

## TransitionScreen

Поля, которые показываются при переходе:
```
TransitionScreen ──── TransitionScreenItem (customField | systemField, isRequired)
```

Роуты: `/api/admin/transition-screens`

## Связи

- [[Module - Workflow Engine]] — исполнение переходов
- [[Module - Issues]] — смена статуса задачи
- [[Module - Custom Fields]] — поля на экране перехода
- [[Database Schema]] — модели Workflow, WorkflowScheme
- [[Frontend - Pages]] — `AdminWorkflowsPage`, `AdminWorkflowEditorPage`
