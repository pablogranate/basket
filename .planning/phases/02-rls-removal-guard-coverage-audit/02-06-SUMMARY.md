---
phase: 02-rls-removal-guard-coverage-audit
plan: 06
subsystem: rls-trigger-teardown
tags: [authz, rls, teardown, migration, destructive, d-01, d-02, d-03]
requires:
  - "02-05 D-02 step-3 gate sign-off (guards + stamping verified while RLS live)"
  - "src/lib/audit.ts stampInsert/stampUpdate/writeAudit (plan 02-04)"
provides:
  - "supabase/migrations/0010_drop_rls_and_auth_uid_triggers.sql applied to live DB (AUTHZ-02)"
  - "Supabase is plain Postgres: RLS disabled on all 10 domain tables, 0 policies, 0 public triggers"
  - "App layer is the sole authorization + actor-attribution path"
affects:
  - "Phase 3+ (Better Auth wiring) builds on app-layer-only authz"
  - "Phase 4 MIG-02 will drop handle_new_user/on_auth_user_created (left intact here)"
tech-stack:
  added: []
  patterns:
    - "Teardown order: triggers -> policies -> disable RLS -> helper functions last"
    - "psql -1 -v ON_ERROR_STOP=1 per migration file (single transaction, abort on error)"
key-files:
  created:
    - "supabase/migrations/0010_drop_rls_and_auth_uid_triggers.sql"
  modified: []
decisions:
  - "Live DB was missing migrations 0006-0008 (announcements, collaborator_reports, app_settings tables) — applied them in order BEFORE 0010 so history stays linear and 0010 applies cleanly. DB now matches the repo migration set exactly."
  - "Connection: pooler host is aws-1-sa-east-1.pooler.supabase.com (not aws-0)."
requirements: [AUTHZ-02]
metrics:
  duration: "~40 min (incl. live-DB drift investigation)"
  completed: "2026-06-05"
  tasks: 4
  files: 1
---

# Phase 2 Plan 06: RLS + Trigger Teardown Summary

Authored and applied the destructive `0010` teardown to the live Supabase DB: dropped 37 policies, disabled RLS on all 10 domain tables, dropped all 16 `auth.uid()` triggers and the 5 helper functions — after first applying the missing 0006–0008 migrations discovered during pre-flight. Post-push write check confirms app-side stamping holds without triggers.

## What Was Built

- **Task 1 (gate)** — D-02 clearance confirmed via 02-05 sign-off (operator "verified" 2026-06-04).
- **Task 2 (D-01/D-03)** — `supabase/migrations/0010_drop_rls_and_auth_uid_triggers.sql`: 16 `drop trigger if exists` (8× metadata + 8× audit), 37 `drop policy if exists`, 10× `disable row level security`, then 5 `drop function if exists` (functions last). Protected objects untouched: `handle_new_user()`, `on_auth_user_created`, `created_by`/`updated_by`/`changed_by` columns, `app_role` enum.
- **Task 3 (apply)** — Applied via `psql -1 -v ON_ERROR_STOP=1` against the pooler (`aws-1-sa-east-1`). **Pre-flight found live-DB drift:** tables from 0006–0008 did not exist (migrations never applied; 0009 was). Applied 0006 → 0007 → 0008 first (additive), verified the 3 tables exist, then applied 0010 in one transaction.
- **Task 4 (gate + residuals)** — `npm run check` exit 0 post-migration (0 lint errors).

## Post-Push Verification (live DB)

- `pg_class.relrowsecurity` = `false` for all 10 tables.
- `pg_policies` count = 0.
- 0 non-internal triggers on public tables; `set_row_metadata`/`log_audit_event`/`can_edit`/`can_read`/`current_app_role` gone.
- `handle_new_user` + `on_auth_user_created` still present (Phase 4 scope).
- **Write check (the false-positive guard):** operator match updates post-teardown produced `audit_log` rows 2383/2384 with non-NULL `changed_by` (operator profile uuid) — app-side stamping works with triggers gone. Machine intake burst audited with NULL actor (documented import-provenance design).

## Accepted Residuals & Follow-Ups (documented per D-01)

1. **PostgREST window (T-02-14, accepted):** until Supabase Auth retires at cutover (Phase 5/6), any **authenticated** user can hit `/rest/v1/<table>` directly with their session token, bypassing app guards. Anonymous users get nothing. Conscious, time-bounded tradeoff for an internal staff tool; closes when Supabase JWTs stop working at cutover.
2. **Gemini key rotation (operational follow-up, deferred per CONTEXT):** rotate the existing Gemini API key — it was readable via PostgREST `app_settings.secret_value` before the D-08 app-layer gate landed.
3. **CLI import audit gap (new, discovered in write check):** service-role import scripts (`tools/import/*.mjs`, e.g. `grilla.mjs`) bypass the app layer; with the DB triggers gone their writes are no longer stamped or audited (observed: 3 matches inserted 2026-06-04 20:04 with NULL `created_by` and no audit rows). Acceptable for operator-run tooling; if CLI provenance matters later, port `stampInsert`/`writeAudit` into the import scripts.
4. **DB password rotation (recommended):** the Postgres password was pasted into a chat session during this work — rotate it in Supabase settings when convenient.

## Deviations from Plan

- **Live-DB drift (0006–0008 unapplied):** investigated (audit-log forensics: only 1 pre-existing match, no announcements/app_settings/collaborator_reports activity — single-DB confirmed, no second project ref in repo), then applied the three missing migrations before 0010 with user approval. The redundant create-then-drop of their policies/triggers keeps migration history linear.
- Per user instruction, no per-task commits — entire remaining phase work lands in one commit.

## ROADMAP Success Criteria

1. RLS dropped + disabled on every domain table (D-01) — ✅ AUTHZ-02.
2. `auth.uid()` triggers + helpers dropped (D-03); protected objects untouched — ✅.
3. App-side stamping confirmed working WITHOUT triggers (non-NULL `changed_by` post-push) — ✅.
4. Accepted PostgREST window + Gemini rotation documented — ✅ (this summary).

Phase ready for `/gsd-verify-work`.

## Self-Check: PASSED

- FOUND: supabase/migrations/0010_drop_rls_and_auth_uid_triggers.sql (16 triggers / 37 policies / 10 disables / 5 fns; no handle_new_user drop).
- Live DB verified: RLS false ×10, 0 policies, 0 triggers, helper fns gone, protected objects intact.
- Post-push stamped write: audit_log ids 2383/2384, changed_by non-NULL.
- `npm run check` exit 0 post-migration.
