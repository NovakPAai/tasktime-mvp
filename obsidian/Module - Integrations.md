---
tags: [module, integrations, gitlab]
---

# Module — Integrations

Path: `backend/src/modules/integrations/`, `backend/src/modules/webhooks/`

## Роуты (`/api/integrations`)

| Method | Path | Описание |
|--------|------|---------|
| POST | `/integrations/gitlab/webhook` | GitLab webhook → автообновление статуса задачи |
| GET | `/integrations/gitlab/config` | Конфиг интеграции |
| POST | `/integrations/gitlab/config` | Настроить (apiUrl, token, projects) |

## GitLab Webhook

При событии GitLab MR (open/merge/close):
1. Найти задачу по MR title / branch name
2. Выполнить переход статуса через [[Module - Workflow Engine]]
3. Залогировать в [[Model - AuditLog]]

## Связи

- [[Module - Issues]] — статус задачи меняется по событию
- [[Module - Workflow Engine]] — переход статуса
