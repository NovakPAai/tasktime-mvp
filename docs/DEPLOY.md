# TaskTime Deployment Guide

## Production URL (боевой стенд)

Текущий известный адрес продакшена (по данным деплоя и транскриптов):

- **http://6805797-ei959240:8080** — хост `6805797-ei959240`, порт 8080 (WEB_HTTP_PORT на сервере).

Если у хостера другой формат доступа (домен, другой порт) — обнови этот раздел. Секрет `PRODUCTION_DEPLOY_HOST` в GitHub Environment `production` задаёт тот же хост, на который деплоится приложение.

## Overview

TaskTime deploys to a single Linux/VPS host with Docker Compose:

- `web` container: Nginx serves the frontend build and proxies `/api` to backend
- `backend` container: Node.js API
- `postgres` container: PostgreSQL 16
- `redis` container: Redis 7

GitHub Actions owns the delivery flow:

- `CI` validates lint, typecheck, build, tests and Docker builds
- `Build and Publish Images` pushes versioned images to GHCR only after successful `CI` on `main` or via manual dispatch
- `Deploy Staging` promotes `main` automatically to staging
- `Deploy Production` promotes an explicit image tag after manual approval

## Repository Assets

- Compose files: `deploy/docker-compose.staging.yml`, `deploy/docker-compose.production.yml`
- Backend image: `backend/Dockerfile`
- Web image: `frontend/Dockerfile`
- Nginx config: `deploy/nginx/nginx.conf`
- Deploy scripts: `deploy/scripts/*.sh`
- Example environment files: `deploy/env/*.example`

## Server Bootstrap

Install these prerequisites on the target VPS:

```bash
sudo apt-get update
sudo apt-get install -y docker.io docker-compose-plugin openssh-client rsync curl
sudo systemctl enable --now docker
```

Create a dedicated deploy directory, for example:

```bash
sudo mkdir -p /opt/tasktime
sudo chown -R "$USER":"$USER" /opt/tasktime
```

Copy the `deploy/` directory to the server once, or let GitHub Actions sync it during bootstrap. Bootstrap only prepares the host and environment files. It does not deploy an image and it does not run any data sync.

## Environment Files

Create real environment files on the server from examples:

```bash
cp deploy/env/.env.staging.example deploy/env/.env.staging
cp deploy/env/backend.staging.env.example deploy/env/backend.staging.env
cp deploy/env/.env.production.example deploy/env/.env.production
cp deploy/env/backend.production.env.example deploy/env/backend.production.env
```

Required values to replace before the first deploy:

- `POSTGRES_PASSWORD`
- `JWT_SECRET`
- `JWT_REFRESH_SECRET`
- `CORS_ORIGIN`
- `BACKEND_IMAGE`
- `WEB_IMAGE`

The default image naming expects GHCR:

- `ghcr.io/<org-or-user>/tasktime-backend`
- `ghcr.io/<org-or-user>/tasktime-web`

## GitHub Secrets

### Staging

- `STAGING_DEPLOY_HOST`
- `STAGING_DEPLOY_USER`
- `STAGING_DEPLOY_SSH_KEY`
- `STAGING_DEPLOY_PATH`

### Production

- `PRODUCTION_DEPLOY_HOST`
- `PRODUCTION_DEPLOY_USER`
- `PRODUCTION_DEPLOY_SSH_KEY`
- `PRODUCTION_DEPLOY_PATH`

### GitHub Environments

Configure two environments in GitHub:

- `staging`
- `production`

Protect `production` with required reviewers. This is the manual approval gate before production rollout.

## Image Publishing

Images are built from the repo root:

```bash
docker build -f backend/Dockerfile .
docker build -f frontend/Dockerfile .
```

The publish workflow pushes:

- SHA tag on every successful build
- `main` tag on branch `main`
- `release-*` tag on release tags

## Deploy

### Staging

```bash
./deploy/scripts/deploy.sh staging <image-tag>
```

### Production

```bash
./deploy/scripts/deploy.sh production <image-tag>
```

What the script does:

1. Loads the environment file for the target environment
2. Pulls the requested images
3. Applies `prisma migrate deploy`
4. Runs `npm run db:bootstrap`
5. Recreates containers with `docker compose up -d`
6. Verifies the web container health endpoint

`deploy.sh` does not run any prod-to-dev sync. Sync remains a separate operation so deploy and data import can be approved and executed independently.

## Prod-to-Dev Sync

Use the sync wrapper only when you intentionally want to refresh a dev or staging database from a production source:

```bash
./deploy/scripts/sync-prod-to-dev.sh deploy/env/backend.staging.env
```

The sync wrapper always:

1. Loads the target backend env file
2. Rejects obvious production targets such as `backend.production.env`
3. Validates `SOURCE_DATABASE_URL` and `DATABASE_URL`
4. Rejects identical or same-host source/target database pairs
5. Runs `npm run db:sync:prod-to-dev -- --dry-run`
6. Stores an approval marker for that reviewed env file

The real import must happen in a second invocation after review. Passing `--confirm-import` without a prior reviewed dry-run fails closed.

First run the dry-run and review the plan:

```bash
./deploy/scripts/sync-prod-to-dev.sh deploy/env/backend.staging.env
```

Then, if the reviewed output is acceptable, run the import in a separate invocation:

```bash
./deploy/scripts/sync-prod-to-dev.sh deploy/env/backend.staging.env --confirm-import
```

If the env file changes between the dry-run and confirmation, rerun the dry-run before importing.

This is a separate operation from deploy. Do not assume a successful deploy implies a sync, and do not assume a sync is safe to run as part of every release.

## Baseline Existing Databases

If an existing staging or production database was originally created with `prisma db push` or manual SQL, the first migration-based deploy needs a one-time baseline step after schema review.

Example:

```bash
npx prisma migrate resolve --applied 20260312222000_init
```

Do this only when:

- the live schema already matches `backend/src/prisma/migrations/20260312222000_init/migration.sql`
- you want Prisma to start tracking that schema without replaying the init migration

For brand new databases, do not run `migrate resolve`; use the normal deploy flow.

## Rollback

Application rollback is image-based:

```bash
./deploy/scripts/rollback.sh production <previous-image-tag>
```

Rollback expectations:

1. `rollback.sh` only rolls application containers back to a previous image tag
2. It does not revert Prisma migrations
3. It does not undo any prod-to-dev sync that was run separately

Database rollback is not automatic. Use:

1. recent SQL backup from `deploy/backups/`
2. `deploy/scripts/restore-postgres.sh`
3. a forward fix migration after service restoration

## HTTPS

The shipped Nginx container terminates HTTP inside the application stack and proxies `/api`.

For production HTTPS you still need one of these options on the VPS edge:

- host-level Nginx + Certbot
- cloud/LB TLS termination in front of the VPS

Minimum requirement:

- only expose the application publicly over HTTPS
- redirect HTTP to HTTPS
- renew certificates automatically

## First Release Checklist

1. Prepare server packages and Docker
2. Create `deploy/env/*.env` files from the examples
3. Log in to GHCR on the server if needed
4. Configure GitHub environment secrets
5. Protect the `production` environment
6. Run `Build and Publish Images`
7. Verify staging autodeploy
8. Run manual production deploy with a known-good image tag
9. Run prod-to-dev sync only as a separate, explicitly approved operation when needed
