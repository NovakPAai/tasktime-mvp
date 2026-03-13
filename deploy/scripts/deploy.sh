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
set +a

HEALTH_URL="http://127.0.0.1:${WEB_HTTP_PORT:-80}/healthz"

if [ -n "$IMAGE_TAG_OVERRIDE" ]; then
  export IMAGE_TAG="$IMAGE_TAG_OVERRIDE"
fi

if ! docker compose --env-file "$COMPOSE_ENV_FILE" -f "$COMPOSE_FILE" run --rm backend npx prisma migrate status >/tmp/tasktime-migrate-status.log 2>&1; then
  cat /tmp/tasktime-migrate-status.log
  echo "Prisma migration preflight failed."
  echo "If this environment was created before tracked migrations, baseline it first:"
  echo "  npx prisma migrate resolve --applied 20260312222000_init"
  exit 1
fi

docker compose --env-file "$COMPOSE_ENV_FILE" -f "$COMPOSE_FILE" pull
docker compose --env-file "$COMPOSE_ENV_FILE" -f "$COMPOSE_FILE" run --rm backend npx prisma migrate deploy
docker compose --env-file "$COMPOSE_ENV_FILE" -f "$COMPOSE_FILE" run --rm backend npm run db:bootstrap
docker compose --env-file "$COMPOSE_ENV_FILE" -f "$COMPOSE_FILE" up -d

sleep 10

docker compose --env-file "$COMPOSE_ENV_FILE" -f "$COMPOSE_FILE" ps
curl --fail --silent --show-error "$HEALTH_URL" >/dev/null
