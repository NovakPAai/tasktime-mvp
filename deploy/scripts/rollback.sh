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

export IMAGE_TAG="$ROLLBACK_TAG"

docker compose --env-file "$COMPOSE_ENV_FILE" -f "$COMPOSE_FILE" pull
docker compose --env-file "$COMPOSE_ENV_FILE" -f "$COMPOSE_FILE" up -d
