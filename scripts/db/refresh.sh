#!/usr/bin/env bash
# Refresh the LOCAL basket-portal-db from PROD (post-cutover dev workflow).
# Streams `ssh prod -> docker exec pg_dump` straight into the local container's
# psql. Destroys and rebuilds the local domain data (--clean --if-exists).
#
# Requires in .env.local: SERVER, SERVER_PASS (see the prod-access memory).
# Requires sshpass on the PATH and a running local basket-portal-db container.
#
#   npm run db:refresh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# Load SERVER / SERVER_PASS / PORTAL_DB_* from .env.local.
if [ -f "$ROOT_DIR/.env.local" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$ROOT_DIR/.env.local"
  set +a
fi

: "${SERVER:?set SERVER in .env.local}"
: "${SERVER_PASS:?set SERVER_PASS in .env.local}"

PORTAL_DB_USER="${PORTAL_DB_USER:-basket_portal}"
LOCAL_CONTAINER="${PORTAL_DB_CONTAINER:-basket-portal-db}"

command -v sshpass >/dev/null 2>&1 || { echo "[refresh] sshpass not found on PATH"; exit 1; }
docker exec "$LOCAL_CONTAINER" pg_isready -U "$PORTAL_DB_USER" >/dev/null 2>&1 \
  || { echo "[refresh] local container '$LOCAL_CONTAINER' not ready — start it first"; exit 1; }

echo "[refresh] dumping prod basket_portal → local ${LOCAL_CONTAINER} (this wipes local data)…"
SSHPASS="$SERVER_PASS" sshpass -e ssh -o StrictHostKeyChecking=accept-new "$SERVER" \
  "docker exec basket-portal-db pg_dump -U ${PORTAL_DB_USER} --clean --if-exists --no-owner --no-privileges basket_portal" \
  | docker exec -i "$LOCAL_CONTAINER" psql -v ON_ERROR_STOP=1 -U "$PORTAL_DB_USER" -d basket_portal >/dev/null

echo "[refresh] done."
