# shellcheck shell=bash
# What the backup covers and where it keeps things. Sourced by every script in
# scripts/backup, so the nightly dump, the off-site upload and the restore-test
# always agree on the same set.
# shellcheck disable=SC2034  # read by the scripts that source this file

# Server-only settings: restic repo and password, rclone config, Ops DB URL,
# alert address. Root-only file, never in the repo (see docs/runbooks/backups.md).
BACKUP_ENV_FILE="${BASKET_BACKUP_ENV:-/etc/basket-backup/env}"
if [ -f "$BACKUP_ENV_FILE" ]; then
  set -a
  # shellcheck source=/dev/null
  . "$BACKUP_ENV_FILE"
  set +a
fi

BACKUP_DIR="${BASKET_BACKUP_DIR:-/var/backups/basket}"
RETENTION_DAYS="${BASKET_BACKUP_RETENTION_DAYS:-14}"

# One entry per database: source|db|user|sanity SQL.
#   source  docker:<container>  a Postgres container on this server, dumped
#                               through its trusted socket.
#           url:<ENV_VAR>       a remote Postgres whose connection URL is in that
#                               variable. Only its `public` schema is dumped: Ops
#                               is on Supabase, whose auth/storage schemas belong
#                               to Supabase and do not restore anywhere else.
#   sanity  runs against the restored scratch copy; its result goes to the log.
#
# Cashflow's `archivos` holds each Importación's raw .xlsx as bytea (its audit
# source), so its check also sums the stored bytes.
BACKUP_TARGETS=(
  "docker:basket-portal-db|basket_portal|${PORTAL_DB_USER:-basket_portal}|SELECT 'matches=' || count(*) FROM matches"
  "docker:basket-auth-db|basket_auth|${AUTH_DB_USER:-basket_auth}|SELECT 'auth_user=' || count(*) FROM auth_user"
  "docker:basket_facturacion|basket_facturacion|${FACTURACION_DB_USER:-basket_facturacion}|SELECT 'envios=' || count(*) FROM envios"
  "docker:basket_cashflow|basket_cashflow|${CASHFLOW_DB_USER:-basket_cashflow}|SELECT 'importaciones=' || (SELECT count(*) FROM importaciones) || ' archivos=' || count(*) || ' archivos_bytes=' || coalesce(sum(octet_length(bytes)), 0) FROM archivos"
  "docker:data-bp-postgres-1|basket_analytics|${ANALYTICS_DB_USER:-basket}|SELECT 'basket_payments=' || count(*) FROM basket_payments"
  "url:OPS_DATABASE_URL|basket_ops|-|SELECT 'venues=' || (SELECT count(*) FROM venues) || ' messages=' || count(*) FROM messages"
)

# Off-site (restic on Google Drive). Each night's snapshot holds the newest dump
# of every DB, staged under fixed names so a restore path never changes, plus
# the files and server config below.
OFFSITE_STAGE="${BASKET_OFFSITE_STAGE:-/var/backups/basket-offsite}"
OPS_STORAGE_DIR="${BASKET_OPS_STORAGE_DIR:-/var/backups/ops-storage}"
PORTAL_ENV_FILE="/opt/basket-app/.env.local"  # SMTP for the alert mail
OPS_ENV_FILE="/opt/bp-ops-hub/worker/.env"   # Supabase URL and key for the storage mirror
MATCHWATCH_DB="/var/lib/matchwatch/matchwatch.db"

OFFSITE_PATHS=(
  "$OFFSITE_STAGE"
  "$OPS_STORAGE_DIR"
  # Files users upload.
  /srv/incidencias-fotos
  /var/lib/facturacion-bp/uploads
  # Matchwatch's data; its live SQLite is excluded and staged as a safe copy.
  /var/lib/matchwatch
  # Each app's secrets and the server setup, to rebuild a lost server.
  /opt/basket-app/.env.local
  /opt/facturacion-bp/.env
  /srv/incidencias-bp/.env.local
  /opt/bp-ops-hub/web/.env.local
  /opt/bp-ops-hub/worker/.env
  /srv/data-bp/.env
  /opt/matchwatch/web/.env.local
  /opt/cashflow-bp/.env
  /etc/matchwatch
  /etc/cashflow-bp
  /etc/basket-backup
  /etc/systemd/system/matchwatch.service
  /etc/systemd/system/matchwatch-dashboard.service
  /etc/nginx
  /etc/letsencrypt
  /root/.ssh
  /root/.pm2/dump.pm2
)
OFFSITE_EXCLUDES=(
  "$MATCHWATCH_DB"
  "${MATCHWATCH_DB}-wal"
  "${MATCHWATCH_DB}-shm"
  # The repo is encrypted with it: a copy inside is useless.
  /etc/basket-backup/restic-password
)

# Snapshots kept on Drive.
OFFSITE_KEEP=(--keep-daily 14 --keep-weekly 8 --keep-monthly 12)

container_is_running() {
  [ "$(docker inspect -f '{{.State.Running}}' "$1" 2>/dev/null)" = "true" ]
}

newest_dump() {
  ls -1t "$1"/"$2"-*.sql.gz 2>/dev/null | head -n1 || true
}
