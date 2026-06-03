---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: Phase 2 context gathered
last_updated: "2026-06-03T20:04:54.267Z"
last_activity: 2026-06-03 -- Phase 02 execution started
progress:
  total_phases: 6
  completed_phases: 1
  total_plans: 8
  completed_plans: 4
  percent: 17
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-03)

**Core value:** A single sign-on across `*.basket-app.com` where identity is shared but each app authorizes its own users independently — without breaking portal's existing role-based access.
**Current focus:** Phase 02 — rls-removal-guard-coverage-audit

## Current Position

Phase: 02 (rls-removal-guard-coverage-audit) — EXECUTING
Plan: 2 of 6
Status: Ready to execute
Last activity: 2026-06-03 -- Phase 02 execution started

Progress: [██████████] 100% (Phase 1)

## Performance Metrics

**Velocity:**

- Total plans completed: 1
- Average duration: ~6 min
- Total execution time: 0.1 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| Phase 01 P01 | 1 | 6min | 6min |

**Recent Trend:**

- Last 5 plans: 6min
- Trend: —

*Updated after each plan completion*
| Phase 01 P02 | 30min | 2 tasks | 1 files |
| Phase 02 P03 | ~20 min | 3 tasks | 20 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Roadmap: RLS removal + guard audit (Phase 2) gated BEFORE cutover (Phase 5) — RLS is portal's real authz layer today; dropping it while Supabase Auth is still live keeps a working app to verify guards against.
- Roadmap: User migration links `profiles` via `auth_user_id` (not re-keyed) — `profiles.id` is an FK target across domain tables and audit_log.
- Roadmap: Cutover hard-gated on verified login for one migrated password user AND one Google staff user.
- [Phase ?]: Loaders take a required ctx: UserContext leading param (D-06); the ctx arg is the structural authorization contract, decided at the boundary not from cookies.
- [Phase ?]: Service-role people platform-access read moved to server-only src/lib/data/platform-access.ts; (dashboard)/people no longer imports the admin client (D-09).
- [Phase ?]: vitest aliases the server-only package to a node stub so server-only modules unit-test directly.

### Pending Todos

None yet.

### Blockers/Concerns

- [Phase 4] User migration is the highest-risk requirement — flagged for deeper research: prod password-hash format (bcrypt vs scrypt) and email/password-vs-OAuth user counts must be inspected live before choosing migrate-vs-reset.
- [Phase 2] Open-on-RLS-drop paths verified: all `api/ai/*` routes, `api/matches/intake` (no auth at all), and `(dashboard)/people` (service-role read) have no app-layer guard — these must be closed before cutover.
- [Phase 6] Auth DB final placement (dedicated `basket_auth` DB vs schema) and explicit `trustedOrigins` list (no verified wildcard support) to resolve in phase research.
- [RESOLVED 2026-06-03] Plan 01-02 Task 2 (blocking human-action checkpoint): operator authorized + orchestrator provisioned the basket-auth-db container (postgres:17, port 5433), set AUTH_DB_* + AUTH_DATABASE_URL in gitignored .env.local, applied drizzle/auth/0000_careful_iron_lad.sql via psql -f, and confirmed the four auth_* tables (with D-07 columns) + SELECT 1. Operator-confirmed "verified".

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| *(none)* | | | |

## Session Continuity

Last session: 2026-06-03T20:04:26.647Z
Stopped at: Phase 2 context gathered
Resume file: .planning/phases/02-rls-removal-guard-coverage-audit/02-CONTEXT.md
