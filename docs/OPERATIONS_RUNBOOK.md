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
