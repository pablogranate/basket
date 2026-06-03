---
phase: 02-rls-removal-guard-coverage-audit
plan: 01
subsystem: auth-test-foundation
tags: [vitest, auth, rate-limit, secret-redaction, ci]
requires:
  - "src/lib/auth.ts getUserContext (existing)"
  - "src/lib/settings.ts getSettingsSnapshot/getGeminiRuntimeConfig (existing)"
provides:
  - "withAuth route HOF (D-04/D-05 seam for Wave 2)"
  - "consumeGuestRateLimit (D-05)"
  - "exported UserContext type (shared contract)"
  - "makeUserContext / makeGuestContext test fixtures"
  - "Vitest installed + configured + wired into check + CI"
  - "D-08 user-facing secret redaction locked by test"
affects:
  - "Wave 2 route/loader plans (consume withAuth + UserContext + fixtures)"
tech-stack:
  added:
    - "vitest@^4.1.8 (dev)"
    - "@vitejs/plugin-react@^6.0.2 (dev)"
    - "vite-tsconfig-paths@^6.1.1 (dev)"
    - "rate-limiter-flexible@^11.1.0 (runtime)"
  patterns:
    - "Vitest node environment, tsconfigPaths + react plugins"
    - "vi.mock(\"@/lib/auth\") + makeUserContext for route tests"
    - "RateLimiterMemory in-memory store (approved, bounded migration window)"
key-files:
  created:
    - "vitest.config.mts"
    - "src/lib/api/with-auth.ts"
    - "src/lib/api/rate-limit.ts"
    - "src/test/fixtures/user-context.ts"
    - "src/lib/api/__tests__/with-auth.test.ts"
    - "src/lib/__tests__/settings-secret.test.ts"
  modified:
    - "package.json"
    - "package-lock.json"
    - ".github/workflows/ci.yml"
    - "src/lib/auth.ts"
    - "src/lib/settings.ts"
decisions:
  - "D-05 rate limiter: approved rate-limiter-flexible@^11.1.0 with in-memory RateLimiterMemory store (operator-confirmed; bounded single-instance migration window)."
  - "D-08 enforced on the USER-FACING surface only; getGeminiRuntimeConfig stays ungated so guest/non-admin AI (D-05) is not regressed."
metrics:
  duration: ~6 min
  completed: "2026-06-03"
  tasks: 4
  files: 11
---

# Phase 2 Plan 01: Auth + Test Foundation Summary

Wave 0 contract-first foundation: Vitest installed/configured/wired into `check` + CI, the `withAuth` route higher-order wrapper (D-04/D-05), an in-memory guest rate limiter (D-05), the exported `UserContext` type contract, the auth-context test fixture, and the D-08 user-facing secret-redaction lock — all proven by 7 passing tests.

## What Was Built

- **Task 2** — Installed `vitest@^4.1.8`, `@vitejs/plugin-react@^6.0.2`, `vite-tsconfig-paths@^6.1.1` (dev) and `rate-limiter-flexible@^11.1.0` (runtime). Created `vitest.config.mts` (node env, tsconfigPaths + react plugins). Added `"test": "vitest run"` script, folded it into `check` between typecheck and build, and added a `Test` CI step between Typecheck and Build. Committed only `package-lock.json` (CI uses `npm ci`); `pnpm-lock.yaml` left untouched.
- **Task 3** — Exported `UserContext` type seam from `auth.ts` (`Awaited<ReturnType<typeof getUserContext>>`, no runtime change). Built `withAuth(options, handler)`: 401 when no session and `!allowGuest`, calls handler with guest context when `allowGuest`, 403 when an authenticated role is outside `options.roles`, otherwise calls the handler with the resolved context. Reuses `context.role` (already runs `resolveDashboardAccessRole`) — never re-derives role. Built `consumeGuestRateLimit(key)` on `RateLimiterMemory` returning `{ allowed, remainingPoints, msBeforeNext }`. Added `makeUserContext` / `makeGuestContext` fixtures typed to each branch of the `UserContext` discriminated union.
- **Task 4** — Locked D-08 on the user-facing surface: added an explicit comment at the `getSettingsSnapshot` boundary ("never return raw secret_value"); confirmed the snapshot returns presence booleans only; verified the existing admin-only WRITE guard at `src/app/actions/settings.ts:83` (unchanged). Added a test proving (1) the snapshot never ships the raw secret for any role and (2) `getGeminiRuntimeConfig` still returns a working portal `apiKey` for a non-admin/guest with no role gate.

## D-08 Scope Note (explicit per plan output requirement)

D-08 is enforced on the **user-facing surface only** (`getSettingsSnapshot` / settings UI returns booleans, never the raw `secret_value`). `getGeminiRuntimeConfig` — the server-only runtime read — **remains ungated**: it does not call `getUserContext()` and is not role-gated, so guest/non-admin AI calls (D-05, e.g. mi-jornada AI) keep receiving a working portal Gemini key. The direct-PostgREST column exposure is the accepted bounded window (D-01) closed at cutover; the app layer's job is only to never leak the secret itself, which it does not.

## Test Coverage

- `with-auth.test.ts` (5 green): 401 no-session, guest pass, 403 under-priv, ctx pass-through, rate-limit block (allows N, blocks N+1).
- `settings-secret.test.ts` (2 green): snapshot exposes no raw secret for any role; runtime read still returns a working key for a non-admin/guest.
- `npm run test` → 2 files, 7 tests, exit 0. `tsc --noEmit` clean.

## Deviations from Plan

None — plan executed as written.

Task 1 (blocking-human checkpoint for `rate-limiter-flexible` legitimacy) was pre-resolved by the orchestrator with the operator: "approved: rate-limiter-flexible, in-memory store". `rate-limiter-flexible@^11.1.0` confirmed genuine (animir/node-rate-limiter-flexible, ISC, zero deps). Installed the real package and used `RateLimiterMemory` (in-memory). No durable store requested; no descope to a hand-rolled `Map`.

## Notes

- The `vite-tsconfig-paths` plugin prints an informational notice (Vite now supports native tsconfig path resolution). Left as-is to follow the verbatim Next.js Vitest guide config; not an error.
- `npm install` reported pre-existing audit advisories in the transitive dev dependency tree — out of scope for this plan (not introduced by the task's direct deps); not addressed.

## Self-Check: PASSED

- FOUND: vitest.config.mts, src/lib/api/with-auth.ts, src/lib/api/rate-limit.ts, src/test/fixtures/user-context.ts, src/lib/api/__tests__/with-auth.test.ts, src/lib/__tests__/settings-secret.test.ts
- FOUND commits: 5bc6e03 (Task 2), f66e728 (Task 3 RED), 4af5925 (Task 3 GREEN), ad7f05c (Task 4)
- `export type UserContext` present in auth.ts; `export function withAuth` present; `consumeGuestRateLimit` exported.
