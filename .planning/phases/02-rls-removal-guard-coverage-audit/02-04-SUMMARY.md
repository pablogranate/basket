---
phase: 02-rls-removal-guard-coverage-audit
plan: 04
subsystem: app-side-actor-stamping-audit
tags: [authz, audit, actor-stamping, withAuth, secret-redaction, structural-test]
requires:
  - "src/lib/auth.ts UserContext type (plan 02-01)"
  - "src/lib/api/with-auth.ts withAuth (plan 02-01)"
  - "src/test/fixtures/user-context.ts makeUserContext/makeGuestContext (plan 02-01)"
  - "src/lib/data/collaborators.ts getCollaboratorMatchData ctx-first (plan 02-03)"
provides:
  - "stampInsert/stampUpdate/writeAudit app-side actor stamping + audit writer (AUTHZ-03)"
  - "Every src/app/actions/* domain write stamped + audited app-side"
  - "collaborator-reports withAuth marker (D-04/D-07) + stamped/audited writes (AUTHZ-01)"
  - "Structural stamping-coverage test (fails CI on any unstamped action write site, Pitfall 1)"
  - "changed_by-never-NULL + secret_value-redaction tests"
affects:
  - "Wave 4 teardown (drops set_row_metadata + log_audit_event triggers — safe only after this)"
  - "Plan 05 D-07 coverage allowlist stays at only api/health (collaborator-reports now marked)"
tech-stack:
  added: []
  patterns:
    - "App-side actor stamping: stampInsert/stampUpdate wrap every insert/update payload with ctx.userId"
    - "writeAudit after every successful mutation; audit failure logged + rethrown (never silent)"
    - "app_settings audit auto-redacts secret_value before persisting"
    - "Structural completeness test: static scan of action files + explicit allowlist + predicate self-check"
key-files:
  created:
    - "src/lib/__tests__/audit.test.ts"
    - "src/lib/__tests__/stamping-coverage.test.ts"
    - "src/app/api/collaborator-reports/__tests__/auth.test.ts"
  modified:
    - "src/lib/audit.ts"
    - "src/app/actions/matches.ts"
    - "src/app/actions/people.ts"
    - "src/app/actions/roles.ts"
    - "src/app/actions/settings.ts"
    - "src/app/api/collaborator-reports/route.ts"
decisions:
  - "audit_log.record_id is uuid NOT NULL; app_settings + collaborator_reports writes select(\"id\") so the audit row gets a real uuid record id."
  - "Bulk staff-assignment upserts (createMatch/updateMatch) audited as one summary row keyed by match id rather than one row per assignment (Open Q4 granularity — match-level parity)."
  - "src/app/actions/auth.ts has no domain write (only a profiles SELECT) — no stamping needed."
  - "Service-role profiles writes + auth.admin.* in people.ts stay unstamped (identity provisioning, allowlisted in the coverage test)."
requirements: [AUTHZ-01, AUTHZ-03]
metrics:
  duration: ~7 min
  completed: "2026-06-03"
  tasks: 3
  files: 9
---

# Phase 2 Plan 04: App-Side Actor Stamping + Audit Summary

Ported the dropped `set_row_metadata` + `log_audit_event` triggers into the app layer (`stampInsert`/`stampUpdate`/`writeAudit` in `src/lib/audit.ts`), wired stamping + audit into EVERY server-action write path and the collaborator-reports route, converted collaborator-reports to the `withAuth` marker convention (D-04), and added a structural stamping-coverage test that fails CI if any action write site skips stamping (Pitfall 1) — all proven by 13 new passing tests with a never-NULL `changed_by` guarantee.

## What Was Built

- **Task 1 (AUTHZ-03)** — Added `stampInsert`/`stampUpdate`/`writeAudit` to the existing `src/lib/audit.ts` (alongside the existing `formatAuditEntry` display helper). `stampInsert` merges `created_by`/`updated_by = ctx.userId` + `created_at` (coalescing an existing value, like the trigger) + `updated_at`. `stampUpdate` merges `updated_by` + `updated_at`. `writeAudit` inserts an `audit_log` row with `changed_by = ctx.userId`, applies the trigger's `match_id` rule (matches → record id, assignments → row match_id, else null), redacts `secret_value` for the `app_settings` table, and logs + rethrows on insert error (audit failure is never silent).
- **Task 2 (Pitfall 1)** — Wrapped every insert/update/upsert in `matches.ts`, `people.ts`, `roles.ts`, `settings.ts` (app_settings + announcements) in `stampInsert`/`stampUpdate` and added a `writeAudit` after each successful mutation. Added `src/lib/__tests__/stamping-coverage.test.ts`: statically scans every `src/app/actions/*.ts`, finds each domain-table mutation, and asserts it is stamped AND the file references `writeAudit`. Maintains an explicit inline allowlist (`profiles` service-role provisioning, `audit_log` self-insert), flags any unrecognized table, and includes a predicate self-check (stamped vs unstamped sample) so the test cannot pass by matching nothing.
- **Task 3 (AUTHZ-01)** — Converted `collaborator-reports/route.ts` from `export async function POST` + inline `getUserContext()`→401 to `export const POST = withAuth({}, async (request, ctx) => …)`. Removed the inline 401 block (now produced by `withAuth`), preserved the per-match 403 check using `ctx`, stamped the `collaborator_reports` upsert + `assignments` confirm, and audited both. Added `src/app/api/collaborator-reports/__tests__/auth.test.ts` (401 no-session, 403 under-privileged).

## Write-Path Inventory Coverage

| File | Write site | Stamped | Audited |
|------|-----------|---------|---------|
| matches.ts | createMatch (matches insert) | ✅ stampInsert | ✅ |
| matches.ts | createMatch (assignments upsert) | ✅ stampInsert | ✅ |
| matches.ts | updateMatch (matches update) | ✅ stampUpdate | ✅ |
| matches.ts | updateMatch (assignments upsert) | ✅ stampInsert | ✅ |
| matches.ts | quickUpdateMatchField (matches update) | ✅ stampUpdate | ✅ |
| matches.ts | deleteMatch (matches delete) | n/a (delete) | ✅ |
| matches.ts | upsertAssignment (assignments upsert) | ✅ stampInsert | ✅ |
| people.ts | upsertPerson (people insert/update) | ✅ | ✅ |
| people.ts | deletePerson (people delete) | n/a | ✅ |
| people.ts | togglePersonActive (people update) | ✅ stampUpdate | ✅ |
| roles.ts | upsertRole (roles insert/update) | ✅ | ✅ |
| roles.ts | deleteRole (roles delete) | n/a | ✅ |
| settings.ts | saveGemini (app_settings upsert/delete) | ✅ stampInsert | ✅ (secret redacted) |
| settings.ts | saveAnnouncement (announcements insert/update/deactivate) | ✅ | ✅ |
| collaborator-reports route | collaborator_reports upsert | ✅ stampInsert | ✅ |
| collaborator-reports route | assignments confirm update | ✅ stampUpdate | ✅ |

`src/app/actions/auth.ts` has NO domain write (only a `profiles` SELECT in the login flow) — no stamping needed. Service-role `profiles` upserts and `auth.admin.*` calls in `people.ts` are identity provisioning, explicitly allowlisted in the coverage test.

## Intake Reconciliation (plan 02)

`src/app/api/matches/intake/route.ts` is owned by plan 02 and was NOT modified here. Per plan 02's reconciliation flag, the current intake route does external lookup + normalization only — it contains no direct domain `insert`/`update`/`upsert` in that file (confirmed: the stamping-coverage scan covers `src/app/actions/*` only; intake is a route handler with no domain write to stamp). When/if the intake write path is added, it must stamp to a system/admin profile id or NULL per the import-provenance decision (machine-auth path has no user ctx). No domain write was added or changed for intake in this plan.

## D-07 Coverage Allowlist (for plan 05)

collaborator-reports now carries the literal `withAuth(` marker. Combined with plan 02's conversions (team-logo, grid/calendar, 4× ai/*, intake via `withApiKey(`), the full D-07 structural coverage allowlist remains **only `api/health`**.

## Threat Model Coverage

- **T-02-09** (Repudiation, actor attribution lost after triggers drop) — mitigated: app-side stamping + writeAudit on every write, live and verified BEFORE Wave 4 teardown; changed_by-never-NULL test asserts the guarantee.
- **T-02-10** (Info Disclosure, secret_value in audit_log) — mitigated: writeAudit redacts `secret_value` for the app_settings table; test asserts neither old nor new secret appears in the audit payload.
- **T-02-11** (Repudiation, forgotten write path) — mitigated: full inventory covered + structural stamping-coverage test fails CI on any unstamped/unaudited action mutation or unrecognized domain table.
- **T-02-17** (EoP, collaborator-reports marker-invisible) — mitigated: converted to `withAuth({})`; per-match 403 preserved; per-route 401/403 test added.

## Deviations from Plan

None — plan executed as written. (Task 3's RED characterization test passed against the pre-existing inline guards, as expected per the fail-fast note: the 401/403 *behavior* pre-existed and had to be preserved through the withAuth conversion; the RED gate for this task is the structural `withAuth(` marker + app-side stamping, both added in GREEN.)

## Verification

- `npx vitest run src/lib/__tests__/audit.test.ts` → 7 passed (stamping actor fields, changed_by non-NULL, match_id rule, secret redaction, error rethrow).
- `npx vitest run src/lib/__tests__/stamping-coverage.test.ts` → 4 passed (predicate self-check + offenders empty).
- `npx vitest run src/app/api/collaborator-reports` → 2 passed (401 no-session, 403 under-privileged).
- `npm run test` (full suite) → 13 files / 45 tests passed (no regression to prior 32).
- `npm run typecheck` → clean.
- `npm run lint` → 0 errors (2 pre-existing warnings in plan-01 with-auth.test.ts, out of scope).
- `grep -q 'withAuth(' src/app/api/collaborator-reports/route.ts` → present.

## TDD Gate Compliance

- Task 1: `test(02-04)` RED (9e140f0, failing) → `feat(02-04)` GREEN (3312629). Gate satisfied.
- Task 3: `test(02-04)` characterization (46d1e0e) → `feat(02-04)` GREEN conversion (9ac6f91). The RED test passed against pre-existing inline guards (expected — behavior preservation); the production change is the structural `withAuth(` marker + stamping added in the feat commit.

## Self-Check: PASSED

- FOUND: src/lib/audit.ts (stampInsert/stampUpdate/writeAudit added), src/lib/__tests__/audit.test.ts, src/lib/__tests__/stamping-coverage.test.ts, src/app/api/collaborator-reports/__tests__/auth.test.ts, 02-04-SUMMARY.md
- FOUND commits: 9e140f0 (T1 RED), 3312629 (T1 GREEN), 5c8808b (T2), 46d1e0e (T3 RED), 9ac6f91 (T3 GREEN)
- `withAuth(` present in collaborator-reports/route.ts; `stampInsert`/`stampUpdate`/`writeAudit` exported from audit.ts.
