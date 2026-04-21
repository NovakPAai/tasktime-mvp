# План архитектуры геоизбыточности — TTMP-146

**Проект:** Flow Universe (TaskTime MVP)  
**Дата:** 2026-04-22  
**Статус:** Draft для ревью архитектора и PO  

---

## 1. Текущее состояние

### 1.1. Топология prod

Один host, Docker Compose, без оркестратора:

```
┌─────────────────────────────────────────────────────┐
│  Single Host (Astra Linux SE 1.7+ / Red OS 7.3+)    │
│                                                      │
│  [web nginx :80] ──► [backend :3000]                │
│                          │                           │
│                          ├──► [postgres:16-alpine]  │
│                          │     volume: postgres-data │
│                          │                           │
│                          └──► [redis:7-alpine]       │
│                                volume: redis-data    │
│                                                      │
│  [mcp :3002] ──► (backend :3000 + postgres)         │
│  [pipeline-service] ──► [pipeline-postgres]          │
└─────────────────────────────────────────────────────┘
```

### 1.2. Ключевые характеристики стека

| Компонент | Версия | Состояние |
|-----------|--------|-----------|
| Node.js backend | 20 LTS, Express 4 | Один процесс, `app.listen(PORT)` |
| PostgreSQL | 16-alpine | Single-node, локальный volume |
| Redis | 7-alpine, AOF включён | Single-node, локальный volume |
| Prisma | 6.x | Единственная `DATABASE_URL` |
| Redis client | `redis@5.11.0` | `REDIS_URL` опциональный — graceful degrade |
| JWT | stateless access + DB refresh | **Плюс для масштабирования** — stateless |
| Sliding-session | Redis ключ `session:<userId>` | Stateful; fallback на JWT при отказе Redis |
| Scheduler | `node-cron` (checkpoints) | In-process singleton, неустойчив к 2+ инстансам |

### 1.3. Что уже работает в пользу HA

1. **Stateless access-JWT** — middleware `authenticate` полностью stateless
2. **Graceful degradation Redis** — при отказе Redis приложение не падает (`shared/redis.ts:151-154`)
3. **Health/ready probes** — `/api/ready` используется как healthcheck
4. **Distributed lock** — `acquireLock`/`releaseLock` с Lua-CAS готов для leader-election (`shared/redis.ts:236-273`)

### 1.4. SPOF-анализ

| № | Отказ | Что ломается | RTO сейчас | RPO сейчас |
|---|-------|-------------|-----------|-----------|
| F1 | Падение host'а | 100% сервиса | Часы | До 24ч |
| F2 | Потеря volume `postgres-data` | Полная потеря данных | N/A | = период бэкапа |
| F3 | Падение postgres-контейнера | API 500 на все routes | ~30 сек (auto-restart) | Данные целы |
| F4 | Падение redis | Rate-limit open, cache miss, cron-lock недоступен | ~30 сек | N/A |
| F5 | OOM backend-процесса | 100% API down | ~30 сек | N/A |
| F7 | Corruption БД | Data loss | PITR отсутствует | = ночной бэкап |
| F8 | 2-й инстанс backend | Cron-задачи выполняются дважды | — | — |

---

## 2. Стратегия: Active-Standby (рекомендация)

### Почему не Active-Active

1. Команда 2 человека — эксплуатация BDR-кластера нереалистична
2. NFR (2,500 concurrent sessions, p95 < 200ms) легко удовлетворяются primary + read replicas
3. Целевой клиент (российский финсектор, on-prem) — 2 ДЦ в одном регионе, latency < 5 мс
4. Архитектурный долг от AA без необходимости превысит выгоду

**Active-Active** — откладываем на Phase 3 (>500 enterprise-клиентов или SLA 99.99%).

---

## 3. PostgreSQL — выбор репликации

| Опция | Pros | Cons | Рекомендация |
|-------|------|------|--------------|
| **Streaming async** | Нативно в PG16, минимальный overhead | Ручной failover, RPO = async lag | **Phase 1** |
| **Streaming sync** | RPO = 0 | +latency на каждый write | Только для audit log ФЗ-152 |
| **Patroni + etcd** | Авто-failover, industry standard | Требует etcd-кластер (+3 узла) | **Phase 2** |
| **pgBackRest PITR** | RPO < 1 мин, point-in-time recovery | DR, не заменяет HA | **Обязательно с Phase 1** |
| **Citus / BDR** | Multi-master write scale | Коммерческая лицензия, не поддерживается Prisma | Phase 3 |

---

## 4. Redis HA — выбор

| Опция | Pros | Cons | Рекомендация |
|-------|------|------|--------------|
| **Redis Sentinel (3-node)** | Нативный авто-failover, совместим с `redis@5.x` | Нужно обновить клиент (Sentinel URL) | **Phase 1** |
| **Redis Cluster** | Горизонтальный scale по памяти | Multi-key операции ограничены; `MULTI` в `incrWithTtl` требует проверки | Phase 3 |

**Важно:** `shared/redis.ts:28` — `createClient({ url })` → переделать на `createSentinel` при Phase 1.  
Lua-скрипт `releaseLock` и `incrWithTtl` совместимы с Sentinel без изменений.

---

## 5. Backend — кластеризация

### Stateful точки и решения

| Состояние | Где | Решение |
|-----------|-----|---------|
| Access-JWT | `shared/middleware/auth.ts` | Уже stateless. Единый `JWT_SECRET` на всех инстансах |
| Sliding-session | `Redis: session:<userId>` | Shared Redis Sentinel → все инстансы видят один keyspace |
| `sessionFallbackCounter` | In-process | Per-instance — не критично; экспортировать в Prometheus с `instance` label |
| `startCheckpointScheduler` | `server.ts:12` | **Требует leader-election** (см. ниже) |

### Leader election для cron (Phase 1)

Использовать готовый `acquireLock` из `shared/redis.ts:244`:

```typescript
// checkpoint-scheduler.service.ts — перед каждым тиком
const token = await acquireLock('cron:checkpoints', CRON_INTERVAL_SEC + 10);
if (!token) return; // другой инстанс держит lock
try {
  await runCheckpoints();
} finally {
  await releaseLock('cron:checkpoints', token);
}
```

На Phase 2 — выделить `backend-scheduler` в отдельный контейнер (`replicas: 1`).

### Load balancer

- **Phase 1:** Nginx upstream `least_conn` (текущий web-контейнер + второй backend)
- **Phase 2:** HAProxy + keepalived (VRRP virtual IP) — nginx сам становится SPOF

**Round-robin без sticky** корректен — JWT stateless, session в shared Redis.

---

## 6. Поэтапный roadmap

### Phase 1 — Quick wins (1–2 спринта)

**Цель:** RPO < 15 мин, RTO < 4 ч, read-scale

| Задача | Ветка | Риск |
|--------|-------|------|
| pgBackRest + WAL archiving → NFS/S3 | `feat/geo-phase1-pgbackrest` | Низкий |
| Streaming read replica (1 узел) + split в Prisma | `feat/geo-phase1-read-replica` | Средний |
| Redis Sentinel 3-node | `feat/geo-phase1-redis-sentinel` | Средний |
| Cron leader-lock через `acquireLock` | `feat/geo-phase1-cron-leader-lock` | Низкий |
| Горизонтальный backend (N=2) через Nginx upstream | `chore/geo-phase1-compose-scale` | Низкий |
| Усилить `/api/ready` (проверка PG + Redis) | `chore/geo-phase1-ready-probe` | Низкий |

**Метрики успеха:**
- RPO по WAL ≤ 60 сек
- Один инстанс backend можно убить — API остаётся доступным
- Replication lag p95 < 5 сек

**Риски:**
- Split read/write в Prisma → регрессии при eventual read. Митигация: помечать write+immediate-read явным флагом для primary.
- `REDIS_URL` → `REDIS_SENTINELS` — breaking change конфига. Нужен migration guide и backward-compat ветка в `createClient`.

### Phase 2 — Active-Standby с авто-failover (2–3 спринта)

**Цель:** RTO < 5 мин, RPO < 30 сек, второй ДЦ

| Задача | Компонент |
|--------|-----------|
| Patroni + etcd (3-node) | PostgreSQL HA |
| HAProxy (порт 5000 write / 5001 read) | PG load balancer |
| Физическое разнесение в 2 ДЦ | Инфра |
| Redis Sentinel cross-DC (3 Sentinel + witness) | Redis HA |
| `backend-scheduler` как отдельный сервис | Backend |
| HAProxy + keepalived (VRRP) | Backend LB |
| Runbook + game day (failover drill 1×/квартал) | Ops |

**Риски:**
- **[высокий]** Split-brain при сетевом партишне. Митигация: quorum etcd, fence-скрипт, witness в третьей точке
- **[средний]** WAN lag > цели. Митигация: мониторинг `pg_stat_replication.replay_lag`; sync replication для audit log ФЗ-152
- **[средний]** Сложность для 2-person team. Митигация: рассмотреть managed Patroni (VK Cloud Postgres-HA) если политика заказчика позволяет

### Phase 3 — Active-Active (только при явном триггере)

**Триггеры:** SLA 99.99% / >500 enterprise-tenants / геораспределённые пользователи

Задачи: шардирование по tenant (Citus), Redis Cluster, Event bus (Kafka/NATS), CQRS для read-heavy модулей, idempotency keys на HTTP-уровне, distributed tracing (OpenTelemetry).

**Разработка ≥ 6 месяцев. Не начинать без архитектурного ADR.**

---

## 7. Итоговая матрица

| Фаза | RTO | RPO | Изменений в коде | Изменений в инфре | Усилия |
|------|-----|-----|-----------------|-------------------|--------|
| **Phase 1** | 1–4 ч | < 60 сек | Малые | Средние | 1–2 спринта |
| **Phase 2** | < 5 мин | < 30 сек | Средние | Большие | 2–3 спринта |
| **Phase 3** | ~0 | ~0 | Крупный рефакторинг | Большие | 6+ мес |

---

## 8. Следующие шаги

1. PO ревью этого документа → `gate_passed: true` для TTMP-146
2. Создать ADR-001 (Streaming Replication + Sentinel) и ADR-002 (Patroni)
3. Разбить Phase 1 на 6 задач (таблица выше) → в backlog
4. Обновить `docs/architecture/overview.md` — ссылка на этот план

---

## Проанализированные файлы

- `docker-compose.yml`, `deploy/docker-compose.production.yml`
- `backend/src/config.ts` — env-схема, `DATABASE_URL`, `REDIS_URL`
- `backend/src/server.ts` — scheduler bootstrap
- `backend/src/shared/redis.ts` — distributed lock, sliding-session, graceful degrade
- `backend/src/shared/middleware/auth.ts` — JWT stateless + Redis-session + fallback counter
- `backend/package.json` — `redis@5.11.0` (поддержка Sentinel/Cluster)
- `docs/architecture/overview.md` — существующая архитектурная база
