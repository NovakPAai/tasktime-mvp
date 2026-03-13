#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: deploy/scripts/backup-postgres.sh <staging|production>"
  exit 1
fi

ENVIRONMENT="$1"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="deploy/backups/$ENVIRONMENT"

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

mkdir -p "$BACKUP_DIR"

docker compose --env-file "$COMPOSE_ENV_FILE" -f "$COMPOSE_FILE" exec -T postgres \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" >"$BACKUP_DIR/postgres-$TIMESTAMP.sql"
