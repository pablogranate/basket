#!/usr/bin/env bash
# The backup's only cron entry. Every night: dump the DBs, mirror Ops' storage,
# send it all to Drive. On Sundays (or BASKET_BACKUP_WEEKLY=1) it also prunes
# old snapshots, verifies Drive, and restore-tests every DB from the copy it
# pulls back from Drive, which proves the off-site backup end to end.
#
# A failing step does not stop the others. Any failure mails the run's log to
# BACKUP_ALERT_TO; a clean Sunday mails a short "all OK", so a silent week means
# the backup stopped running.
#
#   0 4 * * *  /opt/basket-app/scripts/backup/nightly.sh >> /var/log/basket-backup.log 2>&1
set -uo pipefail

SCRIPTS="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/backup/config.sh
source "$SCRIPTS/config.sh"

RUN_LOG="$(mktemp)"
DRIVE_COPY=""
cleanup() {
  rm -f "$RUN_LOG"
  [ -n "$DRIVE_COPY" ] && rm -rf "$DRIVE_COPY"
}
trap cleanup EXIT

failed=()
step() {
  local name="$1"
  shift
  echo "== ${name} ($(date '+%F %T'))" >> "$RUN_LOG"
  if ! "$@" >> "$RUN_LOG" 2>&1; then
    echo "[nightly] FAILED: ${name}" >> "$RUN_LOG"
    failed+=("$name")
  fi
}

restore_test_from_drive() {
  DRIVE_COPY="$(mktemp -d)"
  restic restore latest --target "$DRIVE_COPY" --include "$OFFSITE_STAGE/dbs" \
    && BASKET_BACKUP_DIR="$DRIVE_COPY$OFFSITE_STAGE/dbs" "$SCRIPTS/restore-test.sh"
}

step "dump databases" "$SCRIPTS/dump-databases.sh"
step "mirror Ops storage" node --env-file="$OPS_ENV_FILE" "$SCRIPTS/mirror-ops-storage.mjs" "$OPS_STORAGE_DIR"
step "send to Drive" "$SCRIPTS/offsite.sh" nightly

weekly=""
if [ "$(date +%u)" = 7 ] || [ "${BASKET_BACKUP_WEEKLY:-}" = 1 ]; then
  weekly=1
  step "prune and verify Drive" "$SCRIPTS/offsite.sh" weekly
  step "restore-test from Drive" restore_test_from_drive
fi

cat "$RUN_LOG"

subject=""
if [ "${#failed[@]}" -gt 0 ]; then
  subject="Backup FALLÓ en $(hostname): ${failed[*]}"
elif [ -n "$weekly" ] && grep -q SKIPPED "$RUN_LOG"; then
  subject="Backup semanal OK en $(hostname), con omisiones (ver SKIPPED)"
elif [ -n "$weekly" ]; then
  subject="Backup semanal OK en $(hostname)"
fi
if [ -n "$subject" ]; then
  node --env-file="$PORTAL_ENV_FILE" "$SCRIPTS/notify.mjs" "$subject" < "$RUN_LOG" \
    || echo "[nightly] could not mail the report"
fi

if [ "${#failed[@]}" -gt 0 ]; then
  echo "[nightly] done with FAILURES (${failed[*]})."
  exit 1
fi
echo "[nightly] done."
