#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 1 ] || [ "$#" -gt 2 ]; then
  echo "Usage: deploy/scripts/deploy.sh <staging|production> [image-tag]"
  exit 1
fi

ENVIRONMENT="$1"
IMAGE_TAG_OVERRIDE="${2:-}"

case "$ENVIRONMENT" in
  staging)
    COMPOSE_FILE="deploy/docker-compose.staging.yml"
    COMPOSE_ENV_FILE="deploy/env/.env.staging"
    BACKEND_ENV_FILE="deploy/env/backend.staging.env"
    ;;
  production)
    COMPOSE_FILE="deploy/docker-compose.production.yml"
    COMPOSE_ENV_FILE="deploy/env/.env.production"
    BACKEND_ENV_FILE="deploy/env/backend.production.env"
    ;;
  *)
    echo "Unsupported environment: $ENVIRONMENT"
    exit 1
    ;;
esac

if [ ! -f "$COMPOSE_ENV_FILE" ]; then
  echo "Missing compose env file: $COMPOSE_ENV_FILE"
  exit 1
fi

if [ ! -f "$BACKEND_ENV_FILE" ]; then
  echo "Missing backend env file: $BACKEND_ENV_FILE"
  exit 1
fi

set -a
. "$COMPOSE_ENV_FILE"
. "$BACKEND_ENV_FILE"
set +a

HEALTH_URL="http://127.0.0.1:${WEB_HTTP_PORT:-80}/healthz"

if [ -n "$IMAGE_TAG_OVERRIDE" ]; then
  export IMAGE_TAG="$IMAGE_TAG_OVERRIDE"
fi

# Pull first so we fail fast if the image tag doesn't exist; preflight (migrate status) runs after pull.
PULL_RETRIES=3
for pull_attempt in $(seq 1 "$PULL_RETRIES"); do
  if docker compose --env-file "$COMPOSE_ENV_FILE" -f "$COMPOSE_FILE" pull; then
    break
  fi
  if [ "$pull_attempt" -eq "$PULL_RETRIES" ]; then
    echo "docker compose pull failed after $PULL_RETRIES attempts"
    exit 1
  fi
  echo "  pull attempt $pull_attempt/$PULL_RETRIES failed, retrying in 10s..."
  sleep 10
done

# Auto-backup before migrations (skip on first deploy when postgres has no data yet)
if docker compose --env-file "$COMPOSE_ENV_FILE" -f "$COMPOSE_FILE" ps postgres --status running -q 2>/dev/null | grep -q .; then
  echo "Creating pre-deploy backup..."
  BACKUP_DIR="deploy/backups/$ENVIRONMENT"
  mkdir -p "$BACKUP_DIR"
  TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
  docker compose --env-file "$COMPOSE_ENV_FILE" -f "$COMPOSE_FILE" exec -T postgres \
    pg_dump -U "${POSTGRES_USER:-tasktime}" -d "${POSTGRES_DB:-tasktime}" \
    > "$BACKUP_DIR/pre-deploy-$TIMESTAMP.sql" 2>/dev/null || echo "Warning: backup failed (first deploy?), continuing..."
else
  echo "Postgres not running yet, skipping pre-deploy backup"
fi

docker compose --env-file "$COMPOSE_ENV_FILE" -f "$COMPOSE_FILE" run --rm backend npx prisma migrate deploy
if [ "${BOOTSTRAP_ENABLED:-}" = "true" ]; then
  docker compose --env-file "$COMPOSE_ENV_FILE" -f "$COMPOSE_FILE" run --rm backend npm run db:bootstrap
else
  echo "Skipping bootstrap: BOOTSTRAP_ENABLED is not true in $BACKEND_ENV_FILE"
fi
docker compose --env-file "$COMPOSE_ENV_FILE" -f "$COMPOSE_FILE" up -d

MAX_RETRIES=12
RETRY_INTERVAL=5
echo "Waiting for health check at $HEALTH_URL ..."
for i in $(seq 1 "$MAX_RETRIES"); do
  if curl --fail --silent --show-error "$HEALTH_URL" >/dev/null 2>&1; then
    echo "Health check passed (attempt $i/$MAX_RETRIES)"
    break
  fi
  if [ "$i" -eq "$MAX_RETRIES" ]; then
    echo "Health check failed after $MAX_RETRIES attempts"
    docker compose --env-file "$COMPOSE_ENV_FILE" -f "$COMPOSE_FILE" ps
    docker compose --env-file "$COMPOSE_ENV_FILE" -f "$COMPOSE_FILE" logs --tail=50 backend
    exit 1
  fi
  echo "  attempt $i/$MAX_RETRIES failed, retrying in ${RETRY_INTERVAL}s..."
  sleep "$RETRY_INTERVAL"
done

docker compose --env-file "$COMPOSE_ENV_FILE" -f "$COMPOSE_FILE" ps
curl --fail --silent --show-error "$HEALTH_URL" >/dev/null

echo "Deploy completed for $ENVIRONMENT."
echo "Prod-to-dev sync is a separate operation and is not run by deploy.sh."
echo "If you need it, run the sync wrapper with a non-production target env file, for example:"
echo "  ./deploy/scripts/sync-prod-to-dev.sh deploy/env/backend.staging.env --confirm-import"
