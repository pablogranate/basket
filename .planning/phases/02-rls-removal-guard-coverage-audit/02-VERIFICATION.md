---
phase: 02-rls-removal-guard-coverage-audit
verified: 2026-06-05T16:15:00Z
status: passed
score: 4/4 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: none
  note: Initial verification (no prior VERIFICATION.md existed)
---

# Phase 2: RLS Removal & Guard Coverage Audit — Verification Report

**Phase Goal:** Portal authorization is enforced entirely in the app layer — every data path runs a guard before any query, actor stamping is app-side, and Supabase is treated as plain Postgres — so removing RLS later opens no doors.
**Verified:** 2026-06-05T16:15:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Every data path (server actions, all API routes incl. ai/* and matches/intake, read loaders, (dashboard)/people) enforces a fail-closed app-layer guard; no path relies on RLS | ✓ VERIFIED | All 9 `src/app/api/*/route.ts` carry a wrapper at the export site: 7× `withAuth(`, 1× `withApiKey(` (intake), only `api/health` unguarded (liveness probe, allowlisted). Verified each `export const METHOD = withAuth(...)` wires the handler. All 7 `src/lib/data/*` exported async loaders take `ctx`/`context` first (announcements ×2, collaborators ×2, dashboard ×5); the 2 exceptions are allowlisted+documented: `isUuidLike` (pure predicate) and `personHasPlatformAccess` (server-only identity helper, D-09). `(dashboard)/people/page.tsx` guards via `requireUserContext()`. `withAuth` returns 401 (no session, fail-closed) and 403 (under-privileged role). |
| 2 | Automated tests assert each API route 401/403 without session + 403 under-privileged, and non-admin cannot read `app_settings.secret_value` | ✓ VERIFIED | 8 per-route `auth.test.ts` files: every guarded route has a 401 (no-session) test; role-restricted routes (ai/people, collaborator-reports) add 403 tests. Guest-allowed (metric-capture, section) correctly omit 403 by design; session-only routes (speedtest, team-logo, grid/calendar) are 401-only by design. `settings-secret.test.ts` (D-08): user-facing snapshot never returns raw `secret_value` for any role; server-only runtime read still works for non-admin/guest. Structural `guard-coverage.test.ts` PASSED (7/7). |
| 3 | RLS no longer the backstop: Supabase as plain Postgres, service-role client confined to server-only, (dashboard)/people no longer reads via admin client | ✓ VERIFIED | Migration `0010` disables RLS on all 10 domain tables + drops 37 policies + 5 helper fns (`current_app_role`/`can_read`/`can_edit`/`set_row_metadata`/`log_audit_event`). `createSupabaseAdminClient` appears only in `admin.ts` (`import "server-only"`), `people.ts` (`"use server"`), and `platform-access.ts` (`import "server-only"`) — all server-confined. `people/page.tsx` imports NO admin client; admin reads go through the server-only `personHasPlatformAccess` helper, admin-gated (`user.role === "admin"`). Live-DB facts (RLS off ×10, 0 policies, helper fns gone) treated as verified per orchestrator. |
| 4 | Actor stamping written from app layer; triggers no longer call auth.uid(); post-write audit_log.changed_by populated (never NULL) | ✓ VERIFIED | `src/lib/audit.ts` exports `stampInsert` (L172), `stampUpdate` (L195), `writeAudit` (L240, sets `changed_by = ctx.userId`, rethrows on error). Wired into every action write: matches.ts (9 stamp/8 audit), people.ts (4/4), roles.ts (3/3), settings.ts (5/7). `stamping-coverage.test.ts` PASSED (4/4). Migration `0010` drops all 16 `auth.uid()` triggers (8 metadata + 8 audit). `audit.test.ts` asserts changed_by-never-NULL + secret redaction. Live post-push write produced non-NULL `audit_log.changed_by` (orchestrator-verified). |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/lib/api/with-auth.ts` | `withAuth` HOF, 401/403 fail-closed | ✓ VERIFIED | Resolves ctx, 401 no-session, 403 under-privileged, calls inner handler |
| `src/lib/api/with-api-key.ts` | machine-auth wrapper | ✓ VERIFIED | `withApiKey` validates `x-intake-key`, 401 on mismatch |
| `src/lib/audit.ts` | stampInsert/stampUpdate/writeAudit | ✓ VERIFIED | All three exported; writeAudit redacts secret_value, rethrows on error |
| `src/lib/api/__tests__/guard-coverage.test.ts` | structural coverage (D-07) | ✓ VERIFIED | Enumerates routes + loaders, allowlist = health/isUuidLike/personHasPlatformAccess, predicate self-check; PASSES 7/7 |
| `src/lib/__tests__/stamping-coverage.test.ts` | structural stamping coverage | ✓ VERIFIED | Scans actions, asserts stamp+writeAudit; PASSES 4/4 |
| `supabase/migrations/0010_drop_rls_and_auth_uid_triggers.sql` | teardown migration | ✓ VERIFIED | 16 triggers + 37 policies + 10 disable RLS + 5 fns (last); NOT dropped: handle_new_user, on_auth_user_created, created_by/updated_by/changed_by cols, app_role enum |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Guard-coverage structural test | `npx vitest run src/lib/api/__tests__/guard-coverage.test.ts` | 7 passed | ✓ PASS |
| Stamping-coverage structural test | `npx vitest run src/lib/__tests__/stamping-coverage.test.ts` | 4 passed | ✓ PASS |
| Full suite | `npm run test` | 14 files / 52 tests passed | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| AUTHZ-01 | 02-02/03/04/05 | App-layer guards on every data path | ✓ SATISFIED | All routes wrapped; all loaders ctx-first; structural test enforces |
| AUTHZ-02 | 02-06 | RLS reliance removed; Supabase plain Postgres | ✓ SATISFIED | Migration 0010 + live-DB facts |
| AUTHZ-03 | 02-04 | Actor stamping moved to app layer | ✓ SATISFIED | audit.ts helpers wired into all writes; non-NULL changed_by verified |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | — | No TBD/FIXME/XXX in any phase-modified file | — | Clean |

### Accepted Residuals (documented, not gaps)

- **PostgREST exposure window** — until cutover (Phase 5/6) an authenticated user can hit `/rest/v1/*` directly. Explicitly accepted by user (D-01), time-bounded, anonymous users get nothing.
- **CLI import audit gap** — service-role import scripts (`tools/import/*.mjs`) bypass app stamping. Acceptable for operator-run tooling (02-06-SUMMARY residual #3).
- **Gemini key + DB password rotation** — operational follow-ups, not code deliverables.

### Gaps Summary

None. All 4 ROADMAP success criteria are observably true in the codebase. Every API route is wrapped in a fail-closed guard (only `api/health` allowlisted), every data loader takes ctx first (two documented identity-helper exceptions), the secret_value protection and per-route 401/403 tests exist and pass, the service-role client is confined to server-only modules, the people page dropped the admin client, app-side stamping is wired into every write path with a never-NULL changed_by guarantee, and the destructive `0010` teardown drops exactly the right objects while preserving handle_new_user/on_auth_user_created and the actor columns. The full suite (14 files / 52 tests) is green.

---

_Verified: 2026-06-05T16:15:00Z_
_Verifier: Claude (gsd-verifier)_
