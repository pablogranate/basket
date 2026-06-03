# Phase 2: RLS Removal & Guard Coverage Audit - Context

**Gathered:** 2026-06-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Move **all** portal authorization out of Postgres RLS into app-layer, fail-closed guards, and move actor-stamping (`created_by`/`changed_by`/audit) out of `auth.uid()` DB triggers into the app — so removing RLS opens no doors. This phase runs while Supabase Auth is still live, against the existing app, so guards can be verified end-to-end.

Deliverables (the four ROADMAP success criteria are FIXED — this discussion decides HOW, not WHAT):

1. Every data path — server actions, all API route handlers (incl. `api/ai/*` and `api/matches/intake`), and read loaders (`lib/data/*`, `(dashboard)/people`) — enforces access via an app-layer guard that fails closed; no path relies on RLS.
2. Automated tests assert each API route returns 401/403 without a session and 403 for an under-privileged role, and that a non-admin cannot read `app_settings.secret_value`.
3. Supabase RLS is no longer the authorization backstop: Supabase used as plain Postgres, the service-role client confined to `server-only` modules, and `(dashboard)/people` no longer reads via the admin client.
4. Actor stamping is written from the app layer; triggers no longer call `auth.uid()`; post-write `audit_log.changed_by` is populated (never NULL).

**Key reframe surfaced during discussion:** the app is already fully server-mediated — `src/lib/supabase/browser.ts` is dead (imported nowhere) and no client component runs `.from(...)`. RLS today is not protecting the *app*; it protects the **Supabase PostgREST data API**, which any holder of a valid Supabase session JWT + the public anon key can hit directly (`/rest/v1/<table>`), entirely outside the app's guards. App-layer guards do nothing for that path. Dropping RLS while Supabase Auth still issues JWTs therefore opens PostgREST to any authenticated user for the migration window — a tradeoff the user explicitly accepted (see D-01).

</domain>

<decisions>
## Implementation Decisions

### RLS Removal Scope & Sequencing
- **D-01:** **Drop RLS this phase** — `DROP POLICY` on all tables + `DISABLE ROW LEVEL SECURITY` so Supabase becomes plain Postgres (satisfies criterion 3). The user **accepts the bounded PostgREST exposure window**: while Supabase Auth is still live, any logged-in user could query PostgREST directly. Justified as low-risk for an internal staff tool on a short migration window with trusted users (chose option (c) over deferring the drop or revoking data-API grants).
- **D-02:** **The destructive migration lands LAST.** Order within the phase is non-negotiable: (1) add all app-layer guards, (2) move actor stamping to the app, (3) verify guards (tests + manual) — *then* (4) the migration that drops RLS policies AND the `auth.uid()` triggers. The app must never have both RLS and app-side stamping absent at the same time, and `audit_log.changed_by` must never go NULL mid-phase.
- **D-03:** RLS removal explicitly includes dropping/replacing the `auth.uid()`-based DB triggers (`set_row_metadata`, `log_audit_event` in `supabase/migrations/0001_initial.sql`) — see D-08.

### Guard Placement & Fail-Closed Default
- **D-04:** **API routes (`src/app/api/**/route.ts`) get a shared `withAuth(role)` higher-order wrapper.** The wrapper resolves user context, returns **401** with no session and **403** for an under-privileged role, then calls the inner handler with the resolved context. This makes the default safe — an unwrapped route is obviously wrong in review (vs today's silently-open `ai/*`). Locked approach (CONCERNS.md recommends it).
- **D-05:** **Guest-allowed AI routes** (`/api/ai/metric-capture`, `/api/ai/section` under `ALLOW_GUEST_MI_JORNADA`) use `withAuth({ allowGuest: true })` and MUST get rate limiting (existing noted gap — guest-reachable paid Gemini calls).
- **D-06:** **Data loaders (`src/lib/data/*`) stay PURE.** They receive the resolved user context as a typed, non-optional argument; the guard runs **once at the RSC page / route boundary** and passes context down. Loaders remain unit-testable (pass a fake context) and never couple to `cookies()`. (Chose "boundary guard + pure loaders" over inside-loader guards.)
- **D-07:** **CI-enforced guard-coverage test (structural fail-closed).** An automated test enumerates every `api/*` route and every `src/lib/data/*` loader and asserts a guard/wrapper is present (route wrapped in `withAuth`; loader requires a context arg). A forgotten guard fails CI rather than shipping open. This closes the one weakness of the by-convention boundary-guard model (D-06) — the combination is stronger than inside-loader guards.

### Folded consequences (resolved under D-04/D-06)
- **D-08:** **`app_settings.secret_value` (the Gemini key) protection** — once RLS is gone, any server read returns the secret. Protect at the app layer: only the `admin` role may read `secret_value`; the runtime server-only read (`getGeminiRuntimeConfig`) stays server-side; non-admin reads are denied (criterion 2 has an explicit test for this). The CRITICAL leak in CONCERNS.md (any authenticated user could read it) is closed by app-layer gating, not RLS.
- **D-09:** **`(dashboard)/people/page.tsx` stops importing the admin client.** It currently uses `createSupabaseAdminClient()` at render to list auth users. Replace with a guarded server path using the normal server client (e.g. read `profiles`), so the page no longer reaches the service-role client (criterion 3). The service-role `admin.ts` stays confined to `server-only` mutation modules (e.g. creating auth users inside `people.ts` actions remains a legitimate service-role use).

### Claude's Discretion (constrained by criteria — not deep-dived this session)
- **Actor stamping mechanism (criterion 4):** app-side stamping is required and triggers must stop using `auth.uid()`. The *mechanism* — explicit `created_by`/`changed_by` columns set in every app write (via a shared helper) vs. a server-set Postgres session GUC that a rewritten trigger reads — is left to research/planning. Hard constraint: `audit_log.changed_by` populated (never NULL) on every app write.
- **Test runner choice (criterion 2):** no runner exists today (`package.json` `check` = lint + typecheck + build only). A runner must be introduced. Choice (Vitest for unit + route-handler tests; Playwright for smoke) and the technique for asserting 401/403 without a live Supabase session (mocked context vs real test DB) are planner/researcher discretion. The mandatory tests are: per-route 401 (no session) / 403 (under-privileged role), and non-admin denied reading `secret_value`. The D-07 coverage test rides on whatever runner is chosen.
- **Exact wrapper API shape** (`withAuth` signature, role-set semantics, how context is typed/passed into loaders), and the precise SQL of the teardown migration — planner/executor decide within the constraints above.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap & requirements
- `.planning/ROADMAP.md` § "Phase 2: RLS Removal & Guard Coverage Audit" — goal + 4 fixed success criteria. Also the milestone intro (lines ~5) on why RLS removal precedes cutover.
- `.planning/REQUIREMENTS.md` — AUTHZ-01 (app-layer guards on every data path), AUTHZ-02 (RLS reliance removed; Supabase as plain Postgres), AUTHZ-03 (actor stamping moved to app).
- `.planning/PROJECT.md` § Constraints + Key Decisions — "per-app access gates enforced in databaseHooks; portal authorization moves fully to the app layer once RLS is dropped"; "service-role/admin DB access stays server-only".

### Codebase audit (read first — the threat surface for this phase)
- `.planning/codebase/CONCERNS.md` — Security Considerations section is the canonical inventory: CRITICAL `app_settings.secret_value` global read (D-08), HIGH unguarded/guest `api/ai/*` routes (D-04/D-05), MEDIUM "authz only in middleware + server actions, not per-route" (motivates `withAuth`), plus the "entire codebase untested" gap (motivates the test work + D-07).
- `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/CONVENTIONS.md` — layered-authz model, naming/style conventions guards + tests must follow.

### Prior phase context
- `.planning/phases/01-shared-identity-database/01-CONTEXT.md` — Phase 1 stood up the separate `basket_auth` store; this phase does NOT touch it. Confirms Better Auth wiring is Phase 3, not here.

### Key implementation files (from codebase scout — anchors for planning)
- Guards: `src/lib/auth.ts` (`getUserContext`/`requireUserContext`/`requireEditor`), `src/lib/auth-access.ts` (`requireAdminAccessManager`), role resolution in `src/lib/constants.ts` (`resolveDashboardAccessRole`).
- Routes to wrap: `src/app/api/**/route.ts` — unguarded today: `ai/metric-capture`, `ai/people`, `ai/section`, `ai/speedtest`, `matches/intake`.
- Loaders to make pure + boundary-guard: `src/lib/data/dashboard.ts`, `src/lib/data/collaborators.ts`, `src/lib/data/announcements.ts`.
- Admin-client read to remove: `src/app/(dashboard)/people/page.tsx` (imports `createSupabaseAdminClient`).
- Service-role client (keep server-only): `src/lib/supabase/admin.ts`.
- RLS + stamping to tear down: `supabase/migrations/0001_initial.sql` (`current_app_role`/`can_read`/`can_edit`, `set_row_metadata`, `log_audit_event`, all table policies/triggers), `0003_add_operator_roles.sql`, `0007_add_collaborator_reports.sql`, `0008_add_app_settings.sql`.
- Middleware: `src/lib/supabase/middleware.ts` (`ALLOW_GUEST_MI_JORNADA` whitelist, lines ~68-72).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/auth.ts` guard helpers already implement the role-resolution + throw/redirect pattern (`requireEditor` throws, `requireUserContext` redirects to `/login`). `withAuth` (D-04) wraps these for routes; loaders (D-06) accept the context these produce.
- `src/lib/constants.ts` `resolveDashboardAccessRole` / `isCollaboratorLimitedRole` — the single source of effective role; guards must use it, never read role from one source.
- `src/lib/supabase/admin.ts` already uses `import "server-only"` — the precedent for confining service-role access (D-09).

### Established Patterns
- Server actions already call `requireEditor`/`requireAdminAccessManager` consistently — the write path is the model the read path (loaders/routes) must reach. The gap is reads + `api/*`, not actions.
- App is fully server-mediated (browser Supabase client unused) — no client-side DB access to re-guard; all enforcement points are server entrypoints (RSC pages, actions, route handlers).
- Conventions to follow for new code: kebab-case files, `type` over `interface`, `import type`, `@/*` alias, double quotes, `"use server"` on action modules, bracketed `console` prefixes for logging.

### Integration Points
- New: a `withAuth` wrapper module for `api/*` route handlers (returns 401/403 centrally).
- New: a test runner + config (none exists), the guard-coverage test (D-07), and the 401/403/role/secret-read tests (criterion 2). Wire test into `package.json` `check` + CI (`.github/workflows/ci.yml`).
- Changed: every `src/lib/data/*` loader signature gains a typed context arg; every RSC page/route guards at the boundary and passes it down.
- Changed: a teardown SQL migration in `supabase/migrations/` dropping policies + `auth.uid()` triggers, and app-side stamping wired into write paths (actions/routes) before that migration.
- No change to the Phase 1 `basket_auth` store, Better Auth (Phase 3), or the Supabase domain schema beyond policy/trigger teardown + any columns stamping needs.

</code_context>

<specifics>
## Specific Ideas

- "Drop now, accept window" — user is comfortable with a short, bounded direct-PostgREST exposure for an internal staff tool rather than a heavier connection-model change. Keep the teardown simple; don't re-architect the Supabase connection this phase.
- The coverage test (D-07) is the structural safety net the user specifically wanted — it's what makes the lighter "boundary guard + pure loaders" placement acceptable. Treat it as a first-class deliverable, not a nice-to-have.
- Sequencing discipline (D-02) matters more than the individual mechanisms: guards + stamping proven BEFORE the destructive migration.

</specifics>

<deferred>
## Deferred Ideas

- Revoking PostgREST table grants / moving the server connection to a privileged role (RLS-removal option (b)) — not done this phase; the direct-API exposure is closed naturally at cutover when Supabase Auth (and its JWTs) goes away.
- Better Auth instance + login methods + `profiles.auth_user_id` link — Phase 3 / Phase 4.
- Rotating the existing Gemini key (recommended in CONCERNS after fixing the read policy) — operational follow-up, not a code deliverable; note for the user post-phase.
- Broader refactors flagged in CONCERNS (oversized workspace components, intake Zod schema, revalidation fan-out) — out of scope; not authz.

None beyond the above — discussion stayed within phase scope.

</deferred>

---

*Phase: 2-rls-removal-guard-coverage-audit*
*Context gathered: 2026-06-03*
