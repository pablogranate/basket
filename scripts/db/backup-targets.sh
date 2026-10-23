# shellcheck shell=bash
# The databases the nightly backup dumps and the weekly restore-test restores.
# Sourced by backup.sh and restore-test.sh, so both always cover the same set.
#
# One entry per database: container|db|user|sanity SQL. The sanity query runs
# against the restored scratch copy and its result goes to the log. Cashflow's
# `archivos` holds each Importación's raw .xlsx as bytea (its audit source), so
# its check also sums the stored bytes.
# shellcheck disable=SC2034  # read by the scripts that source this file
BACKUP_TARGETS=(
  "basket-portal-db|basket_portal|${PORTAL_DB_USER:-basket_portal}|SELECT 'matches=' || count(*) FROM matches"
  "basket-auth-db|basket_auth|${AUTH_DB_USER:-basket_auth}|SELECT 'auth_user=' || count(*) FROM auth_user"
  "basket_facturacion|basket_facturacion|${FACTURACION_DB_USER:-basket_facturacion}|SELECT 'envios=' || count(*) FROM envios"
  "basket_cashflow|basket_cashflow|${CASHFLOW_DB_USER:-basket_cashflow}|SELECT 'importaciones=' || (SELECT count(*) FROM importaciones) || ' archivos=' || count(*) || ' archivos_bytes=' || coalesce(sum(octet_length(bytes)), 0) FROM archivos"
)

container_is_running() {
  [ "$(docker inspect -f '{{.State.Running}}' "$1" 2>/dev/null)" = "true" ]
}
