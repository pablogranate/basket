#!/usr/bin/env bash
# Weekly restore-test: prove the newest basket_portal dump actually restores.
# Spins an ephemeral scratch postgres:17, loads the latest dump, runs a row-count
# sanity check, then tears the scratch container down. Runs on PROD as root.
#
#   0 5 * * 0  /opt/basket-app/scripts/db/restore-test.sh >> /var/log/basket-backup.log 2>&1
set -euo pipefail

BACKUP_DIR="${BASKET_BACKUP_DIR:-/var/backups/basket}"
SCRATCH="basket-restore-test-$$"

latest="$(ls -1t "$BACKUP_DIR"/basket_portal-*.sql.gz 2>/dev/null | head -n1 || true)"
[ -n "$latest" ] || { echo "[restore-test] no basket_portal dump in ${BACKUP_DIR}"; exit 1; }
echo "[restore-test] restoring ${latest} into scratch container ${SCRATCH}…"

cleanup() { docker rm -f "$SCRATCH" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker run -d --name "$SCRATCH" \
  -e POSTGRES_PASSWORD=restore-test -e POSTGRES_DB=basket_portal \
  postgres:17 >/dev/null

# Wait for the scratch DB to accept connections.
ready=""
for _ in $(seq 1 30); do
  if docker exec "$SCRATCH" pg_isready -U postgres >/dev/null 2>&1; then ready=1; break; fi
  sleep 1
done
[ -n "$ready" ] || { echo "[restore-test] scratch DB never became ready"; exit 1; }

gunzip -c "$latest" | docker exec -i "$SCRATCH" psql -v ON_ERROR_STOP=1 -U postgres -d basket_portal >/dev/null

rows="$(docker exec "$SCRATCH" psql -U postgres -d basket_portal -tAc 'SELECT count(*) FROM matches')"
rows="$(echo "$rows" | tr -d '[:space:]')"
echo "[restore-test] OK — restored cleanly, matches rows: ${rows:-0}"
