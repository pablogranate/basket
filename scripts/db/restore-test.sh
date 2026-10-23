#!/usr/bin/env bash
# Weekly restore-test: prove the newest dump of every DB in backup-targets.sh
# actually restores. Spins one ephemeral scratch postgres:17, loads each DB's
# latest dump into its own database, runs that DB's sanity query, then tears
# the scratch container down. Runs on PROD as root.
#
# A DB with no dump, or whose dump fails to restore, is logged as FAILED; the
# others are still tested, and the run exits 1.
#
# Each dump's <db>-<stamp>.roles.sql is loaded first, as a real restore on a new
# server would. Roles are per cluster and the scratch server is shared, so
# "already exists" there is expected and ignored; the dump itself then restores
# with ON_ERROR_STOP.
#
#   0 5 * * 0  /opt/basket-app/scripts/db/restore-test.sh >> /var/log/basket-backup.log 2>&1
set -euo pipefail

# shellcheck source=scripts/db/backup-targets.sh
source "$(dirname "${BASH_SOURCE[0]}")/backup-targets.sh"

BACKUP_DIR="${BASKET_BACKUP_DIR:-/var/backups/basket}"
SCRATCH="basket-restore-test-$$"

cleanup() { docker rm -f "$SCRATCH" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "[restore-test] starting scratch container ${SCRATCH}…"
docker run -d --name "$SCRATCH" -e POSTGRES_PASSWORD=restore-test postgres:17 >/dev/null

# Wait for the scratch DB to accept connections. Checked over TCP: the image's
# first-boot init server listens on the socket only and restarts, so a socket
# check can pass before the real server is up.
ready=""
for _ in $(seq 1 60); do
  if docker exec "$SCRATCH" pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1; then ready=1; break; fi
  sleep 1
done
[ -n "$ready" ] || { echo "[restore-test] scratch DB never became ready"; exit 1; }

restore() {
  local db="$1" sanity="$2" latest roles result

  latest="$(ls -1t "$BACKUP_DIR"/"$db"-*.sql.gz 2>/dev/null | head -n1 || true)"
  if [ -z "$latest" ]; then
    echo "[restore-test] FAILED ${db}: no dump in ${BACKUP_DIR}"
    return 1
  fi
  echo "[restore-test] ${db}: restoring ${latest}…"

  roles="${latest%.sql.gz}.roles.sql"
  if [ -f "$roles" ]; then
    docker exec -i "$SCRATCH" psql -q -U postgres -d postgres < "$roles" >/dev/null 2>&1 || true
  else
    echo "[restore-test] ${db}: no ${roles##*/} next to the dump (older backup); restoring without roles"
  fi

  if ! docker exec "$SCRATCH" createdb -U postgres "$db" \
    || ! gunzip -c "$latest" | docker exec -i "$SCRATCH" psql -q -v ON_ERROR_STOP=1 -U postgres -d "$db" >/dev/null; then
    echo "[restore-test] FAILED ${db}: dump did not restore"
    return 1
  fi

  if ! result="$(docker exec "$SCRATCH" psql -v ON_ERROR_STOP=1 -U postgres -d "$db" -tAc "$sanity")"; then
    echo "[restore-test] FAILED ${db}: sanity query failed"
    return 1
  fi
  echo "[restore-test] OK ${db} — restored cleanly, ${result}"
}

failed=()
for target in "${BACKUP_TARGETS[@]}"; do
  IFS='|' read -r _ db _ sanity <<< "$target"
  restore "$db" "$sanity" || failed+=("$db")
done

if [ "${#failed[@]}" -gt 0 ]; then
  echo "[restore-test] done with FAILURES (${failed[*]})."
  exit 1
fi
echo "[restore-test] done — all ${#BACKUP_TARGETS[@]} DBs restored cleanly."
