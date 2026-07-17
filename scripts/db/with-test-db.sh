#!/usr/bin/env bash
# Spin an ephemeral postgres:17, export DATABASE_URL at it, run "$@" (vitest),
# then tear the container down — always, even on failure. Used by
# `npm run test:integration`.
set -euo pipefail

CONTAINER="basket-portal-test-db"
PORT="${PORTAL_TEST_DB_PORT:-5439}"
PASSWORD="test"
DBNAME="basket_portal_test"   # name MUST contain 'basket-portal-test' (global-setup guard)

command -v docker >/dev/null 2>&1 || { echo "[test-db] docker/podman not found on PATH"; exit 1; }

cleanup() { docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "[test-db] starting ephemeral ${CONTAINER} on 127.0.0.1:${PORT}…"
docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
docker run -d --name "$CONTAINER" \
  -e POSTGRES_PASSWORD="$PASSWORD" -e POSTGRES_DB="$DBNAME" \
  -p "127.0.0.1:${PORT}:5432" postgres:17 >/dev/null

# Wait for readiness. Probe TCP (-h 127.0.0.1), NOT the unix socket: the
# postgres image runs a socket-only temp server during initdb, so a socket
# pg_isready gives a false positive and connections hit the restart (ECONNRESET).
# TCP only binds once the real server is up.
ready=""
for _ in $(seq 1 60); do
  if docker exec "$CONTAINER" pg_isready -h 127.0.0.1 -p 5432 -U postgres >/dev/null 2>&1; then ready=1; break; fi
  sleep 1
done
[ -n "$ready" ] || { echo "[test-db] container never became ready"; exit 1; }

export DATABASE_URL="postgresql://postgres:${PASSWORD}@127.0.0.1:${PORT}/${DBNAME}"
echo "[test-db] DATABASE_URL set → running: $*"
"$@"
