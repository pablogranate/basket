#!/usr/bin/env bash
# Takes tonight's backup off the server: stages the newest dump of every DB, a
# safe copy of Matchwatch's SQLite and root's crontab, then sends them with the
# files and config in OFFSITE_PATHS to the restic repo on Google Drive. Run by
# nightly.sh as root, after dump-databases.sh.
#
# restic encrypts everything and uploads only the chunks Drive does not have
# yet, so a night costs about what changed that day.
#
#   offsite.sh           nightly snapshot
#   offsite.sh weekly    apply OFFSITE_KEEP, then verify a sample of the data on Drive
set -euo pipefail

# shellcheck source=scripts/backup/config.sh
source "$(dirname "${BASH_SOURCE[0]}")/config.sh"

: "${RESTIC_REPOSITORY:?set in ${BACKUP_ENV_FILE}}"
: "${RESTIC_PASSWORD_FILE:?set in ${BACKUP_ENV_FILE}}"

umask 077

stage() {
  rm -rf "$OFFSITE_STAGE"
  mkdir -p "$OFFSITE_STAGE/dbs" "$OFFSITE_STAGE/matchwatch" "$OFFSITE_STAGE/server"

  # Hard links: no extra disk, and a DB whose dump failed tonight still ships
  # its last good one.
  local db latest roles
  for target in "${BACKUP_TARGETS[@]}"; do
    IFS='|' read -r _ db _ _ <<< "$target"
    latest="$(newest_dump "$BACKUP_DIR" "$db")"
    if [ -z "$latest" ]; then
      echo "[offsite] no dump of ${db} to send"
      continue
    fi
    ln -f "$latest" "$OFFSITE_STAGE/dbs/${db}-latest.sql.gz"
    roles="${latest%.sql.gz}.roles.sql"
    [ -f "$roles" ] && ln -f "$roles" "$OFFSITE_STAGE/dbs/${db}-latest.roles.sql"
  done

  # The worker writes to it all day; .backup takes a consistent copy.
  sqlite3 "$MATCHWATCH_DB" ".backup '$OFFSITE_STAGE/matchwatch/matchwatch.db'"
  crontab -l > "$OFFSITE_STAGE/server/root-crontab.txt"
}

nightly() {
  stage
  local excludes=()
  for path in "${OFFSITE_EXCLUDES[@]}"; do excludes+=(--exclude "$path"); done

  echo "[offsite] restic backup → ${RESTIC_REPOSITORY}"
  restic unlock
  restic backup --tag nightly --no-scan "${excludes[@]}" "${OFFSITE_PATHS[@]}"
}

weekly() {
  restic unlock
  echo "[offsite] forget ${OFFSITE_KEEP[*]} + prune"
  restic forget --prune "${OFFSITE_KEEP[@]}"
  echo "[offsite] check (10% of the data read back)"
  restic check --read-data-subset=10%
}

case "${1:-nightly}" in
  nightly) nightly ;;
  weekly) weekly ;;
  *) echo "usage: $0 [nightly|weekly]" >&2; exit 2 ;;
esac
echo "[offsite] done."
