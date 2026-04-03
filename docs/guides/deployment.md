# Deployment Guide

> Full deployment docs: [../../DEPLOY.md](../../DEPLOY.md)
> Operations runbook: [operations.md](./operations.md)
> Last updated: 2026-03-25

---

## Architecture

```
GitHub Actions → GHCR (Docker images) → VPS (Docker Compose)
```

4 containers on VPS:
- `web` — Nginx: serves frontend build, proxies `/api` to backend
- `backend` — Node.js API
- `postgres` — PostgreSQL 16
- `redis` — Redis 7

---

## CI/CD Pipelines

| Workflow | File | Trigger |
|----------|------|---------|
| CI | `.github/workflows/ci.yml` | push / PR to any branch |
| Build & Publish | `build-and-publish.yml` | CI green on `main` or manual |
| Deploy Staging | `deploy-staging.yml` | Auto on merge to `main` |
| Deploy Production | `deploy-production.yml` | Manual (needs approval) |
| Update Docs | `update-docs.yml` | Push to `main` |

---

## Deploy staging

Happens automatically after merge to `main` (if CI is green).

Requires GitHub secrets in `staging` environment:
- `STAGING_DEPLOY_SSH_KEY`
- `STAGING_DEPLOY_HOST`
- `STAGING_DEPLOY_USER`
- `STAGING_DEPLOY_PATH`

---

## Deploy production

```bash
# Via GitHub Actions UI:
# Actions → Deploy Production → Run workflow → enter image tag
```

Requires manual approval + `production` environment secrets.

Script runs:
1. Pull new images
2. Backup PostgreSQL
3. `prisma migrate deploy`
4. `docker compose up -d`
5. Health check (retry 12×5s)

---

## Rollback

```bash
./deploy/scripts/rollback.sh production <previous-image-tag>
```

Note: rollback is image-only — does NOT revert DB migrations.

---

## First deployment checklist

1. Bootstrap VPS: Docker, openssh, rsync
2. Create env files from `deploy/env/*.example`
3. Set GitHub secrets for `staging` and `production` environments
4. Protect `production` environment (require reviewer)
5. Trigger `Build and Publish Images`
6. Verify staging auto-deploy
7. Run manual production deploy

Full details: [../../DEPLOY.md](../../DEPLOY.md)

---

## Environment files

```bash
cp deploy/env/backend.staging.env.example deploy/env/backend.staging.env
cp deploy/env/backend.production.env.example deploy/env/backend.production.env
```

Required to fill in: `POSTGRES_PASSWORD`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `CORS_ORIGIN`, `BACKEND_IMAGE`, `WEB_IMAGE`.

---

## HTTPS

Nginx inside containers handles HTTP. For production HTTPS you need one of:
- Host-level Nginx + Certbot on VPS edge
- Cloud load balancer TLS termination

Minimum: public access only via HTTPS, HTTP → HTTPS redirect, auto-renew certs.
