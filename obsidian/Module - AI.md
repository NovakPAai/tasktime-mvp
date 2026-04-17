---
tags: [module, ai, claude]
---

# Module — AI

Path: `backend/src/modules/ai/`

## Роуты (`/api/ai`)

| Method | Path | Описание |
|--------|------|---------|
| POST | `/ai/estimate` | AI-оценка трудозатрат (issueId) |
| POST | `/ai/decompose` | AI-декомпозиция задачи (issueId) |
| GET | `/ai/sessions` | История AI-сессий (фильтры: issueId, userId, from, to) |
| GET | `/ai/sessions/:id` | Детали сессии (токены, стоимость) |

## Провайдеры

- `anthropic.provider.ts` — Claude API (`@anthropic-ai/sdk ^0.39.0`)
- `heuristic.provider.ts` — эвристические оценки без LLM (fallback)

## AiSession

Каждый AI-вызов пишет в `AiSession`:
- `model`, `provider`, `tokensInput`, `tokensOutput`, `costMoney`
- `startedAt`, `finishedAt`

## AI флаги на задаче

- `aiEligible` — задача разрешена AI
- `aiAssigneeType` — HUMAN | AGENT | MIXED
- `aiExecutionStatus` — NOT_STARTED | IN_PROGRESS | DONE | FAILED

AI-агент может:
- Логировать время (`source: AGENT` в [[Module - Time Tracking|TimeLog]])
- Менять `aiExecutionStatus`

## MCP Server

`backend/src/mcp/` — Model Context Protocol сервер для интеграции с внешними AI-клиентами

→ [[Infra - MCP Server]]

## Связи

- [[Module - Issues]] — AI флаги, декомпозиция
- [[Module - Time Tracking]] — AI тайм-логи
- [[Database Schema]] — AiSession модель
