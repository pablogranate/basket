# Phase 2: RLS Removal & Guard Coverage Audit - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-03
**Phase:** 2-rls-removal-guard-coverage-audit
**Areas discussed:** RLS removal scope, Guard placement pattern

---

## Gray areas offered (multiSelect)

| Area | Selected for deep-dive |
|------|------------------------|
| RLS removal scope | ✓ |
| Guard placement pattern | ✓ |
| Actor stamping mechanism | (left to planner discretion) |
| Test strategy | (left to planner discretion) |

---

## RLS Removal Scope

Reframe established before the question: the app is fully server-mediated (`browser.ts` unused, no client `.from(...)`), so RLS today protects the **Supabase PostgREST data API** (reachable by any holder of a valid Supabase JWT + the public anon key), not the app. Dropping RLS while Supabase Auth is live opens PostgREST for the migration window.

| Option | Description | Selected |
|--------|-------------|----------|
| Guards now, drop at cutover | Build guards + app-stamping, keep RLS as defense-in-depth; physical DROP after Better Auth cutover when Supabase JWTs no longer exist. Safest. | |
| Drop now + kill data API | Drop RLS + revoke PostgREST grants / move server conn to privileged role. True plain Postgres now; bigger connection-model change. | |
| Drop now, accept window | Drop RLS this phase, accept bounded direct-PostgREST exposure during the live-Auth window. Simplest; internal staff tool, trusted users. | ✓ |

**User's choice:** Drop now, accept window (option c).
**Notes:** Constraint recorded in CONTEXT D-02 — the destructive migration (drop policies + `auth.uid()` triggers) lands LAST, after guards + app-side stamping are in and verified, so the app never loses both protections at once and `audit_log.changed_by` never goes NULL mid-phase.

---

## Guard Placement Pattern

API-route wrapper treated as clear-cut/locked (`withAuth(role)` HOF, central 401/403, fail-closed; guest AI routes via `withAuth({ allowGuest })` + rate limiting) — not put to a vote. Two genuine forks asked:

### Data loader protection

| Option | Description | Selected |
|--------|-------------|----------|
| Guard inside each loader | Every loader calls a guard at top. Foolproof but couples loaders to the request; harder to unit-test. | |
| Boundary guard + pure loaders | Guard once at RSC page/route, pass resolved context into pure loaders as an arg. Testable; protection by-convention. | ✓ |
| Inside-loader + pass context (hybrid) | Loaders require a typed context arg produced only by guards. Foolproof + testable. | |

**User's choice:** Boundary guard + pure loaders.

### Structural guard-coverage test

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — enforce in CI | Test enumerates every route + loader, asserts a guard/wrapper present; forgotten guard fails CI. | ✓ |
| No — rely on wrapper + review | Skip the meta-test, keep suite focused on behavior. | |

**User's choice:** Yes — enforce in CI.
**Notes:** The CI coverage test closes the one weakness of the by-convention boundary-guard model — the pairing is stronger than inside-loader guards (pure/testable loaders + structural enforcement). `secret_value` admin-only protection and the `(dashboard)/people` admin-client removal were folded under this area (CONTEXT D-08/D-09).

---

## Claude's Discretion

- **Actor stamping mechanism** — explicit `created_by`/`changed_by` columns via helper vs server-set Postgres GUC read by a rewritten trigger. Constraint: app-side, no `auth.uid()`, `audit_log.changed_by` non-NULL.
- **Test runner choice** — Vitest/Playwright selection + how to assert 401/403 without a live Supabase session. Constraint: the mandatory tests in criterion 2 + the D-07 coverage test must exist; a runner must be introduced.
- **Exact `withAuth` API shape** and the teardown migration SQL.

## Deferred Ideas

- Revoking PostgREST grants / privileged server connection (option b) — deferred; exposure closes naturally at cutover.
- Better Auth instance + `profiles.auth_user_id` link — Phase 3/4.
- Gemini key rotation — operational follow-up after fixing the read policy.
- CONCERNS refactors (oversized components, intake Zod schema, revalidation fan-out) — out of scope.
