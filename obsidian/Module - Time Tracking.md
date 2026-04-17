---
tags: [module, time, tracking]
---

# Module — Time Tracking

Path: `backend/src/modules/time/`

## Роуты (`/api/time`)

| Method | Path | Описание |
|--------|------|---------|
| GET | `/time/logs` | Логи времени пользователя (from, to, issueId) |
| POST | `/time/logs` | Залогировать время вручную |
| GET | `/time/reports` | Отчёт (агрегат по задаче, пользователю, дате) |
| POST | `/time/timer/start` | Старт таймера (issueId) |
| POST | `/time/timer/stop` | Стоп → автолог |
| GET | `/time/timer/current` | Текущий таймер |

## Логика таймера

```
start → сохранить startedAt в Redis (timer:{userId}:{issueId})
stop  → delta = now - startedAt → создать TimeLog
      → убрать из Redis
```

Ограничение: только один активный таймер на пользователя

## TimeLog источники

- `HUMAN` — ручной лог или таймер от пользователя
- `AGENT` — залогировано AI-агентом (поле `agentSessionId`)

## Стоимость

`costMoney` — рассчитывается из `hours * hourlyRate` (берётся из настроек)

## Связи

- [[Model - TimeLog]] — Prisma-модель
- [[Module - Issues]] — лог привязан к задаче
- [[Module - AI]] — AI-агент пишет тайм-логи
- [[Redis Cache]] — хранение активного таймера
- [[Frontend - Pages]] — `TimePage.tsx`
