---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: verified
stopped_at: Phase 03 complete (T10 operator-signed-off)
last_updated: "2026-06-11T13:30:00.000Z"
last_activity: 2026-06-11 -- Phase 03 cutover complete; migration 0015 applied; T10 9-check verification passed
progress:
  total_phases: 6
  completed_phases: 3
  total_plans: 9
  completed_plans: 9
  percent: 50
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-03)

**Core value:** A single sign-on across `*.basket-app.com` where identity is shared but each app authorizes its own users independently — without breaking portal's existing role-based access.
**Current focus:** Phase 06 — cross-subdomain SSO & analytics repoint (next)

## Current Position

Phase: 03 (portal-better-auth-wiring) — COMPLETE (verified 2026-06-11)
Plan: 1 of 1
Status: Phase verified -- next: plan Phase 06 (cross-subdomain SSO & analytics repoint)
Last activity: 2026-06-11 -- Better Auth sole-auth cutover live; migration 0015 applied; T10 9-check pass

Progress: [█████░░░░░] 50% (Phases 1-3 of 6; 4 & 5 folded into 3)

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
| Phase 02 P02 | ~12 min | 4 tasks | 9 files |
| Phase 02 P04 | ~7 min | 3 tasks | 9 files |
| Phase 02 P05 | ~10 min + gate | 3 tasks | 1 files |
| Phase 02 P06 | ~40 min | 4 tasks | 1 files |

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
- [Phase ?]: Open Q1: matches/intake machine-auth = api-key-header (withApiKey, x-intake-key header, INTAKE_API_KEY env); fail-closed 401.
- [Phase ?]: AUTHZ-03 actor stamping ported app-side (stampInsert/stampUpdate/writeAudit); every action + collaborator-reports write stamps ctx.userId and audits (changed_by never NULL) — verified before Wave 4 trigger teardown.
- [Phase ?]: Structural stamping-coverage test fails CI on any unstamped/unaudited action domain mutation (Pitfall 1); allowlist = service-role profiles + audit_log self-insert.

### Pending Todos

None yet.

### Blockers/Concerns

- [Phase 4] User migration is the highest-risk requirement — flagged for deeper research: prod password-hash format (bcrypt vs scrypt) and email/password-vs-OAuth user counts must be inspected live before choosing migrate-vs-reset.
- [RESOLVED 2026-06-05] Phase 2 open-on-RLS-drop paths all closed: every route guarded (withAuth/withApiKey), loaders ctx-first, app-side stamping live; 0010 teardown applied to live DB. Accepted residual: authenticated-user PostgREST window until cutover (D-01); follow-ups: rotate Gemini key + DB password; CLI import scripts no longer audited (service-role, triggers gone).
- [Phase 2 NOTE] Live DB had drifted (migrations 0006-0008 never applied) — applied before 0010. Pooler host: aws-1-sa-east-1.
- [Phase 6] Auth DB final placement (dedicated `basket_auth` DB vs schema) and explicit `trustedOrigins` list (no verified wildcard support) to resolve in phase research.
- [RESOLVED 2026-06-03] Plan 01-02 Task 2 (blocking human-action checkpoint): operator authorized + orchestrator provisioned the basket-auth-db container (postgres:17, port 5433), set AUTH_DB_* + AUTH_DATABASE_URL in gitignored .env.local, applied drizzle/auth/0000_careful_iron_lad.sql via psql -f, and confirmed the four auth_* tables (with D-07 columns) + SELECT 1. Operator-confirmed "verified".

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| *(none)* | | | |

## Session Continuity

Last session: 2026-06-10T17:01:58.421Z
Stopped at: Phase 03 context gathered
Resume file: .planning/phases/03-portal-better-auth-wiring/03-CONTEXT.md
