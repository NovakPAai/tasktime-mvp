# Operations Runbook

> Source: migrated from `docs/OPERATIONS_RUNBOOK.md`
> Last updated: 2026-03-25

---

## Daily checks

- Confirm latest staging deploy used the expected image tag
- Check `docker compose ps` for `web`, `backend`, `postgres`, `redis` all Up
- Verify `GET /api/health` returns 200
- Verify `GET /api/ready` returns 200 (checks DB + Redis)

---

## Health endpoints

| Endpoint | Purpose | Expected |
|----------|---------|---------|
| `GET /api/health` | Liveness | `{ "status": "ok" }` |
| `GET /api/ready` | Readiness (DB + Redis) | `{ "status": "ok", "db": "ok", "redis": "ok" }` |
| `GET /healthz` | Web container health | 200 |

`/api/ready` returns 503 when PostgreSQL unreachable or Redis configured but unavailable.

---

## Standard deploy

```bash
./deploy/scripts/deploy.sh staging <image-tag>
./deploy/scripts/deploy.sh production <image-tag>
```

Post-deploy smoke checks:
1. `curl -fsS http://127.0.0.1:<port>/healthz`
2. `curl -fsS http://127.0.0.1:<port>/api/ready`
3. Login via UI with admin account

---

## Rollback

```bash
./deploy/scripts/rollback.sh production <previous-image-tag>
```

Rollback is image-based only. Does NOT revert DB migrations.

For DB rollback:
1. Use backup from `deploy/backups/`
2. Run `deploy/scripts/restore-postgres.sh`
3. Apply a forward-fix migration

---

## Checking logs

```bash
# Application logs
docker compose logs backend --tail=100 -f

# Nginx logs
docker compose logs web --tail=100

# DB logs
docker compose logs postgres --tail=50
```

---

## Container restart

```bash
docker compose restart backend   # backend only
docker compose restart          # all containers
docker compose up -d            # recreate if config changed
```

---

## Database operations

```bash
# Connect to DB
docker compose exec postgres psql -U tasktime tasktime_db

# Create manual backup
docker compose exec postgres pg_dump -U tasktime tasktime_db > backup_$(date +%Y%m%d).sql

# Check DB size
docker compose exec postgres psql -U tasktime -c "SELECT pg_size_pretty(pg_database_size('tasktime_db'));"
```

---

## Redis operations

```bash
# Connect to Redis
docker compose exec redis redis-cli

# Check memory
docker compose exec redis redis-cli info memory | grep used_memory_human
```

---

## Alert thresholds

| Metric | Warning | Critical |
|--------|---------|---------|
| API response time (p95) | > 200ms | > 500ms |
| DB latency | > 50ms | > 200ms |
| RAM usage | > 70% | > 90% |
| Errors per hour | > 10 | > 50 |
| Disk usage | > 70% | > 85% |

---

## Prod-to-dev sync

```bash
# Step 1: dry-run (required first)
./deploy/scripts/sync-prod-to-dev.sh deploy/env/backend.staging.env

# Step 2: confirm (only if dry-run reviewed and approved)
./deploy/scripts/sync-prod-to-dev.sh deploy/env/backend.staging.env --confirm-import
```

**Never run sync to production target.** The script rejects `backend.production.env` as target.

---

## Super-admin operations

```bash
# Promote user to super-admin
cd backend && npm run user:promote-super-admin -- --email admin@tasktime.ru

# Rotate user password
cd backend && npm run user:rotate-password -- --email user@tasktime.ru
```
