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
    PIPELINE_ENV_FILE="deploy/env/pipeline.staging.env"
    ;;
  production)
    COMPOSE_FILE="deploy/docker-compose.production.yml"
    COMPOSE_ENV_FILE="deploy/env/.env.production"
    BACKEND_ENV_FILE="deploy/env/backend.production.env"
    PIPELINE_ENV_FILE="deploy/env/pipeline.production.env"
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

if [ ! -f "$PIPELINE_ENV_FILE" ]; then
  echo "Missing pipeline env file: $PIPELINE_ENV_FILE"
  echo "Copy from example: cp ${PIPELINE_ENV_FILE}.example ${PIPELINE_ENV_FILE} and fill in secrets"
  exit 1
fi

# --- Level 3: flock — prevent concurrent deploys on the same server ---
LOCK_FILE="/tmp/deploy-${ENVIRONMENT}.lock"
# Remove stale lock files owned by other users (Permission denied on exec)
rm -f "$LOCK_FILE" 2>/dev/null || true
exec 200>"$LOCK_FILE"
if ! flock -n 200; then
  echo "ERROR: Another deploy to $ENVIRONMENT is already running (lock: $LOCK_FILE)"
  exit 1
fi
echo "Deploy lock acquired: $LOCK_FILE (PID $$)"

set -a
. "$COMPOSE_ENV_FILE"
. "$BACKEND_ENV_FILE"
. "$PIPELINE_ENV_FILE"
set +a

HEALTH_URL="http://127.0.0.1:${WEB_HTTP_PORT:-80}/healthz"
DEPLOY_HISTORY_FILE="deploy/history/${ENVIRONMENT}.log"

if [ -n "$IMAGE_TAG_OVERRIDE" ]; then
  export IMAGE_TAG="$IMAGE_TAG_OVERRIDE"
fi

EXPECTED_SHA="${IMAGE_TAG:-unknown}"
DEPLOY_START=$(date +%s)

# --- Deploy history: record start ---
mkdir -p "$(dirname "$DEPLOY_HISTORY_FILE")"
echo "[$(date -Iseconds)] DEPLOY_START env=$ENVIRONMENT sha=$EXPECTED_SHA pid=$$" >> "$DEPLOY_HISTORY_FILE"

# Pull first so we fail fast if the image tag doesn't exist; preflight (migrate status) runs after pull.
PULL_RETRIES=3
for pull_attempt in $(seq 1 "$PULL_RETRIES"); do
  if docker compose --env-file "$COMPOSE_ENV_FILE" -f "$COMPOSE_FILE" pull; then
    break
  fi
  if [ "$pull_attempt" -eq "$PULL_RETRIES" ]; then
    echo "docker compose pull failed after $PULL_RETRIES attempts"
    echo "[$(date -Iseconds)] DEPLOY_FAIL env=$ENVIRONMENT sha=$EXPECTED_SHA reason=pull_failed" >> "$DEPLOY_HISTORY_FILE"
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
docker compose --env-file "$COMPOSE_ENV_FILE" -f "$COMPOSE_FILE" run --rm \
  pipeline-service npx prisma migrate deploy
if [ "${BOOTSTRAP_ENABLED:-}" = "true" ]; then
  docker compose --env-file "$COMPOSE_ENV_FILE" -f "$COMPOSE_FILE" run --rm backend npm run db:bootstrap
else
  echo "Skipping bootstrap: BOOTSTRAP_ENABLED is not true in $BACKEND_ENV_FILE"
fi
docker compose --env-file "$COMPOSE_ENV_FILE" -f "$COMPOSE_FILE" up -d --force-recreate

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
    echo "[$(date -Iseconds)] DEPLOY_FAIL env=$ENVIRONMENT sha=$EXPECTED_SHA reason=health_check_failed" >> "$DEPLOY_HISTORY_FILE"
    exit 1
  fi
  echo "  attempt $i/$MAX_RETRIES failed, retrying in ${RETRY_INTERVAL}s..."
  sleep "$RETRY_INTERVAL"
done

# --- Level 4: Post-deploy SHA verification ---
HEALTH_JSON=$(curl --fail --silent "http://127.0.0.1:${WEB_HTTP_PORT:-80}/api/health" 2>/dev/null || echo '{}')
ACTUAL_SHA=$(echo "$HEALTH_JSON" | grep -o '"version":"[^"]*"' | cut -d'"' -f4 || echo "unknown")

if [ "$EXPECTED_SHA" != "unknown" ] && [ "$ACTUAL_SHA" != "unknown" ] && [ "$ACTUAL_SHA" != "$EXPECTED_SHA" ]; then
  echo "WARNING: SHA mismatch! Expected=$EXPECTED_SHA Actual=$ACTUAL_SHA"
  echo "[$(date -Iseconds)] DEPLOY_WARN env=$ENVIRONMENT expected_sha=$EXPECTED_SHA actual_sha=$ACTUAL_SHA reason=sha_mismatch" >> "$DEPLOY_HISTORY_FILE"
else
  echo "SHA verification: OK (${ACTUAL_SHA})"
fi

docker compose --env-file "$COMPOSE_ENV_FILE" -f "$COMPOSE_FILE" ps
curl --fail --silent --show-error "$HEALTH_URL" >/dev/null

DEPLOY_END=$(date +%s)
DEPLOY_DURATION=$((DEPLOY_END - DEPLOY_START))

# --- Deploy history: record success ---
echo "[$(date -Iseconds)] DEPLOY_OK env=$ENVIRONMENT sha=$EXPECTED_SHA actual_sha=$ACTUAL_SHA duration=${DEPLOY_DURATION}s" >> "$DEPLOY_HISTORY_FILE"

echo "Deploy completed for $ENVIRONMENT in ${DEPLOY_DURATION}s."
echo "Prod-to-dev sync is a separate operation and is not run by deploy.sh."
echo "If you need it, run the sync wrapper with a non-production target env file, for example:"
echo "  ./deploy/scripts/sync-prod-to-dev.sh deploy/env/backend.staging.env --confirm-import"
