#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: deploy/scripts/import-ttmp.sh <staging|production>"
  exit 1
fi

ENVIRONMENT="$1"

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

docker compose --env-file "$COMPOSE_ENV_FILE" -f "$COMPOSE_FILE" run --rm backend npm run db:seed:ttmp

echo "TTMP import completed for $ENVIRONMENT."
