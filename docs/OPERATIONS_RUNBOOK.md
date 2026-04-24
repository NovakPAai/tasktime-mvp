# Flow Universe Operations Runbook

## Daily Checks

- Confirm the latest staging deploy used the expected image tag
- Check `docker compose ps` for `web`, `backend`, `postgres`, `redis`
- Verify `http://127.0.0.1:<port>/healthz` on the target server
- Verify `GET /api/ready` returns `200` behind the web container

## Health Endpoints

- Liveness: `GET /api/health`
- Readiness: `GET /api/ready`
- Web container: `GET /healthz`

`/api/ready` fails when:

- PostgreSQL is unreachable
- Redis is configured but unavailable

## Standard Deploy

```bash
./deploy/scripts/deploy.sh staging <image-tag>
./deploy/scripts/deploy.sh production <image-tag>
```

Post-deploy smoke checks:

1. `curl -fsS http://127.0.0.1:<port>/healthz`
2. login flow from the UI
3. `GET /api/health`
4. `GET /api/ready`

## Rollback Procedure

If the new release is unhealthy:

```bash
./deploy/scripts/rollback.sh production <previous-image-tag>
```

After rollback:

1. verify `/healthz`
2. verify `/api/ready`
3. inspect failing migration or application logs
4. prepare a forward-fix release

## Backup Procedure

Create a SQL backup:

```bash
./deploy/scripts/backup-postgres.sh production
```

Recommended policy:

- nightly production backup
- keep at least 7 daily copies
- copy backups off-host according to customer policy

## Restore Drill

Restore a backup into staging before production usage:

```bash
./deploy/scripts/restore-postgres.sh staging deploy/backups/staging/postgres-YYYYMMDD-HHMMSS.sql
```

After restore:

1. start the stack
2. verify login works
3. verify key project and issue pages render
4. verify `/api/ready`

## Logging

Container logs:

```bash
docker compose --env-file deploy/env/.env.production -f deploy/docker-compose.production.yml logs -f
```

Useful focused commands:

```bash
docker compose --env-file deploy/env/.env.production -f deploy/docker-compose.production.yml logs -f backend
docker compose --env-file deploy/env/.env.production -f deploy/docker-compose.production.yml logs -f web
docker compose --env-file deploy/env/.env.production -f deploy/docker-compose.production.yml logs -f postgres
```

## TLS Renewal

If TLS terminates on the host:

1. use Certbot timer or equivalent scheduled renewal
2. reload the edge proxy after renewal
3. verify certificate expiry monthly

If TLS terminates upstream:

1. verify the provider rotation policy
2. confirm the backend still receives `X-Forwarded-Proto`

## Security Checks

**Dependency vulnerabilities** (run locally or in CI, and before release):

```bash
make audit
```

This runs `npm audit` in `backend` and `frontend`. Fix reported issues with `npm audit fix` (or `npm audit fix --force` only if you accept breaking changes). For deeper checks and SAST, see `.cursor/skills/infosec/SKILL.md` and consider Snyk or OWASP ZAP.

## Host Hardening Checklist

- non-root deploy user
- SSH keys only, password login disabled
- firewall allows only `22`, `80`, `443`
- PostgreSQL and Redis not exposed publicly
- Docker updated under change control
- production env files readable only by deploy user

## Incident Notes

During an incident capture:

- deployed image tag
- time of failure
- health endpoint status
- recent logs from `backend` and `web`
- whether DB migration ran successfully

---

## Bulk Operations (TTBULK-1)

### Forensics: кто что изменил через массовую операцию

Все изменения от массовой операции аудируются с `AuditLog.bulk_operation_id` (FK на `bulk_operations.id`, PR-1 schema).

**Кто запустил операцию и когда:**
```sql
SELECT id, created_by_id, type, status, total, succeeded, failed, skipped,
       created_at, started_at, finished_at
FROM bulk_operations
WHERE id = '<operation-id>';
```

**Все задачи, затронутые операцией:**
```sql
SELECT a.id, a.entity_id AS issue_id, a.action, a.details, a.created_at,
       i.number, p.key AS project_key
FROM audit_logs a
JOIN issues i ON i.id::text = a.entity_id
JOIN projects p ON p.id = i.project_id
WHERE a.bulk_operation_id = '<operation-id>'
  AND a.entity_type = 'issue'
ORDER BY a.created_at;
```

**Все операции пользователя за N дней:**
```sql
SELECT id, type, status, total, created_at, finished_at,
       EXTRACT(EPOCH FROM (finished_at - started_at)) AS duration_seconds
FROM bulk_operations
WHERE created_by_id = '<user-id>'
  AND created_at > now() - interval '30 days'
ORDER BY created_at DESC;
```

**Отчёт failed items для retry:**
```sql
SELECT issue_id, issue_key, error_code, error_message, created_at
FROM bulk_operation_items
WHERE operation_id = '<operation-id>'
  AND outcome = 'FAILED'
  AND error_code != 'CANCELLED_BY_USER'
ORDER BY created_at;
```

### Операционные алёрты (Prometheus, PR-13)

См. `deploy/prometheus/bulk-operations.alerts.yml`:

- **BulkOpQueuedDepthHigh** (warning, ≥10 активных 5m) — processor не дренит очередь. Проверь:
  1. `rate(bulk_op_processor_ticks_total{result="processed"}[5m])` — падение = worker висит.
  2. `LLEN bulk-op:{id}:pending` (Redis CLI) — какие конкретно операции растут.
  3. Backend logs `captureError` в `executeTransition` / других executor'ах.

- **BulkOpProcessorLockedRate** (warning, skipped-lock >0.5/s 5m) — lock contention между несколькими worker-инстансами. Проверь `BULK_OP_TICK_LOCK_TTL_S` (default 90s) и число реплик backend.

### Graceful rollback

**Backend (server-side disable):**
```bash
# Добавить в env переменную + рестарт:
FEATURES_BULK_OPS=false
docker compose restart backend
```
Роут `/api/bulk-operations/*` возвращает 404 после рестарта. Активные операции в БД не отменяются — processor продолжит их обрабатывать (или recovery cron пропустит при `BULK_OP_PROCESSOR_ENABLED=false`).

**Frontend (UI-side disable):**
```bash
# Добавить в .env.production + rebuild:
VITE_FEATURES_BULK_OPS=false
npm run build
# redeploy bundle
```
Wizard-кнопка скрыта; sidebar-link скрыт; прямой доступ к `/operations` работает (для юзеров с активными операциями).

### Settings runtime

Super Admin изменяет runtime-лимиты через `/admin/system` → «Массовые операции»:
- `maxConcurrentPerUser` (1..20; default 3).
- `maxItems` (100..10000; default 10000).

Изменения вступают в силу за ≤60 секунд (in-memory + Redis cache TTL).

### Retention

- `bulk_operation_items` — удаляются через 30 дней (cron в processor'е).
- `bulk_operations` — удаляются через 90 дней в терминальном статусе.

Настроить: `BULK_OP_ITEMS_RETENTION_DAYS` / `BULK_OP_RETENTION_DAYS` env vars.

### Метрики

GET `/api/bulk-operations/metrics` (требует ADMIN/SUPER_ADMIN JWT; Prometheus text format).

Grafana dashboard: `deploy/grafana/bulk-operations.dashboard.json` — 5 panels (active ops, finalized rate, duration histogram, items rate, tick rate).
