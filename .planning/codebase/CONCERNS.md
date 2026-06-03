# Codebase Concerns

**Analysis Date:** 2026-06-03

This document captures technical debt, security risks, fragile areas, and gaps for the BASKET.TV production dashboard (Next.js 16 / React 19 / Supabase). Findings are ordered by severity within each section.

## Tech Debt

**No automated test suite:**
- Issue: There are zero test files in the repository (no `*.test.*`, `*.spec.*`, no Jest/Vitest/Playwright config). The `package.json` `check` script only runs `lint && typecheck && build`. CI (`.github/workflows/ci.yml`) likewise only lints, typechecks, and builds.
- Files: entire `src/` tree; `package.json`, `.github/workflows/ci.yml`
- Impact: Every change is verified only by the type checker and a successful build. Behavioral regressions (auth gating, report upsert logic, timezone math, RLS expectations) ship undetected. This is the single largest source of risk in the codebase.
- Fix approach: Introduce Vitest for unit tests on `src/lib/**` (pure logic: `incidents.ts`, `team-logos.ts`, `team-directory.ts`, `constants.ts`, settings resolution). Add Playwright for auth/role-gating smoke flows. Wire into the `check` script and CI.

**Oversized "workspace" components:**
- Issue: Several client components are far beyond a maintainable size and mix data shaping, state, and rendering.
- Files: `src/components/reports/reports-workspace.tsx` (3,295 lines), `src/components/incidents/incidents-workspace.tsx` (2,412 lines), `src/components/collaborators/my-day-assignments-panel.tsx` (1,751 lines), `src/components/grid/create-match-modal.tsx` (1,735 lines), `src/components/collaborators/collaborator-report-form.tsx` (1,441 lines)
- Impact: High cognitive load, difficult to review, hard to test, prone to merge conflicts. Logic and presentation are entangled.
- Fix approach: Extract pure data-transformation helpers into `src/lib/`, split sub-views into child components, and lift shared types. Target sub-500-line components.

**Inline payload normalization in API route:**
- Issue: `src/app/api/matches/intake/route.ts` hand-rolls deep path extraction (`getPathValue`), date/time normalization, and shape coercion against an unknown external API with no Zod schema.
- Files: `src/app/api/matches/intake/route.ts`
- Impact: Fragile against external API shape changes; silent empty-string fallbacks mean malformed upstream data is accepted as "valid but blank."
- Fix approach: Define a Zod schema for the expected external payload and validate before normalization; surface parse failures explicitly.

**Migration-gap defensive code scattered through runtime:**
- Issue: Multiple runtime paths special-case Postgres error `42P01` ("relation does not exist") to tell the user to "apply migration 000X" — e.g. `src/app/api/collaborator-reports/route.ts`, `src/app/actions/settings.ts` (`isMissingAppSettingsError`).
- Files: `src/app/api/collaborator-reports/route.ts:162`, `src/app/actions/settings.ts:27-38,99,115`
- Impact: Indicates schema/code drift is expected at runtime rather than enforced at deploy. Adds branching that must be maintained per table.
- Fix approach: Gate deploys on migrations being applied (migration check in CI/release) and remove the per-table `42P01` handling.

## Known Bugs

**No confirmed runtime bugs identified** during this pass. The codebase is clean of `TODO`/`FIXME`/`HACK`/`XXX` markers and `@ts-ignore`/`eslint-disable` suppressions, and uses no `any` types. Areas most likely to harbor latent bugs are the oversized workspace components (untested) and the external-intake normalization (see Tech Debt).

## Security Considerations

**CRITICAL — Global Gemini API key readable by any authenticated user:**
- Risk: The `app_settings` table stores the shared portal Gemini API key in the `secret_value` column. Its row-level SELECT policy is `using (public.can_read())`, and `can_read()` is defined as `select auth.role() = 'authenticated'` (`supabase/migrations/0001_initial.sql:177-183`). Therefore ANY authenticated user (including a low-privilege `collaborator` or guest with a session) can run `select secret_value from app_settings` directly against Supabase and exfiltrate the shared API key. Only INSERT/UPDATE/DELETE are admin-gated.
- Files: `supabase/migrations/0008_add_app_settings.sql:27-30`, `supabase/migrations/0001_initial.sql:177-183`, `src/lib/settings.ts:54-73`
- Current mitigation: None at the data layer. The server reads it via `getGeminiRuntimeConfig()`, but RLS does not restrict reading the secret column.
- Recommendations: Change the `app_settings_read` policy to `using (public.current_app_role() = 'admin')`, OR split secrets into a separate table/columns that only the service role can read, OR exclude `secret_value` from any client-reachable read. Rotate the existing Gemini key after fixing.

**HIGH — AI endpoints have no per-request authorization and some are guest-exposed:**
- Risk: `src/app/api/ai/metric-capture/route.ts`, `src/app/api/ai/section/route.ts`, `src/app/api/ai/people/route.ts`, and `src/app/api/ai/speedtest/route.ts` perform no `getUserContext()` / role check inside the handler — they rely entirely on middleware. Worse, `ALLOW_GUEST_MI_JORNADA` explicitly whitelists `/api/ai/metric-capture` and `/api/ai/section` for unauthenticated guests (`src/lib/supabase/middleware.ts:68-72`). These routes call the paid Gemini API on each request.
- Files: `src/app/api/ai/metric-capture/route.ts:75`, `src/app/api/ai/section/route.ts`, `src/app/api/ai/people/route.ts`, `src/app/api/ai/speedtest/route.ts`, `src/lib/supabase/middleware.ts:68-72`
- Current mitigation: Middleware auth for non-guest routes; image MIME/type and Zod `kind` validation in metric-capture.
- Recommendations: Add explicit auth (and where appropriate role) checks inside each AI handler. Add rate limiting / abuse protection on guest-reachable AI endpoints to cap Gemini cost exposure. Re-evaluate whether guest access to AI endpoints is needed at all.

**MEDIUM — Gemini API key transmitted in URL query string:**
- Risk: `src/app/api/ai/metric-capture/route.ts:124` builds the Gemini request as `...:generateContent?key=${apiKey}`. API keys in URLs are more prone to leaking via proxy logs, error logs, and referrers than header-based auth.
- Files: `src/app/api/ai/metric-capture/route.ts:124` (and analogous AI routes)
- Current mitigation: Server-side only fetch.
- Recommendations: Pass the key via the `x-goog-api-key` header instead of the query string.

**MEDIUM — Authorization is enforced only in middleware + server actions, not centrally per route by role:**
- Risk: `src/lib/supabase/middleware.ts` resolves the user's `role` but only uses it to redirect away from `/login`; it does NOT restrict dashboard routes by role. Route-level authorization depends on each server action calling `requireEditor()` / `requireAdminAccessManager()` and each page calling `requireUserContext()`. This is consistently applied in `src/app/actions/matches.ts`, `people.ts`, `roles.ts`, but it is an opt-in pattern: any new action or API route that forgets the guard is silently unprotected (as the AI routes demonstrate).
- Files: `src/lib/supabase/middleware.ts:53-66,94-98`, `src/app/actions/*.ts`
- Current mitigation: RLS at the database layer is the real backstop (most tables gate writes via `can_edit()` / `current_app_role()`).
- Recommendations: Document the mandatory "every action/route must guard" rule (see CONVENTIONS.md), and consider a shared `withAuth(role)` wrapper for API route handlers to make the default safe.

**LOW — `secret_value` is audit-logged on every change:**
- Risk: `app_settings` has an `app_settings_audit` trigger (`log_audit_event`) firing on insert/update/delete. If the audit log captures full row data, the Gemini key may be persisted in plaintext in the audit table.
- Files: `supabase/migrations/0008_add_app_settings.sql:22-25`
- Current mitigation: Unknown without inspecting the audit function body.
- Recommendations: Verify `log_audit_event` does not record `secret_value`, or exclude secret columns from audit payloads.

## Performance Bottlenecks

**Aggressive broad revalidation on writes:**
- Problem: Write paths call `revalidatePath` for many routes at once. `src/app/api/collaborator-reports/route.ts:184-189` revalidates 6 paths per report submission; `src/app/actions/settings.ts` revalidates the settings + 5 announcement paths + `/people` + `/teams` on a single Gemini-settings save (lines 127-132). ~34 `revalidatePath` calls exist across actions/routes.
- Files: `src/app/api/collaborator-reports/route.ts:184-189`, `src/app/actions/settings.ts:127-132`
- Cause: Defensive cache busting to keep dashboards in sync.
- Improvement path: Scope revalidation to the routes actually affected; consider tag-based revalidation (`revalidateTag`) for shared data sets instead of path fan-out.

**Per-assignment processing loops in dashboard aggregation:**
- Problem: `src/lib/data/dashboard.ts` iterates assignment rows in a `for` loop (line 563) after fetching people/assignments. As assignment volume grows this becomes linear per render of dashboard aggregates.
- Files: `src/lib/data/dashboard.ts:531-563`
- Cause: In-memory join/aggregation of separately fetched result sets.
- Improvement path: Push aggregation into SQL (views or RPC) where the dataset is large; the current code does correctly batch the initial fetches with `Promise.all`.

## Fragile Areas

**External match-intake normalization:**
- Files: `src/app/api/matches/intake/route.ts`
- Why fragile: Tolerates many alternate field names and silently returns empty strings for anything it cannot map; no schema contract with the upstream API; the upstream URL is optional (`MATCH_LOOKUP_API_URL`) so behavior differs sharply between configured/unconfigured environments.
- Safe modification: Add a Zod schema and explicit failure surfacing before changing field mappings.
- Test coverage: None.

**Collaborator demo / trial-access path:**
- Files: `src/lib/data/collaborators.ts:455-572,680`
- Why fragile: Generates synthetic `trial-*` assignment IDs and demo kickoff timestamps when a user has no real assignments (`trialAccess: assignmentsForMatch.length === 0`). The report-submission API correctly rejects non-UUID assignment IDs (`src/app/api/collaborator-reports/route.ts:80-85`), but the demo/real branching is implicit and easy to break.
- Safe modification: Keep the `isUuidLike` guard intact; add tests asserting trial access can never write a real report.
- Test coverage: None.

**Hardcoded timezone defaults:**
- Files: `src/lib/constants.ts:11`, `src/lib/env.ts:5`, plus literal `-05:00` offsets in `src/lib/data/collaborators.ts:455`
- Why fragile: `America/Bogota` and a literal `-05:00` offset are baked into defaults and demo data. Mixing IANA timezone resolution (date-fns-tz) with literal offsets risks DST/offset drift if the app expands to other regions.
- Safe modification: Centralize all timezone handling on `appEnv.appTimezone` via date-fns-tz; remove literal offset strings.

## Scaling Limits

**Single shared portal Gemini key with no rate limiting:**
- Current capacity: One API key, used per AI request, with guest-reachable endpoints.
- Limit: Cost and quota are unbounded by the app — abuse of guest AI endpoints (or the leaked key, see Security) can exhaust quota/budget.
- Scaling path: Add per-user/per-IP rate limiting on AI routes and quota alerts on the Gemini key.

**In-memory aggregation for dashboards:**
- Current capacity: Adequate for current match/assignment volumes.
- Limit: Aggregation in `src/lib/data/dashboard.ts` is O(rows) in the Node process per request.
- Scaling path: Move heavy aggregation into Postgres views/RPC.

## Dependencies at Risk

**Bleeding-edge framework majors:**
- Risk: `next@16.1.6` and `react@19.2.3` / `react-dom@19.2.3` are very recent majors; the ecosystem (plugins, types, third-party components) may lag and introduce breaking churn.
- Impact: Upgrades and third-party compatibility may break the build; few community references for edge cases.
- Migration plan: Pin exact versions (already pinned for next/react), watch release notes, and rely on the `build` gate in CI to catch breakage early. Adding tests (see Tech Debt) materially reduces upgrade risk.

**`jspdf` + `jspdf-autotable` for report/grid export:**
- Risk: PDF generation (`src/components/grid/grid-export-button.tsx`, reports export) is a common source of layout regressions across library versions.
- Impact: Export output can silently degrade.
- Migration plan: Snapshot-test or visually verify exports on dependency bumps.

**Two lockfiles present:**
- Risk: Both `package-lock.json` and `pnpm-lock.yaml` exist in the repo (the latter untracked). CI uses `npm ci`.
- Impact: Contributors using pnpm vs npm can resolve different dependency trees than CI.
- Migration plan: Standardize on one package manager; remove the other lockfile and document the choice in CONTRIBUTING.md.

## Missing Critical Features

**No abuse protection / rate limiting:**
- Problem: No rate limiting on any API route, including guest-reachable AI endpoints that incur Gemini cost.
- Blocks: Safe public/guest exposure; cost control.

**No structured logging / observability:**
- Problem: Logging is ad hoc via `console.*` (~23 call sites; e.g. `src/app/api/ai/metric-capture/route.ts` info/warn/error, `src/lib/auth.ts` error). There is no error-tracking integration (Sentry, etc.).
- Blocks: Production triage; the only health signal is `src/app/api/health/route.ts`.

## Test Coverage Gaps

**Entire codebase is untested.** Highest-priority gaps:

- **Authorization gating** — `src/lib/auth.ts` (`requireEditor`, `requireUserContext`, role resolution) and middleware (`src/lib/supabase/middleware.ts`). Risk: privilege escalation / unprotected routes ship unnoticed. Priority: High.
- **RLS expectations** — the `app_settings` secret-read policy bug shows RLS is not validated against intent. Add integration tests asserting a non-admin cannot read `secret_value`. Priority: High.
- **Report submission flow** — `src/app/api/collaborator-reports/route.ts` (access checks, trial rejection, upsert shape). Priority: High.
- **External intake normalization** — `src/app/api/matches/intake/route.ts`. Priority: Medium.
- **Pure logic libs** — `src/lib/incidents.ts`, `src/lib/team-logos.ts`, `src/lib/team-directory.ts`, `src/lib/club-catalog.ts`, settings resolution in `src/lib/settings.ts`. Easiest to cover first. Priority: Medium.
- **Oversized workspace components** — `reports-workspace.tsx`, `incidents-workspace.tsx`. Risk: large untested surfaces. Priority: Medium (extract logic first to make testable).

---

*Concerns audit: 2026-06-03*
