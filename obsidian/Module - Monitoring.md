---
tags: [module, monitoring, infra]
---

# Module — Monitoring

Path: `backend/src/modules/monitoring/`

## Роуты (`/api/monitoring`)

| Method | Path | Описание |
|--------|------|---------|
| GET | `/health` | Health check (DB, Redis, disk) |
| GET | `/metrics` | Метрики (uptime, request count, error rate) |

## Health Check

Проверяет:
- PostgreSQL — ping query
- Redis — PING command
- Disk space — минимальный порог

## Метрики

Собирает middleware `metrics.ts`:
- Request count по роуту
- Error rate
- Response time (percentiles)

## Связи

- [[Redis Cache]] — health check Redis
- [[Infra - PostgreSQL]] — health check DB
- [[Frontend - Pages]] — `AdminMonitoringPage`
