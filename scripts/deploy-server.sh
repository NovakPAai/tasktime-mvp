#!/bin/bash
# Deploy script for TaskTime MVP — runs on the server under the `tasktime` user.
# Called by GitHub Actions on every push to main, or manually: bash /home/tasktime/deploy.sh

set -e

APP_DIR="/home/tasktime/app"
LOG_FILE="/var/log/tasktime-deploy.log"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

log() {
  echo "[$TIMESTAMP] $1" | tee -a "$LOG_FILE"
}

log "=== Deploy started ==="

cd "$APP_DIR"

# Save current commit for potential rollback
OLD_COMMIT=$(git rev-parse HEAD)

# Fetch and check if there are actual changes
git fetch origin main
NEW_COMMIT=$(git rev-parse origin/main)

if [ "$OLD_COMMIT" = "$NEW_COMMIT" ]; then
  log "No new commits. Deploy skipped."
  exit 0
fi

log "Updating: $OLD_COMMIT -> $NEW_COMMIT"

# Pull latest code
git pull origin main

# Install/update dependencies (only production)
log "Running npm install..."
cd "$APP_DIR/backend"
npm install --omit=dev --no-audit --prefer-offline 2>&1 | tee -a "$LOG_FILE"

# Restart the service
log "Restarting tasktime service..."
sudo systemctl restart tasktime

# Verify the service started successfully
sleep 3
if systemctl is-active --quiet tasktime; then
  log "Service is running. Deploy completed successfully."
else
  log "ERROR: Service failed to start after deploy. Rolling back to $OLD_COMMIT..."
  git -C "$APP_DIR" reset --hard "$OLD_COMMIT"
  cd "$APP_DIR/backend"
  npm install --omit=dev --no-audit --prefer-offline 2>&1 | tee -a "$LOG_FILE"
  sudo systemctl restart tasktime
  sleep 3
  if systemctl is-active --quiet tasktime; then
    log "Rollback successful. Running on $OLD_COMMIT."
  else
    log "CRITICAL: Rollback also failed. Manual intervention required."
  fi
  exit 1
fi
