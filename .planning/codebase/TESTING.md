# Testing Patterns

**Analysis Date:** 2026-06-03

## Test Framework

**Runner:**
- None. No test runner is installed or configured.
- No `jest.config.*`, `vitest.config.*`, `playwright.config.*`, or any test config exists in the repository.
- `package.json` has no `test` script. Scripts are limited to `dev`, `build`, `start`, `lint`, `typecheck`, `check`, and `import:csv`.

**Assertion Library:**
- None.

**Run Commands:**
```bash
# No test commands exist. The closest "verification" gate is:
npm run check          # runs: lint && typecheck && build
npm run lint           # eslint .
npm run typecheck      # tsc --noEmit
```

## Current Quality Gates (in lieu of tests)

There is **zero automated test coverage**. Quality is currently enforced exclusively through static analysis and a successful production build:

- **Lint** — `eslint .` using `eslint-config-next` (`eslint.config.mjs`).
- **Typecheck** — `tsc --noEmit` with `strict: true` (`tsconfig.json`).
- **Build** — `next build` must succeed.
- **CI** — `.github/workflows/ci.yml` runs Checkout → Setup Node 20 → `npm ci` → `npm run lint` → `npm run typecheck` → `npm run build` on push to `main`/`master` and on every PR. **There is no test step in CI.**
- **Definition of Done** (`CONTRIBUTING.md`) requires `npm run check` to pass and authorization changes to be manually verified ("verify both allowed and denied paths") — but this is a manual, not automated, expectation.

## Test File Organization

**Location:**
- Not applicable — no test files exist. No `*.test.*`, `*.spec.*`, `__tests__/`, or `tests/` directories are present.

**Naming:**
- No convention established.

**Structure:**
- None.

## Test Structure

Not applicable. No test suites exist.

## Mocking

Not applicable. No mocking framework or fixtures exist.

**Note for future test work:** The codebase has clear seams that would make mocking straightforward when tests are introduced:
- Supabase access is centralized behind factory functions: `createSupabaseServerClient()` (`src/lib/supabase/server.ts`), browser/admin/middleware clients in `src/lib/supabase/`. These are the primary boundaries to stub.
- Environment is read through a single `appEnv` object and `isSupabaseConfigured` flag (`src/lib/env.ts`).
- External AI calls (Gemini) are isolated in `src/app/api/ai/*` route handlers and `src/lib/settings.ts` (`getGeminiRuntimeConfig`).

## Fixtures and Factories

**Test Data:**
- No test fixtures. The only data-import tooling is the operational CSV importer under `tools/import/` (`npm run import:csv`), which is not a test fixture.
- Database seed data lives in `supabase/seed.sql`.

**Location:**
- Not applicable.

## Coverage

**Requirements:** None enforced. No coverage tooling configured.

**View Coverage:**
```bash
# Not available.
```

## Test Types

**Unit Tests:** None. Pure, side-effect-free helpers in `src/lib/utils.ts` (`normalizeText`, `pickFirstString`, `sanitizePhone`, `buildWhatsAppUrl`, `ensureErrorMessage`, `maybeNull`, `toTitleCase`) and `src/lib/date.ts` (`buildKickoffAt`) are the most testable units and would be the natural starting point.

**Integration Tests:** None. Server Actions (`src/app/actions/*.ts`) and API routes (`src/app/api/**/route.ts`) — especially the `zod`-validated AI/intake routes and authorization paths (`requireEditor`, `requireUserContext` in `src/lib/auth.ts`) — are untested.

**E2E Tests:** Not used. No Playwright/Cypress present.

## Common Patterns

**Async Testing:**
- No established pattern.

**Error Testing:**
- No established pattern. The centralized `ensureErrorMessage` helper and the Server Action try/catch + `redirectWithNotice` flow (`src/app/actions/helpers.ts`) are the behaviors a future suite would most need to cover.

## Recommendations for Introducing Tests

When adding a test suite, align with the existing stack (Next.js 16, React 19, TypeScript strict, ESM):
1. **Vitest** fits the ESM/TS setup with minimal config; add a `test` script and a CI step in `.github/workflows/ci.yml`.
2. Start with **unit tests** for the pure helpers in `src/lib/utils.ts` and `src/lib/date.ts` — fast, deterministic, high value.
3. Add **integration tests** for `zod` request schemas in `src/app/api/ai/*` and for authorization guards in `src/lib/auth.ts`, mocking the Supabase client factories in `src/lib/supabase/`.
4. Consider **Playwright** for critical auth/login and grid flows if E2E coverage is later prioritized.
5. Co-locate tests next to source as `*.test.ts` to match the flat, explicit-path module style (no barrel files).

---

*Testing analysis: 2026-06-03*
