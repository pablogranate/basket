---
phase: 02-rls-removal-guard-coverage-audit
plan: 02
subsystem: api-authz
tags: [authz, withAuth, withApiKey, rate-limit, machine-auth, api-routes]
requires:
  - "src/lib/api/with-auth.ts (withAuth — plan 02-01)"
  - "src/lib/api/rate-limit.ts (consumeGuestRateLimit — plan 02-01)"
  - "src/lib/data/dashboard.ts (getGridCalendarData ctx-first signature — plan 02-03 / D-06)"
  - "src/test/fixtures/user-context.ts (makeUserContext/makeGuestContext — plan 02-01)"
provides:
  - "withApiKey machine-auth wrapper (src/lib/api/with-api-key.ts)"
  - "appEnv.intakeApiKey accessor (INTAKE_API_KEY)"
  - "withAuth markers on 6 api/* routes (4 ai/* + intake withApiKey + team-logo + grid/calendar)"
affects:
  - "Plan 05 D-07 structural coverage test (marker recognition for withApiKey()"
  - "Plan 04 collaborator-reports conversion + intake actor-stamping reconciliation"
tech-stack:
  added: []
  patterns:
    - "Route handlers exported as withAuth(options, handler) / withApiKey(handler) const exports"
    - "Guest-path rate limiting via consumeGuestRateLimit keyed by x-forwarded-for client IP"
    - "Machine-auth via shared-secret header (x-intake-key) compared to appEnv.intakeApiKey, fail-closed"
key-files:
  created:
    - "src/lib/api/with-api-key.ts"
    - "src/app/api/ai/people/__tests__/auth.test.ts"
    - "src/app/api/ai/section/__tests__/auth.test.ts"
    - "src/app/api/ai/metric-capture/__tests__/auth.test.ts"
    - "src/app/api/ai/speedtest/__tests__/auth.test.ts"
    - "src/app/api/matches/intake/__tests__/auth.test.ts"
    - "src/app/api/team-logo/__tests__/auth.test.ts"
    - "src/app/api/grid/calendar/__tests__/auth.test.ts"
  modified:
    - "src/app/api/ai/people/route.ts"
    - "src/app/api/ai/section/route.ts"
    - "src/app/api/ai/metric-capture/route.ts"
    - "src/app/api/ai/speedtest/route.ts"
    - "src/app/api/matches/intake/route.ts"
    - "src/app/api/team-logo/route.ts"
    - "src/app/api/grid/calendar/route.ts"
    - "src/lib/env.ts"
decisions:
  - "matches/intake machine-auth = api-key-header (Open Q1): withApiKey wrapper, header x-intake-key, env INTAKE_API_KEY; mismatch/absent -> 401 JSON, handler not executed."
metrics:
  duration: ~12 min
  completed: 2026-06-03
requirements: [AUTHZ-01]
---

# Phase 02 Plan 02: api/* Guard Coverage (withAuth/withApiKey) Summary

Wrapped every unguarded/inline-guarded `api/*` route in the `withAuth(`/`withApiKey(` marker convention (D-04): the 4 paid-Gemini `api/ai/*` routes now enforce session/role auth with guest-path rate limiting (D-05), the no-auth `matches/intake` route fails closed on a shared-secret header (Open Q1), and the two inline-guarded session GETs (`team-logo`, `grid/calendar`) carry the structural `withAuth(` marker the D-07 coverage test scans for — all backed by per-route 401/403/429 unit tests.

## What Was Built

- **Task 1 — `api/ai/*` (D-04/D-05):** `ai/people` → `withAuth({ roles: ["admin","editor","coordinator"] })` (no guest, 401/403 closed). `ai/speedtest` → `withAuth({})` (any authenticated session). `ai/metric-capture` and `ai/section` → `withAuth({ allowGuest: true })`; on the guest path (`ctx.userId === null`) they call `consumeGuestRateLimit(clientKey)` keyed by the `x-forwarded-for` client IP and return 429 when blocked. Authenticated users are never rate-limited. All existing bodies (Zod `safeParse`→400, `getGeminiRuntimeConfig()`, MIME checks, `[ai][...]` logging) unchanged; the guest path still receives a working Gemini key (no admin gate on the runtime read).
- **Task 2 (checkpoint:decision, pre-resolved):** machine-auth model for `matches/intake` = **api-key-header** (recorded below). Not re-prompted.
- **Task 3 — `matches/intake` (Open Q1):** new `withApiKey(handler)` wrapper reads the `x-intake-key` request header and compares it to `appEnv.intakeApiKey` (added to `src/lib/env.ts` from `process.env.INTAKE_API_KEY`). Missing/empty/mismatched header (or unset env) → 401 JSON, handler not executed. Correct header → existing `firstString`/`getPathValue`/`normalizeDate` normalization runs unchanged.
- **Task 4 — `team-logo` + `grid/calendar` (D-04 marker):** both converted from inline `getUserContext()`→401 to `withAuth({}, async (request, ctx) => …)`. `grid/calendar` now passes the resolved `ctx` into `getGridCalendarData(ctx, …)` (D-06 ctx-first loader signature, landed in plan 02-03). No role regression — both remain any-authenticated.

## Decisions Made

- **Open Q1 — matches/intake machine-auth = api-key-header.** Wrapper: `withApiKey` (new, `src/lib/api/with-api-key.ts`). Header: `x-intake-key`. Env var: `INTAKE_API_KEY` (read via `appEnv.intakeApiKey`, existing accessor pattern). Fail-closed: absent/empty/mismatched key OR unset env → 401, handler not executed. Header constant exported as `INTAKE_API_KEY_HEADER`.

## Coverage Marker Notes (for Plan 05 D-07)

- All 4 `api/ai/*` routes, `team-logo`, and `grid/calendar` carry a literal `withAuth(` marker.
- `matches/intake` carries a **`withApiKey(`** marker (NOT `withAuth(`). Plan 05's D-07 structural coverage test must recognize/allowlist the `withApiKey(` marker for the intake route — intake is NOT health-allowlisted and must count as guarded.
- `collaborator-reports` is NOT touched here — its `withAuth` conversion is owned by **plan 04** (it also stamps the actor on that route). After plan 04 lands, the full D-07 coverage allowlist remains **only `api/health`**.

## Plan 04 Reconciliation Flag (intake actor-stamping)

`matches/intake` is in the write-path inventory. The current route does an external lookup + normalization only (no direct matches write in this file), but per the plan's note the machine-auth path has no user context. When plan 04 adds actor-stamping to the intake/import write path, it must stamp `created_by`/`updated_by` to a system/admin profile id or NULL per the import-provenance decision — coordinate there. No domain write was added or changed in this plan.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Completed `GeminiRuntimeConfig` shape in Task 1 AI test mocks**
- **Found during:** Task 4 (project-wide `tsc --noEmit`)
- **Issue:** Task 1's AI test mocks for `getGeminiRuntimeConfig` only supplied `{ apiKey, model, source }`; the real `GeminiRuntimeConfig` type also requires `hasGeminiKey`, `hasPersonalGeminiKey`, `hasPortalGeminiKey`, `hasEnvGeminiKey`. Typecheck failed.
- **Fix:** Added the four boolean fields (`false`) to every `mockResolvedValue` in the four AI auth tests.
- **Files modified:** src/app/api/ai/{people,section,metric-capture,speedtest}/__tests__/auth.test.ts
- **Commit:** 5e798f5 (folded into Task 4 commit alongside the route conversions)

**2. [Rule 1 - Test correctness] Relaxed team-logo 200-path assertion**
- **Found during:** Task 4
- **Issue:** `getTeamLogoPath` returns `null` for an unknown team name, so asserting `typeof body.src === "string"` failed on the authenticated-pass test.
- **Fix:** Assert the handler returned 200 with a `src` property present (the auth behavior under test), not a specific string value.
- **Files modified:** src/app/api/team-logo/__tests__/auth.test.ts
- **Commit:** 5e798f5

## User Setup Required (operator)

- **`INTAKE_API_KEY`** — operator-provided shared secret, set in the gitignored `.env.local`. The upstream `matches/intake` caller must send this value in the `x-intake-key` request header. Absent env → the route fails closed (401 for all callers).

## Verification

- `npx vitest run src/app/api/ai` → 11 passed (401 / 403 / guest-pass / 429 per route).
- `npx vitest run src/app/api/matches/intake` → 3 passed (missing/wrong key → 401; correct key → handler runs).
- `npx vitest run src/app/api/team-logo src/app/api/grid/calendar` → 5 passed (no session → 401; authenticated pass).
- `npm run test` (full suite) → 10 files / 32 tests passed.
- `npm run typecheck` → clean.
- `npm run lint` → 0 errors (2 pre-existing warnings in plan-01 `with-auth.test.ts`, out of scope).
- Marker grep: `withAuth(` present in all 4 ai routes + team-logo + grid/calendar; `withApiKey(` present in matches/intake.

## Threat Model Coverage

- T-02-02 (EoP, unguarded ai/*): mitigated — withAuth on all 4 routes + 401/403 tests.
- T-02-03 (DoS/financial, guest Gemini): mitigated — consumeGuestRateLimit on guest path + 429 tests.
- T-02-04 (Spoofing/Tampering, intake no-auth): mitigated — withApiKey shared-secret, fail-closed.
- T-02-16 (EoP, marker-invisible inline guards): mitigated — team-logo + grid/calendar now carry withAuth marker.
- T-02-05 (Gemini key in URL query): accepted/out of scope (noted for follow-up; not authz).

## Self-Check: PASSED
