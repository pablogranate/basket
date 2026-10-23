#!/usr/bin/env bash
# Nightly backup of the self-hosted Postgres DBs. Runs on the PROD server as
# root via cron. Dumps every DB in backup-targets.sh (basket_portal,
# basket_auth, basket_facturacion, basket_cashflow) → gzip → /var/backups/basket/,
# then prunes each DB's dumps older than the retention.
#
# A missing or failing DB is logged as FAILED and skipped; the others are still
# dumped, and the run exits 1 so the failure shows. That DB's old dumps are not
# pruned, so its last good dump survives until it backs up again.
#
#   0 4 * * *  /opt/basket-app/scripts/db/backup.sh >> /var/log/basket-backup.log 2>&1
set -euo pipefail

# shellcheck source=scripts/db/backup-targets.sh
source "$(dirname "${BASH_SOURCE[0]}")/backup-targets.sh"

BACKUP_DIR="${BASKET_BACKUP_DIR:-/var/backups/basket}"
RETENTION_DAYS="${BASKET_BACKUP_RETENTION_DAYS:-14}"
STAMP="$(date +%Y%m%d-%H%M%S)"

mkdir -p "$BACKUP_DIR"

dump() {
  local container="$1" db="$2" user="$3"
  local out="$BACKUP_DIR/${db}-${STAMP}.sql.gz"
  local partial="${out}.partial"

  if ! container_is_running "$container"; then
    echo "[backup] FAILED ${db}: container ${container} is not running — skipped"
    return 1
  fi

  echo "[backup] ${db} → ${out}"
  # Socket connection inside the container is trusted (no password needed).
  # Plain-format pg_dump is the whole DB, bytea columns included. It writes to
  # .partial first so a failed dump never looks like the newest good one.
  if ! docker exec "$container" pg_dump -U "$user" --no-owner --no-privileges "$db" | gzip > "$partial"; then
    rm -f "$partial"
    echo "[backup] FAILED ${db}: pg_dump in ${container} failed"
    return 1
  fi
  mv "$partial" "$out" || return 1

  find "$BACKUP_DIR" -name "${db}-*.sql.gz" -type f -mtime +"$RETENTION_DAYS" -delete
}

failed=()
for target in "${BACKUP_TARGETS[@]}"; do
  IFS='|' read -r container db user _ <<< "$target"
  dump "$container" "$db" "$user" || failed+=("$db")
done

if [ "${#failed[@]}" -gt 0 ]; then
  echo "[backup] done with FAILURES (${failed[*]}) — retained ${RETENTION_DAYS}d in ${BACKUP_DIR}."
  exit 1
fi
echo "[backup] done — retained ${RETENTION_DAYS}d in ${BACKUP_DIR}."
