---
phase: 01-shared-identity-database
verified: 2026-06-03T18:30:00Z
status: passed
score: 3/3 must-haves verified
overrides_applied: 0
re_verification:
  # No previous VERIFICATION.md — this is initial verification
---

# Phase 1: Shared Identity Database Verification Report

**Phase Goal:** A dedicated `basket_auth` Postgres database exists on the company server with Better Auth's tables and a working Drizzle/postgres connection portal and analytics can both target.
**Verified:** 2026-06-03T18:30:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1 | Four `auth_*` tables created via a committed Drizzle SQL migration with D-07 admin-plugin columns baked in | ✓ VERIFIED | `drizzle/auth/0000_careful_iron_lad.sql` has `CREATE TABLE` for `auth_user`/`auth_session`/`auth_account`/`auth_verification`. Live DB `\dt` lists exactly those four tables. D-07 cols confirmed live: `auth_user` → `role`, `banned`, `ban_reason`, `ban_expires`; `auth_session` → `impersonated_by`. SQL is drizzle-kit output (matching `meta/0000_snapshot.json`, journal tag `0000_careful_iron_lad`). |
| 2 | A dedicated `AUTH_DATABASE_URL` postgres-js/Drizzle client can connect, independent of Supabase | ✓ VERIFIED | `src/lib/db/auth-client.ts` builds `postgres(appEnv.authDatabaseUrl, { prepare: false })` then `drizzle(authConn, { schema: authSchema })`; `assertAuthDatabaseUrl()` guards before build. `appEnv.authDatabaseUrl` reads `AUTH_DATABASE_URL` (`src/lib/env.ts:10`). Live `SELECT 1` against `AUTH_DATABASE_URL` (running `basket-auth-db` postgres:17 on port 5433) returns a row. Module imports zero Supabase symbols/env. |
| 3 | Auth schema/migrations/client isolated from domain Drizzle/Supabase config | ✓ VERIFIED | Only one drizzle config exists (`drizzle.auth.config.ts`, `out: "./drizzle/auth"`, `schema: "./src/lib/auth/schema.ts"`) — no competing domain Drizzle config. Generated SQL references only `auth_*` tables. `supabase/migrations/` carries no auth-generated changes. Auth client reads no Supabase env. No `drizzle-kit push` / `better-auth migrate` anywhere (D-09). |

**Score:** 3/3 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `src/lib/auth/schema.ts` | Four pgTable exports w/ D-07 cols | ✓ VERIFIED | 4 `pgTable` defs, `text` id PKs, camelCase→snake_case binding (`emailVerified`→`email_verified`, `userId`→`user_id`), D-07 cols (`ban_reason`, `ban_expires`, `impersonated_by`), FK cascade on `auth_session`/`auth_account`. |
| `drizzle.auth.config.ts` | Auth-only config, out→drizzle/auth | ✓ VERIFIED | `out: "./drizzle/auth"`, `schema: "./src/lib/auth/schema.ts"`, no `supabase/` reference. Compiles (typecheck 0). |
| `docker-compose.yml` | basket_auth pg service | ✓ VERIFIED | `image: postgres:17`, `POSTGRES_DB: basket_auth`, fail-fast `${AUTH_DB_PASSWORD:?...}`, port `${AUTH_DB_PORT:-5433}:5432`, named volume. No hard-coded secret. |
| `src/lib/env.ts` | authDatabaseUrl + assert guard | ✓ VERIFIED | `authDatabaseUrl: process.env.AUTH_DATABASE_URL ?? ""` (line 10); `assertAuthDatabaseUrl()` throws when unset (lines 33-37). Separate from Supabase guards. |
| `drizzle/auth/0000_careful_iron_lad.sql` | DDL for four tables | ✓ VERIFIED | One SQL file; `CREATE TABLE` ×4 + FK cascade ALTERs; D-07 cols present; unique constraints on email/token. |
| `src/lib/db/auth-client.ts` | server-only authConn/authDb | ✓ VERIFIED | Line 1 `import "server-only";`; exports `authConn`, `authDb`; `prepare: false`; globalThis-cached; no Supabase import. |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `drizzle.auth.config.ts` | `src/lib/auth/schema.ts` | schema config key | ✓ WIRED | `schema: "./src/lib/auth/schema.ts"` |
| `drizzle/auth/0000_*.sql` | four auth_* tables | generated DDL | ✓ WIRED | `CREATE TABLE "auth_user"` etc. present |
| `src/lib/db/auth-client.ts` | `appEnv.authDatabaseUrl` | `postgres(appEnv.authDatabaseUrl, ...)` | ✓ WIRED | Line 15 |
| `src/lib/db/auth-client.ts` | `src/lib/auth/schema.ts` | drizzle schema option | ✓ WIRED | `drizzle(authConn, { schema: authSchema })`, `import * as authSchema from "@/lib/auth/schema"` |

### Data-Flow Trace (Level 4)

N/A — Phase 1 is infrastructure (schema, migration, env, DB client). `authDb` is unconsumed by design in Phase 1 (proves connectivity; wired into Better Auth in Phase 3). The live `SELECT 1` against the dedicated URL is the behavioral proof that real data flows through the connection. Not a HOLLOW/ORPHANED finding because the plan explicitly scopes the client as "exists to satisfy criterion 2 — a client that CAN connect," deferring consumption to Phase 3.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Static type integrity | `pnpm typecheck` | exit 0 | ✓ PASS |
| Four auth_* tables exist live | `psql "$AUTH_DATABASE_URL" -c '\dt'` | 4 rows: auth_account/session/user/verification | ✓ PASS |
| D-07 cols on auth_user | information_schema query | role, banned, ban_reason, ban_expires | ✓ PASS |
| D-07 col on auth_session | information_schema query | impersonated_by | ✓ PASS |
| Dedicated connection works | `psql "$AUTH_DATABASE_URL" -c 'SELECT 1'` | returns 1 | ✓ PASS |
| Container running | `docker ps` (podman) | basket-auth-db Up, 0.0.0.0:5433->5432 | ✓ PASS |

### Probe Execution

N/A — no `scripts/*/tests/probe-*.sh` probes declared or present; VALIDATION.md explicitly states no test harness (command/manual verification). Behavioral spot-checks above cover the runnable verification.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| AUTH-01 | 01-01, 01-02 | Shared identity DB with Better Auth tables + dedicated Drizzle connection | ✓ SATISFIED | All 3 ROADMAP success criteria verified above (schema, isolated migration, dedicated connecting client). |

### Isolation Invariant Checks (D-04 / D-09 / D-11)

| Invariant | Check | Result |
| --------- | ----- | ------ |
| D-09 (no push/migrate tooling) | grep `drizzle-kit push` / `better-auth migrate` across repo (excl node_modules/.planning) | NONE FOUND |
| D-11 (auth never wrote supabase/migrations) | config `out` has no `supabase/`; SQL references only `auth_*`; `git status supabase/migrations/` shows only pre-existing untracked `0009_add_contacts.sql` | CLEAN |
| D-04 (auth-client isolated from Supabase) | grep supabase/SUPABASE/SERVICE_ROLE in auth-client.ts | NONE |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| (none) | — | — | — | Scan of all 5 phase source/config files for TODO/FIXME/XXX/TBD/HACK/PLACEHOLDER/stub markers returned no matches. |

### Human Verification Required

None. All criteria were verifiable programmatically (live psql against the running container, typecheck, grep isolation checks). The Plan 02 human-action checkpoint (container provision + SQL apply) was completed and its outcome independently re-confirmed here by the verifier against the live DB.

### Gaps Summary

No gaps. All three ROADMAP success criteria are observably true in the live codebase and running `basket_auth` database:
1. Four `auth_*` tables exist via the committed `drizzle/auth/0000_careful_iron_lad.sql` with D-07 admin columns (verified live, not just in SQL).
2. A dedicated `AUTH_DATABASE_URL` postgres-js/Drizzle client (`authDb`) connects independently of Supabase (`SELECT 1` returns a row).
3. Auth schema/migration/client are isolated — sole drizzle config points at `drizzle/auth/`, no push/migrate tooling, no Supabase coupling, domain migrations untouched.

Note: the documented commits (589c531, ecf1639, 0c74f69, 2000196) all exist in history. The Plan 01 SUMMARY's noted `?? supabase/migrations/0009_add_contacts.sql` is a pre-existing untracked domain file unrelated to auth work — confirmed it predates and is independent of this phase. Phase 1 fully unblocks Phase 2.

---

_Verified: 2026-06-03T18:30:00Z_
_Verifier: Claude (gsd-verifier)_
