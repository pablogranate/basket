---
phase: 1
slug: shared-identity-database
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-03
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | none — no test runner in repo (Jest/Vitest absent). Verification is command/manual. |
| **Config file** | none |
| **Quick run command** | `pnpm typecheck` |
| **Full suite command** | `pnpm typecheck && pnpm lint` |
| **Estimated runtime** | ~30 seconds |

> Adding a test harness is a Phase 2 concern (per RESEARCH.md). Phase 1 is infrastructure: schema defs, generated SQL migrations, a server-only DB client, env wiring, and a Docker Postgres service. Behavioral verification is via `psql` against the local `basket_auth` container and a `SELECT 1` connection smoke test, not unit tests.

---

## Sampling Rate

- **After every task commit:** Run `pnpm typecheck`
- **After every plan wave:** Run `pnpm typecheck && pnpm lint`
- **Before `/gsd-verify-work`:** typecheck + lint green; migrations applied to local `basket_auth` container; `\dt` shows the four `auth_*` tables; connection smoke test returns a row.
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 1-01-01 | 01 | 1 | AUTH-01 | — | auth-client module is `server-only`; never reaches client bundle | manual+command | `pnpm typecheck` | ❌ W0 | ⬜ pending |
| 1-01-02 | 01 | 1 | AUTH-01 | — | Generated SQL creates `auth_user`/`auth_session`/`auth_account`/`auth_verification` with admin-plugin columns | command | `psql "$AUTH_DATABASE_URL" -c '\dt'` | ❌ W0 | ⬜ pending |
| 1-01-03 | 01 | 1 | AUTH-01 | — | Drizzle/postgres-js client connects via dedicated `AUTH_DATABASE_URL`, separate from Supabase | command | `SELECT 1` smoke via auth-client | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky · Exact task IDs/rows finalized by the planner.*

---

## Wave 0 Requirements

- No test framework to install (deliberately deferred to Phase 2).
- Wave 0 prerequisite is operational, not test-code: the `basket_auth` Docker Postgres container must be up and `AUTH_DATABASE_URL` set before migration-apply and connection verification can run.

*Existing infrastructure: `pnpm typecheck` / `pnpm lint` cover static verification of all new TypeScript artifacts.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Four `auth_*` tables exist with correct columns | AUTH-01 | No test harness; requires a live `basket_auth` Postgres | Start compose service, apply generated SQL, run `psql "$AUTH_DATABASE_URL" -c '\d auth_user'` and confirm `role`/`banned`/`ban_reason`/`ban_expires`; `\d auth_session` confirms `impersonated_by`. |
| Auth DB connection is isolated from Supabase | AUTH-01 | Connection behavior, runtime-only | Confirm `auth-client.ts` reads only `AUTH_DATABASE_URL`; run a `SELECT 1` against it; verify no Supabase env vars are referenced. |
| Auth migrations never touch domain data | AUTH-01 | Path-isolation invariant | Confirm `drizzle.auth.config.ts` `out` points to `drizzle/auth/`, never `supabase/migrations/`; generated SQL only references `auth_*` tables. |

---

## Validation Sign-Off

- [ ] All tasks have an automated command or a documented manual verification
- [ ] Sampling continuity: `pnpm typecheck` runs after every task commit
- [ ] Wave 0 operational prereqs (container up, env set) documented
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter once the planner confirms coverage

**Approval:** pending
