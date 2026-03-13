#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "Usage: deploy/scripts/rollback.sh <staging|production> <image-tag>"
  exit 1
fi

ENVIRONMENT="$1"
ROLLBACK_TAG="$2"

case "$ENVIRONMENT" in
  staging)
    COMPOSE_FILE="deploy/docker-compose.staging.yml"
    COMPOSE_ENV_FILE="deploy/env/.env.staging"
    ;;
  production)
    COMPOSE_FILE="deploy/docker-compose.production.yml"
    COMPOSE_ENV_FILE="deploy/env/.env.production"
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

set -a
. "$COMPOSE_ENV_FILE"
set +a

export IMAGE_TAG="$ROLLBACK_TAG"

HEALTH_URL="http://127.0.0.1:${WEB_HTTP_PORT:-80}/healthz"

docker compose --env-file "$COMPOSE_ENV_FILE" -f "$COMPOSE_FILE" pull
docker compose --env-file "$COMPOSE_ENV_FILE" -f "$COMPOSE_FILE" up -d

MAX_RETRIES=12
RETRY_INTERVAL=5
echo "Waiting for health check at $HEALTH_URL ..."
for i in $(seq 1 "$MAX_RETRIES"); do
  if curl --fail --silent --show-error "$HEALTH_URL" >/dev/null 2>&1; then
    echo "Rollback health check passed (attempt $i/$MAX_RETRIES)"
    break
  fi
  if [ "$i" -eq "$MAX_RETRIES" ]; then
    echo "Rollback health check failed after $MAX_RETRIES attempts"
    docker compose --env-file "$COMPOSE_ENV_FILE" -f "$COMPOSE_FILE" ps
    docker compose --env-file "$COMPOSE_ENV_FILE" -f "$COMPOSE_FILE" logs --tail=50 backend
    exit 1
  fi
  echo "  attempt $i/$MAX_RETRIES failed, retrying in ${RETRY_INTERVAL}s..."
  sleep "$RETRY_INTERVAL"
done

docker compose --env-file "$COMPOSE_ENV_FILE" -f "$COMPOSE_FILE" ps
