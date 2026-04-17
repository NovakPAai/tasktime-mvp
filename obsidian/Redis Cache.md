---
tags: [infrastructure, redis, cache]
---

# Redis Cache

Redis 7, порт 6379. Запускается через Docker Compose.

## Ключи и TTL

| Ключ | Содержимое | TTL |
|------|-----------|-----|
| `wf:{projectId}:{issueTypeId}` | Resolved workflow для issue-типа | 300s |
| `timer:{userId}:{issueId}` | Активный таймер (startedAt) | до остановки |
| `rt:blacklist:{token}` | Инвалидированный refresh-токен | = expiry токена |

## Где используется

- [[Module - Workflow Engine]] — кэш резолвинга воркфлоу
- [[Module - Time Tracking]] — хранение активного таймера
- [[Module - Auth]] — blacklist refresh-токенов при logout

## Инвалидация

- Workflow cache сбрасывается при изменении [[Module - Workflow Engine|WorkflowScheme]]
- Timer cache сбрасывается при `POST /api/time/timer/stop`
- Token blacklist автоматически истекает

## Подключение

`redis` пакет v5, клиент в `backend/src/`:
```typescript
const redis = createClient({ url: process.env.REDIS_URL })
```

→ [[Backend Architecture]] · [[Infra - Docker]]
