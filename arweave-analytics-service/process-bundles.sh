#!/bin/bash
set -euo pipefail

APP_DIR="${APP_DIR:-/root/arweave-analytics-service}"
cd "$APP_DIR"
mkdir -p logs

LOG_FILE="${LOG_FILE:-$APP_DIR/logs/cron.log}"
LOCK_FILE="${LOCK_FILE:-$APP_DIR/logs/cron.lock}"

# Default DB location (can be overridden via environment)
export DB_PATH="${DB_PATH:-$APP_DIR/data/ArweaveAnalytics.sqlite}"

echo "[$(date -u)] Cron job starting (pid $$)" >> "$LOG_FILE"

CMD=(/usr/bin/node ./server.js --cron)

set +e
if command -v flock >/dev/null 2>&1; then
	flock -n "$LOCK_FILE" "${CMD[@]}" >> "$LOG_FILE" 2>&1
	rc=$?
	if [ $rc -eq 1 ]; then
		echo "[$(date -u)] Cron job skipped (lock busy)" >> "$LOG_FILE"
		rc=0
	fi
else
	"${CMD[@]}" >> "$LOG_FILE" 2>&1
	rc=$?
fi
set -e

echo "[$(date -u)] Cron job completed (exit $rc)" >> "$LOG_FILE"
exit $rc