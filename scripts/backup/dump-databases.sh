#!/usr/bin/env bash
# Dumps every DB in config.sh → gzip → /var/backups/basket/, then prunes each
# DB's dumps older than the retention. Run by nightly.sh as root.
#
# A missing or failing DB is logged as FAILED and skipped; the others are still
# dumped, and the run exits 1 so the failure shows. That DB's old dumps are not
# pruned, so its last good dump survives until it backs up again.
#
# Next to each local dump goes <db>-<stamp>.roles.sql: the cluster's roles,
# without passwords. pg_dump never writes roles, and a dump that names one (an
# RLS policy `TO incidencias`, say) does not restore on a fresh server without it.
#
# gzip runs with --rsyncable, so a dump that barely changed compresses to bytes
# that barely changed too, and restic only uploads the difference.
set -euo pipefail

# shellcheck source=scripts/backup/config.sh
source "$(dirname "${BASH_SOURCE[0]}")/config.sh"

STAMP="$(date +%Y%m%d-%H%M%S)"

# The dumps hold sessions and personal data: root only.
umask 077
mkdir -p "$BACKUP_DIR"

# Plain-format pg_dump is the whole DB, bytea columns included.
pg_dump_from() {
  local source="$1" db="$2" user="$3"
  case "$source" in
    docker:*)
      # Socket connection inside the container is trusted (no password needed).
      docker exec "${source#docker:}" pg_dump -U "$user" --no-owner --no-privileges "$db"
      ;;
    url:*)
      local var="${source#url:}"
      [ -n "${!var:-}" ] || { echo "[backup] ${var} is not set in ${BACKUP_ENV_FILE}" >&2; return 1; }
      # Passed by name so the URL (and its password) never shows in `ps`.
      # --schema makes pg_dump write `CREATE SCHEMA public`, which every new DB
      # already has; dropping that line lets the dump restore like the others.
      PGDUMP_URL="${!var}" timeout 30m docker run --rm -e PGDUMP_URL postgres:17 \
        sh -c 'exec pg_dump --no-owner --no-privileges --schema=public "$PGDUMP_URL"' \
        | sed '/^CREATE SCHEMA public;$/d'
      ;;
  esac
}

dump() {
  local source="$1" db="$2" user="$3"
  local out="$BACKUP_DIR/${db}-${STAMP}.sql.gz"
  local partial="${out}.partial"
  local roles="$BACKUP_DIR/${db}-${STAMP}.roles.sql"

  if [[ "$source" == docker:* ]] && ! container_is_running "${source#docker:}"; then
    echo "[backup] FAILED ${db}: container ${source#docker:} is not running — skipped"
    return 1
  fi

  echo "[backup] ${db} → ${out}"
  # Writes to .partial first so a failed dump never looks like the newest good one.
  if ! pg_dump_from "$source" "$db" "$user" | gzip --rsyncable > "$partial"; then
    rm -f "$partial"
    echo "[backup] FAILED ${db}: pg_dump from ${source} failed"
    return 1
  fi
  mv "$partial" "$out" || return 1

  # Roles are only ours to keep on our own servers; Supabase owns Ops' roles.
  if [[ "$source" == docker:* ]]; then
    if ! docker exec "${source#docker:}" pg_dumpall -U "$user" --roles-only --no-role-passwords > "${roles}.partial"; then
      rm -f "${roles}.partial"
      echo "[backup] FAILED ${db}: pg_dumpall --roles-only in ${source#docker:} failed (the dump is kept)"
      return 1
    fi
    mv "${roles}.partial" "$roles" || return 1
  fi

  find "$BACKUP_DIR" -maxdepth 1 \( -name "${db}-*.sql.gz" -o -name "${db}-*.roles.sql" \) -type f -mtime +"$RETENTION_DAYS" -delete
}

failed=()
for target in "${BACKUP_TARGETS[@]}"; do
  IFS='|' read -r source db user _ <<< "$target"
  if target_is_pending "$source"; then
    echo "[backup] SKIPPED ${db}: ${source#url:} is not set in ${BACKUP_ENV_FILE}"
    continue
  fi
  dump "$source" "$db" "$user" || failed+=("$db")
done

if [ "${#failed[@]}" -gt 0 ]; then
  echo "[backup] done with FAILURES (${failed[*]}) — retained ${RETENTION_DAYS}d in ${BACKUP_DIR}."
  exit 1
fi
echo "[backup] done — retained ${RETENTION_DAYS}d in ${BACKUP_DIR}."
