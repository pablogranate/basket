#!/usr/bin/env bash
# Nightly backup of the self-hosted Postgres DBs. Runs on the PROD server as
# root via cron. Dumps basket_portal AND basket_auth (auth has no backups today)
# → gzip → /var/backups/basket/, then prunes dumps older than the retention.
#
#   0 4 * * *  /opt/basket-app/scripts/db/backup.sh >> /var/log/basket-backup.log 2>&1
set -euo pipefail

BACKUP_DIR="${BASKET_BACKUP_DIR:-/var/backups/basket}"
RETENTION_DAYS="${BASKET_BACKUP_RETENTION_DAYS:-14}"
STAMP="$(date +%Y%m%d-%H%M%S)"

mkdir -p "$BACKUP_DIR"

dump() {
  local container="$1" db="$2" user="$3"
  local out="$BACKUP_DIR/${db}-${STAMP}.sql.gz"
  echo "[backup] ${db} → ${out}"
  # Socket connection inside the container is trusted (no password needed).
  docker exec "$container" pg_dump -U "$user" --no-owner --no-privileges "$db" | gzip > "$out"
}

dump basket-portal-db basket_portal "${PORTAL_DB_USER:-basket_portal}"
dump basket-auth-db   basket_auth   "${AUTH_DB_USER:-basket_auth}"

# Prune dumps older than the retention window.
find "$BACKUP_DIR" -name '*.sql.gz' -type f -mtime +"$RETENTION_DAYS" -delete
echo "[backup] done — retained ${RETENTION_DAYS}d in ${BACKUP_DIR}."
