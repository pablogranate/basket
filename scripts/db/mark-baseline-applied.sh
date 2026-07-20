#!/usr/bin/env bash
# Mark the drizzle baseline migration(s) as already-applied WITHOUT running them.
#
# Used at CUTOVER, after restoring the Supabase dump into basket-portal-db: the
# restored schema already IS the baseline, so the baseline migration's plain
# `CREATE TABLE`s would fail against existing tables. We insert the exact rows
# `drizzle-kit migrate` itself writes — hash = sha256(<tag>.sql), created_at =
# journal `when` — so migrate treats each baseline entry as done (skips it) yet
# still applies any FUTURE migration normally.
#
# Runs against the container over the trusted local socket (like backup.sh), so
# no host psql client and no password are needed. Reads the migration files from
# the repo working tree.
#
#   scripts/db/mark-baseline-applied.sh
#
# Env overrides: PORTAL_DB_CONTAINER (basket-portal-db), PORTAL_DB_USER
# (basket_portal), PORTAL_DB_NAME (basket_portal).
#
# ASSUMPTION: the restored dump reflects every migration in the journal (true
# when the baseline was generated from the same schema the dump came from). If a
# migration is a change NOT present in the dump, do NOT mark it — let migrate run it.
set -euo pipefail

CONTAINER="${PORTAL_DB_CONTAINER:-basket-portal-db}"
DB_USER="${PORTAL_DB_USER:-basket_portal}"
DB_NAME="${PORTAL_DB_NAME:-basket_portal}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MIG="$ROOT/drizzle/portal"
JOURNAL="$MIG/meta/_journal.json"
[ -f "$JOURNAL" ] || { echo "[mark-baseline] no journal at $JOURNAL"; exit 1; }

psql() { docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -U "$DB_USER" -d "$DB_NAME" "$@"; }

# drizzle-kit creates these itself on migrate, but the standalone insert needs them first.
psql -q >/dev/null <<'SQL'
CREATE SCHEMA IF NOT EXISTS drizzle;
CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
  id SERIAL PRIMARY KEY,
  hash text NOT NULL,
  created_at bigint
);
SQL

marked=0
while read -r tag when; do
  [ -n "$tag" ] || continue
  sql_file="$MIG/${tag}.sql"
  [ -f "$sql_file" ] || { echo "[mark-baseline] missing $sql_file"; exit 1; }
  hash="$(sha256sum "$sql_file" | awk '{print $1}')"
  psql -tAq -c "INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
    SELECT '${hash}', ${when}
    WHERE NOT EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash='${hash}');" >/dev/null
  echo "[mark-baseline] ${tag} → ${hash} (when ${when})"
  marked=$((marked + 1))
done < <(node -e 'const j=require(process.argv[1]); for (const e of j.entries) console.log(e.tag+" "+e.when);' "$JOURNAL")

echo "[mark-baseline] done — ${marked} entr$([ "$marked" = 1 ] && echo y || echo ies) present. drizzle-kit migrate will now skip them."
