---
phase: 01-shared-identity-database
plan: 02
subsystem: auth
tags: [better-auth, drizzle, postgres-js, postgres, docker, server-only]

# Dependency graph
requires:
  - phase: 01-shared-identity-database (Plan 01)
    provides: auth_* Drizzle schema, AUTH_DATABASE_URL env wiring (appEnv.authDatabaseUrl + assertAuthDatabaseUrl), generated drizzle/auth/0000_*.sql migration, docker-compose basket_auth service
provides:
  - Server-only postgres-js → Drizzle auth client (authConn, authDb) reading only AUTH_DATABASE_URL
  - Running basket-auth-db container (postgres:17) with the four auth_* tables (incl. D-07 admin columns) applied from the committed SQL
  - Proven live connection (SELECT 1) through AUTH_DATABASE_URL, closing ROADMAP criterion 2 and the apply-and-verify half of criterion 1
affects: [03-portal-better-auth-wiring, 04-user-migration, 06-cross-subdomain-sso]

# Tech tracking
tech-stack:
  added: [postgres-js (postgres), drizzle-orm/postgres-js]
  patterns:
    - "Server-only DB client module (import \"server-only\" line 1) mirroring src/lib/supabase/admin.ts precedent"
    - "globalThis-cached postgres-js connection to avoid dev hot-reload connection exhaustion"
    - "Two-independent-connections isolation: auth client never imports any Supabase client or env var (D-04)"
    - "Committed-SQL-applied-manually via psql -f (NOT drizzle-kit push), per D-09/D-10"

key-files:
  created:
    - src/lib/db/auth-client.ts
  modified: []

key-decisions:
  - "Migration applied via psql -f drizzle/auth/0000_careful_iron_lad.sql (committed-SQL model, D-09/D-10) — NOT drizzle-kit push"
  - "Auth DB runs as a dedicated postgres:17 container basket-auth-db on host port 5433, isolated from Supabase domain data (D-04)"
  - "Task 2 (container provision + secret-setting + SQL apply) performed by the orchestrator on the operator's explicit authorization, as it is a blocking human-action checkpoint Claude cannot perform (local Docker daemon, operator secret, psql)"

patterns-established:
  - "Pattern: server-only auth DB client — guard (assertAuthDatabaseUrl) before building the postgres-js connection, globalThis-cached, prepare: false"
  - "Pattern: secrets (AUTH_DB_PASSWORD, AUTH_DATABASE_URL) live only in gitignored .env.local, never committed"

requirements-completed: [AUTH-01]

# Metrics
duration: ~30min (incl. operator checkpoint turnaround)
completed: 2026-06-03
---

# Phase 1 Plan 02: Auth DB Client + Container Provision/Verify Summary

**Server-only postgres-js → Drizzle auth client (authConn/authDb) reading a dedicated AUTH_DATABASE_URL, plus a live basket_auth Postgres container with the four auth_* tables (D-07 admin columns) applied from committed SQL and a proven SELECT 1 connection.**

## Performance

- **Duration:** ~30 min (including blocking human-action checkpoint turnaround)
- **Started:** 2026-06-03T13:58:00Z (approx, Task 1 commit)
- **Completed:** 2026-06-03
- **Tasks:** 2
- **Files modified:** 1 (src/lib/db/auth-client.ts)

## Accomplishments
- Added `src/lib/db/auth-client.ts` — a server-only postgres-js → Drizzle client exporting `authConn` and `authDb`, reading only `AUTH_DATABASE_URL`, sharing nothing with Supabase (closes ROADMAP criterion 2).
- Provisioned the `basket-auth-db` container (postgres:17) on host port 5433 and applied the committed `drizzle/auth/0000_careful_iron_lad.sql` via `psql -f` (4× CREATE TABLE + 2× ALTER TABLE FK cascades), producing exactly the four `auth_*` tables.
- Verified the D-07 admin-plugin columns: `auth_user` has `role`, `banned`, `ban_reason`, `ban_expires`; `auth_session` has `impersonated_by` (closes the apply-and-verify half of ROADMAP criterion 1).
- Confirmed a live connection: `SELECT 1` through `AUTH_DATABASE_URL` returns a row.

## Task Commits

Each task was committed atomically:

1. **Task 1: Create the server-only postgres-js → Drizzle auth client** - `2000196` (feat)
2. **Task 2: Provision basket_auth container, apply SQL, verify tables + connection** - no code commit (blocking human-action checkpoint; operator-managed `.env.local` is gitignored and the committed SQL was applied, not modified). Interim state recorded in `9de35a0`.

**Plan metadata:** see final docs commit (this SUMMARY + STATE + ROADMAP).

## Files Created/Modified
- `src/lib/db/auth-client.ts` - Server-only (`import "server-only"` line 1) postgres-js connection (`authConn`, `prepare: false`, globalThis-cached) and Drizzle client (`authDb`) bound to `authSchema`; guards via `assertAuthDatabaseUrl()` before building; reads only `appEnv.authDatabaseUrl`.

## Decisions Made
- Migration applied with `psql -f drizzle/auth/0000_careful_iron_lad.sql` (committed-SQL-applied-manually model, D-09/D-10) rather than `drizzle-kit push`, keeping the SQL the single source of truth against the dedicated 5433 `basket_auth` container.
- Task 2 (bringing up the container, setting `AUTH_DB_PASSWORD`/`AUTH_DATABASE_URL` in gitignored `.env.local`, applying the SQL) was performed by the orchestrator on the operator's explicit authorization — it is a blocking human-action checkpoint Claude cannot execute (requires the local Docker/Podman daemon, an operator-chosen secret, and host `psql`).

## Deviations from Plan

None - plan executed exactly as written.

## Authentication / Human-Action Gates
- **Task 2 (checkpoint:human-action, gate=blocking):** Required the local Docker/Podman daemon, an operator-chosen `AUTH_DB_PASSWORD`, and host `psql` — unavailable to Claude. The operator authorized provisioning; the orchestrator brought up the `basket-auth-db` container, set the auth secrets in gitignored `.env.local` (AUTH_DB_USER, AUTH_DB_PASSWORD [48-hex], AUTH_DB_PORT=5433, AUTH_DATABASE_URL), applied the committed SQL, and confirmed the four `auth_*` tables with D-07 columns plus `SELECT 1`. Operator-confirmed "verified". This is normal expected flow, not a deviation.

## Issues Encountered
None.

## User Setup Required
None as a follow-up — the auth DB container and `.env.local` secrets were provisioned during Task 2. The `basket-auth-db` container must remain available (or be re-applied via the same `docker compose up -d basket-auth-db` + `psql -f` steps) for Phase 3 Better Auth wiring.

## Next Phase Readiness
- ROADMAP Phase 1 success criteria all satisfied: (1) the four `auth_*` tables exist via committed Drizzle SQL with D-07 admin columns; (2) a dedicated `AUTH_DATABASE_URL` postgres-js/Drizzle client connects independently of Supabase; (3) the auth schema/migrations/client live in an isolated path (`src/lib/auth/`, `drizzle/auth/`, `src/lib/db/`) untouched by domain Drizzle config.
- `authDb` is unconsumed by design in Phase 1 (it exists to prove connectivity); it gets wired into Better Auth in Phase 3.
- No blockers for Phase 2 (RLS removal & guard audit), which is independent of the auth client wiring.

## Self-Check: PASSED

- `src/lib/db/auth-client.ts` — FOUND
- `.planning/phases/01-shared-identity-database/01-02-SUMMARY.md` — FOUND
- Commit `2000196` (Task 1) — FOUND

---
*Phase: 01-shared-identity-database*
*Completed: 2026-06-03*
