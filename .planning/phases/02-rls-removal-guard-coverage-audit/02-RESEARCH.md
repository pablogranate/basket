# Phase 2: RLS Removal & Guard Coverage Audit - Research

**Researched:** 2026-06-03
**Domain:** App-layer authorization (Next.js 16 App Router), Supabase RLS/trigger teardown, test-runner introduction (Vitest)
**Confidence:** HIGH (codebase facts verified by direct read; Vitest/Next.js facts verified against official docs + npm)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Drop RLS this phase — `DROP POLICY` on all tables + `DISABLE ROW LEVEL SECURITY` so Supabase becomes plain Postgres. User **accepts the bounded PostgREST exposure window** (any logged-in user could query PostgREST directly while Supabase Auth still issues JWTs). Justified: internal staff tool, short migration window, trusted users. Chose drop-now over deferring or revoking data-API grants.
- **D-02:** The destructive migration lands **LAST**. Order is non-negotiable: (1) add all app-layer guards, (2) move actor stamping to the app, (3) verify guards (tests + manual), **then** (4) the migration dropping RLS policies AND the `auth.uid()` triggers. The app must never have both RLS and app-side stamping absent simultaneously; `audit_log.changed_by` must never go NULL mid-phase.
- **D-03:** RLS removal includes dropping/replacing the `auth.uid()`-based triggers (`set_row_metadata`, `log_audit_event`).
- **D-04:** API routes (`src/app/api/**/route.ts`) get a shared `withAuth(role)` higher-order wrapper. Resolves user context, returns **401** with no session and **403** for under-privileged role, then calls the inner handler with resolved context. Unwrapped route = obviously wrong in review.
- **D-05:** Guest-allowed AI routes (`/api/ai/metric-capture`, `/api/ai/section` under `ALLOW_GUEST_MI_JORNADA`) use `withAuth({ allowGuest: true })` and MUST get rate limiting.
- **D-06:** Data loaders (`src/lib/data/*`) stay PURE — receive resolved user context as a typed, non-optional argument; guard runs **once at the RSC page / route boundary** and passes context down. Loaders never couple to `cookies()`.
- **D-07:** CI-enforced guard-coverage test (structural fail-closed). Enumerates every `api/*` route and every `src/lib/data/*` loader, asserts a guard/wrapper is present. A forgotten guard fails CI.
- **D-08:** `app_settings.secret_value` (Gemini key) — only the `admin` role may read it at the app layer. Runtime server-only read (`getGeminiRuntimeConfig`) stays server-side; non-admin reads denied. Explicit test required.
- **D-09:** `(dashboard)/people/page.tsx` stops importing the admin client. Replace the service-role read (listing auth users) with a guarded normal-server-client path. Service-role `admin.ts` stays confined to `server-only` mutation modules.

### Claude's Discretion (research recommendations in this doc)
- **Actor stamping mechanism (AUTHZ-03):** explicit `created_by`/`changed_by` columns set in every app write (shared helper) **vs.** a server-set Postgres session GUC a rewritten trigger reads. Hard constraint: `audit_log.changed_by` never NULL. → **This doc recommends the explicit-columns + app-written-audit approach. See "Actor Stamping" decision.**
- **Test runner choice (AUTHZ criterion 2):** no runner today. → **This doc recommends Vitest (unit + route-handler) and defers Playwright. See "Validation Architecture".**
- **Exact `withAuth` API shape** and precise teardown SQL. → **Sketched in "Code Examples" and "RLS + Trigger Teardown Surface".**

### Deferred Ideas (OUT OF SCOPE)
- Revoking PostgREST table grants / moving the server connection to a privileged role (closed naturally at cutover when Supabase Auth goes away).
- Better Auth instance + login methods + `profiles.auth_user_id` link (Phase 3/4).
- Rotating the existing Gemini key (operational follow-up; note for user post-phase).
- Broader CONCERNS refactors (oversized workspace components, intake Zod schema, revalidation fan-out) — not authz.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AUTHZ-01 | Every data path (server actions, API route handlers incl. `ai/*` and `matches/intake`, data loaders) enforces access via app-layer guards | `withAuth` HOF for routes (D-04); pure-loader + boundary-guard model (D-06); guard-coverage test enumerating the full surface (D-07). Existing `requireEditor`/`requireUserContext` reused. The exact route inventory below. |
| AUTHZ-02 | Supabase RLS reliance removed; Supabase used as plain Postgres | Full teardown surface enumerated below (policies across 0001/0003/0004/0006/0007/0008/0009 + helper functions `can_read`/`can_edit`/`current_app_role`). `(dashboard)/people` stops using admin client (D-09). |
| AUTHZ-03 | Actor stamping (`created_by`/`changed_by`/audit) moved to app layer (no longer `auth.uid()`) | **Critical finding:** app code currently sets NO `created_by`/`updated_by`/audit values — the `set_row_metadata` + `log_audit_event` triggers do it via `auth.uid()`. Dropping them requires a new app-side stamping helper + app-written audit. Recommended mechanism + the full write-path inventory below. |
</phase_requirements>

## Summary

This phase moves portal authorization from Postgres RLS into fail-closed app-layer guards, and moves actor stamping out of `auth.uid()` DB triggers into the app. The codebase is already fully server-mediated (no client `.from()` calls; `browser.ts` is dead), so every enforcement point is a server entrypoint: RSC pages, server actions, and route handlers. Server actions already guard consistently (`requireEditor`). **The real gaps are reads (loaders/pages) and `api/*` routes** — specifically the unguarded AI routes, `matches/intake`, and the admin-client read in `(dashboard)/people`.

The single most important, easily-missed finding: **app write code today sets none of `created_by`/`updated_by`/audit — the `set_row_metadata` and `log_audit_event` triggers do it entirely via `auth.uid()`.** `createMatchAction` etc. call `requireEditor()` but the insert payload has no `created_by`. The moment D-02 step (4) drops those triggers, every write loses its actor stamp and `audit_log` stops being populated. AUTHZ-03 is therefore not a small refactor — it requires a shared stamping helper wired into every write path AND app-written audit rows, all landing BEFORE the teardown migration (D-02 sequencing). This is the highest-risk part of the phase.

Two routes already model the target read-guard pattern (`api/team-logo`, `api/grid/calendar` both call `getUserContext()` and return 401). `withAuth` (D-04) generalizes exactly that. Vitest is the right runner: route handlers and pure loaders are plain async functions and test cleanly; the one Vitest limitation (async RSC pages unsupported) does not bite us because D-06 deliberately moves all testable logic into pure loaders and the guard into `withAuth`.

**Primary recommendation:** Build `src/lib/api/with-auth.ts` (the route HOF) and `src/lib/audit.ts` (app-side stamping + audit writer) first; thread a typed `UserContext` arg into every `lib/data/*` loader; introduce Vitest with a structural guard-coverage test (D-07) and per-route 401/403 + secret-read tests; land the destructive teardown migration LAST.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Authentication (is there a session?) | API/Backend (server) | — | Resolved server-side via `getUserContext` reading Supabase cookies; no client involvement (app is fully server-mediated). |
| Authorization (role gate) | API/Backend (server actions, route handlers, RSC page boundary) | — | Moves fully app-side this phase; RLS removed as backstop. `withAuth` for routes, `requireEditor`/`requireUserContext` for actions/pages. |
| Actor stamping (`created_by`/`updated_by`) | API/Backend (write paths in actions + routes) | Database (columns persist) | Was DB trigger via `auth.uid()`; moves to a shared app helper that stamps the payload before write. |
| Audit logging (`audit_log`) | API/Backend (app-written rows) | Database (storage) | Was `log_audit_event` trigger (`security definer`, `auth.uid()`); moves to an app-side audit writer so `changed_by` is the app-resolved profile id. |
| Secret read (`app_settings.secret_value`) | API/Backend (server-only, admin-gated) | — | `getGeminiRuntimeConfig` stays server-side; add app-layer admin gate (D-08). |
| Data reads (domain queries) | API/Backend (pure loaders, guarded at boundary) | Database (plain Postgres) | Loaders stay pure (D-06); guard once at RSC/route boundary and pass context down. |
| Rate limiting (guest AI) | API/Backend (route handler / `withAuth`) | — | New concern (D-05); guest-reachable paid Gemini calls. |

## Standard Stack

This phase adds a **test runner** and a **rate limiter**. No runtime framework change.

### Core (new dev dependencies — test runner)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `vitest` | ^4.1.8 | Unit + route-handler test runner | [CITED: nextjs.org/docs/app/guides/testing/vitest] — the framework's officially-documented unit runner; fast, ESM-native, Vite-powered (matches Next 16). [VERIFIED: npm registry] latest 4.1.8. |
| `@vitejs/plugin-react` | ^6.0.2 | JSX/React transform for Vitest | [CITED: Next.js Vitest guide] required dev dep in the official manual setup. [VERIFIED: npm registry] |
| `vite-tsconfig-paths` | ^6.1.1 | Resolves the `@/*` → `src/*` alias inside tests | [CITED: Next.js Vitest guide] required for TypeScript path aliases (this repo uses `@/*` everywhere). [VERIFIED: npm registry] |
| `jsdom` | (latest) | DOM environment (only needed if any component/pure-DOM test is added) | [CITED: Next.js Vitest guide]. For this phase's route/loader tests, `node` environment is sufficient — see config note. |

### Supporting (new runtime dependency — rate limiting, D-05)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `rate-limiter-flexible` | ^11.1.0 | In-process (memory) rate limiting for guest AI routes | [VERIFIED: npm registry] Use the in-memory limiter for the bounded migration window — no Redis/Upstash dependency, fits "keep it simple, don't re-architect" (D-01 spirit). [ASSUMED] best-fit vs alternatives — confirm with user; a hand-rolled `Map`-based limiter is also acceptable for a single-instance internal tool. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Vitest | Jest | Jest needs more config for ESM + Next 16; Vitest is the framework-recommended path and shares Vite resolution. |
| Calling route `POST`/`GET` directly in tests | `next-test-api-route-handler` (^5.0.5) | NTARH emulates Next's full route resolution. Overkill here — our handlers are plain exported async functions taking a `Request`; calling them directly with a constructed `Request` is simpler and sufficient. [ASSUMED] direct-call is enough — validate when wiring the first test. |
| `rate-limiter-flexible` (memory) | `@upstash/ratelimit` (^2.0.8) + Redis | Upstash is durable/multi-instance but adds an external service. Deferred per scope ("don't re-architect the connection this phase"). |
| App-written audit rows | Keep a trigger but feed it a GUC | GUC trigger keeps audit in DB but reintroduces a DB-side dependency on a per-connection setting — fragile with pooled connections (see Pitfall 3). |

**Installation:**
```bash
npm install -D vitest@^4.1.8 @vitejs/plugin-react@^6.0.2 vite-tsconfig-paths@^6.1.1
npm install rate-limiter-flexible@^11.1.0
```

**Version verification (run before locking the plan):**
```bash
npm view vitest version
npm view @vitejs/plugin-react version
npm view vite-tsconfig-paths version
npm view rate-limiter-flexible version
```

## Package Legitimacy Audit

slopcheck was not available in this research session. All four packages are framework-blessed or widely-used, and three (`vitest`, `@vitejs/plugin-react`, `vite-tsconfig-paths`) are named directly in official Next.js docs — but per the package-provenance rule, packages discovered/confirmed without slopcheck + authoritative-doc verification are treated cautiously. The planner should gate the runtime dependency (`rate-limiter-flexible`) behind a `checkpoint:human-verify` before install; the three dev deps are verbatim from the official Next.js Vitest guide and are low-risk.

| Package | Registry | Source | npm `view` | slopcheck | Disposition |
|---------|----------|--------|-----------|-----------|-------------|
| `vitest` | npm | github.com/vitest-dev/vitest | 4.1.8 ✓ | n/a | Approved (official Next.js docs) |
| `@vitejs/plugin-react` | npm | github.com/vitejs/vite-plugin-react | 6.0.2 ✓ | n/a | Approved (official Next.js docs) |
| `vite-tsconfig-paths` | npm | github.com/aleclarson/vite-tsconfig-paths | 6.1.1 ✓ | n/a | Approved (official Next.js docs) |
| `rate-limiter-flexible` | npm | github.com/animir/node-rate-limiter-flexible | 11.1.0 ✓ | n/a | **Flagged [ASSUMED]** — planner adds `checkpoint:human-verify` before install; or descope to a hand-rolled `Map` limiter. |

**Packages removed due to [SLOP]:** none
**Packages flagged [SUS]:** none by slopcheck (unavailable); `rate-limiter-flexible` flagged here as [ASSUMED] for human verification.

## Architecture Patterns

### System Architecture Diagram

```text
                          ┌─────────────────────────────────────────────┐
  HTTP request ──────────▶│  middleware.ts (edge)                        │
                          │  - session refresh, coarse 401/redirect      │
                          │  - guest whitelist (ALLOW_GUEST_MI_JORNADA)  │
                          └───────────────┬─────────────────────────────┘
                                          │ (NOT the authz backstop anymore)
            ┌─────────────────────────────┼──────────────────────────────┐
            ▼                             ▼                              ▼
   ┌─────────────────┐         ┌────────────────────┐        ┌──────────────────────┐
   │  RSC page       │         │  API route handler │        │  Server action       │
   │  (boundary)     │         │  wrapped in        │        │  ("use server")      │
   │                 │         │  withAuth(role)    │        │                      │
   │ requireUser-    │         │  → 401 no session  │        │ requireEditor() /    │
   │ Context() /     │         │  → 403 under-priv  │        │ requireUserContext() │
   │ requireEditor() │         │  → ctx passed in   │        │ (already present)    │
   └────────┬────────┘         └─────────┬──────────┘        └──────────┬───────────┘
            │ ctx (typed, non-optional)  │ ctx                          │ ctx
            ▼                            ▼                              ▼
   ┌──────────────────────────────────────────────────────────────────────────────┐
   │  PURE data loaders  (src/lib/data/*)  — receive ctx arg, never read cookies()  │
   │  WRITE paths        — stampActor(ctx, payload) + writeAudit(ctx, ...)          │
   └───────────────────────────────────────┬──────────────────────────────────────┘
                                            ▼
                          ┌─────────────────────────────────────────────┐
                          │  Supabase = PLAIN POSTGRES (RLS dropped)     │
                          │  no policies, no auth.uid() triggers         │
                          │  created_by/updated_by/audit set BY THE APP  │
                          └─────────────────────────────────────────────┘

   ┌──────────────────────────────────────────────────────────────────────────────┐
   │  CI guard-coverage test (D-07): static-analyzes api/* + lib/data/* sources     │
   │  asserts every route is withAuth-wrapped and every loader takes a ctx arg      │
   └──────────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | File (new = N) |
|-----------|----------------|----------------|
| `withAuth(opts)` HOF | Resolve context, return 401/403, call inner handler with ctx | `src/lib/api/with-auth.ts` (N) |
| `stampActor` / audit writer | Set `created_by`/`updated_by` on payloads; write `audit_log` rows app-side | `src/lib/audit.ts` (N) |
| Rate limiter | Cap guest AI calls (D-05) | `src/lib/api/rate-limit.ts` (N) |
| Guard-coverage test | Static-assert every route/loader is guarded | `src/lib/api/__tests__/guard-coverage.test.ts` (N) |
| Teardown migration | Drop policies + `auth.uid()` triggers + helper fns | `supabase/migrations/0010_*.sql` (N) |
| `getUserContext` etc. | Unchanged source of identity+role | `src/lib/auth.ts` |
| Loaders | Gain a typed `ctx` param | `src/lib/data/{dashboard,collaborators,announcements}.ts` |

### Pattern 1: `withAuth` route wrapper (D-04/D-05)
**What:** A higher-order function wrapping a route handler. Resolves `getUserContext()`, enforces session + role, passes the resolved context to the inner handler.
**When to use:** Every `src/app/api/**/route.ts` export.

```typescript
// Source: pattern derived from existing src/lib/auth.ts + src/app/api/team-logo/route.ts (which
// already does getUserContext() → 401). Sketch — finalize signature in planning.
// src/lib/api/with-auth.ts
import { NextResponse } from "next/server";
import { getUserContext } from "@/lib/auth";
import type { AppRole } from "@/lib/database.types";

type UserContext = Awaited<ReturnType<typeof getUserContext>>;
type AuthedContext = UserContext & { userId: string };

type WithAuthOptions = {
  roles?: ReadonlyArray<AppRole>; // omit = any authenticated user
  allowGuest?: boolean;           // D-05: guest-reachable AI routes
};

type Handler = (
  request: Request,
  ctx: AuthedContext | UserContext, // guest path may have null userId
) => Promise<Response> | Response;

export function withAuth(options: WithAuthOptions, handler: Handler) {
  return async (request: Request): Promise<Response> => {
    const context = await getUserContext();

    if (!context.userId) {
      if (!options.allowGuest) {
        return NextResponse.json(
          { error: "Tu sesión no está activa para usar este endpoint." },
          { status: 401 },
        );
      }
      return handler(request, context); // guest allowed, no role check
    }

    if (options.roles && !options.roles.includes(context.role)) {
      return NextResponse.json(
        { error: "No tenes permisos para usar este endpoint." },
        { status: 403 },
      );
    }

    return handler(request, context as AuthedContext);
  };
}

// usage — src/app/api/ai/metric-capture/route.ts
export const POST = withAuth({ allowGuest: true }, async (request, ctx) => {
  // existing body; add rate limiting for guest path
});
// usage — src/app/api/ai/people/route.ts (no guest)
export const POST = withAuth({ roles: ["admin", "editor", "coordinator"] }, async (request, ctx) => { ... });
```

### Pattern 2: Pure loader + boundary guard (D-06)
**What:** Loaders take a typed, non-optional `ctx` argument; the RSC page guards once and passes it down.
**When to use:** Every `src/lib/data/*` export that currently calls `createSupabaseServerClient()` internally and is called from a page.

```typescript
// Before (src/lib/data/dashboard.ts): self-contained, no guard, creates its own client.
export async function getPeopleData(): Promise<PersonListItem[]> {
  const supabase = await createSupabaseServerClient();
  ...
}

// After: ctx is required; caller must have guarded. Loader stays unit-testable (pass a fake ctx).
import type { UserContext } from "@/lib/auth"; // export the type from auth.ts
export async function getPeopleData(ctx: UserContext): Promise<PersonListItem[]> {
  const supabase = await createSupabaseServerClient();
  // ctx available for any per-role filtering; presence of the arg is the structural guard signal (D-07)
  ...
}

// Caller — src/app/(dashboard)/people/page.tsx
const user = await requireUserContext(); // guard at boundary
const allPeople = await getPeopleData(user); // pass context down
```
**Note:** The loader still creates its own server client internally (cookies are read in the client factory, not passed). The "purity" D-06 wants is *not coupling authorization decisions to cookies* — the ctx arg is the contract, and the required arg is what the D-07 coverage test detects. Confirm with planner whether to also inject the supabase client for full testability, or accept that loaders are integration-tested against a test DB.

### Pattern 3: App-side actor stamping (AUTHZ-03)
**What:** A shared helper sets `created_by`/`updated_by` on every write payload, and a writer inserts `audit_log` rows from the app. Replaces the `set_row_metadata` + `log_audit_event` triggers.

```typescript
// src/lib/audit.ts (sketch)
import type { UserContext } from "@/lib/auth";

export function stampInsert<T extends Record<string, unknown>>(ctx: UserContext, payload: T) {
  const now = new Date().toISOString();
  return { ...payload, created_by: ctx.userId, updated_by: ctx.userId, created_at: now, updated_at: now };
}
export function stampUpdate<T extends Record<string, unknown>>(ctx: UserContext, payload: T) {
  return { ...payload, updated_by: ctx.userId, updated_at: new Date().toISOString() };
}
// audit write — must run on every domain mutation so audit_log.changed_by is never NULL
export async function writeAudit(supabase, ctx, args: {
  table: string; recordId: string; matchId?: string | null;
  action: "INSERT" | "UPDATE" | "DELETE"; before?: unknown; after?: unknown;
}) {
  await supabase.from("audit_log").insert({
    table_name: args.table, record_id: args.recordId, match_id: args.matchId ?? null,
    action: args.action, changed_by: ctx.userId, before: args.before ?? null, after: args.after ?? null,
  });
}
```

### Pattern 4: Structural guard-coverage test (D-07)
**What:** A test that reads source files (static analysis) and asserts each route/loader is guarded — not runtime introspection.
**When to use:** As a first-class CI gate.

```typescript
// src/lib/api/__tests__/guard-coverage.test.ts (sketch)
import { readFileSync } from "node:fs";
import { globSync } from "node:fs"; // or fast-glob; node 22+ has fs.globSync
import { describe, it, expect } from "vitest";

describe("guard coverage", () => {
  it("every api route is wrapped in withAuth", () => {
    const routes = globSync("src/app/api/**/route.ts");
    const offenders = routes.filter((f) => {
      const src = readFileSync(f, "utf8");
      if (f.endsWith("api/health/route.ts")) return false; // explicit allowlist
      return !src.includes("withAuth(");
    });
    expect(offenders).toEqual([]);
  });

  it("every data loader requires a context argument", () => {
    const loaders = globSync("src/lib/data/*.ts");
    // assert each exported async fn has a ctx/context parameter (regex on `export async function name(ctx`/`context`)
    // Keep an explicit allowlist for any intentionally context-free helper (e.g. isUuidLike).
  });
});
```
**Recommendation:** **Static source analysis** (read files + assert a marker like `withAuth(` is present, or parse with the TypeScript compiler API for robustness) over runtime introspection. Runtime introspection can't tell "called the guard" from "didn't" without executing every code path. A grep/AST check is deterministic, fast, and exactly the "forgotten guard fails CI" semantics the user wants. Maintain a small explicit allowlist (e.g. `api/health`) so intentional exceptions are visible in the diff.

### Anti-Patterns to Avoid
- **Guarding inside loaders** instead of at the boundary — couples loaders to `cookies()`, makes them untestable, and re-runs the role resolution N times per render. (D-06 chose boundary guards explicitly.)
- **Dropping triggers before app stamping is wired** — violates D-02; `audit_log.changed_by` goes NULL and actor history is lost. Sequencing is the #1 risk.
- **Relying on middleware for route authz** — middleware only does coarse 401/redirect and does NOT enforce role per route (see CONCERNS.md MEDIUM). `withAuth` is the per-route enforcement point.
- **Testing async RSC pages with Vitest** — unsupported (see Pitfall 5). Test the pure loader + `withAuth` instead; cover full page flows with manual/E2E.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Test runner | A custom node `assert` script | Vitest | Framework-recommended; watch mode, mocking, coverage out of the box. |
| Alias resolution in tests | Manual module mapper | `vite-tsconfig-paths` | Reads `tsconfig.json` `@/*` mapping directly — zero drift. |
| Role resolution | A new role-check in `withAuth` | Reuse `resolveDashboardAccessRole` via `getUserContext` | Architectural constraint: never read role from a single source (CLAUDE.md). |
| Rate limiting (if not descoped) | A bespoke sliding-window | `rate-limiter-flexible` (or a small `Map` for single-instance) | Edge cases (window reset, burst) are easy to get subtly wrong. |

**Key insight:** The guards themselves (`requireEditor`, `getUserContext`, `resolveDashboardAccessRole`) already exist and are correct — this phase mostly *applies* them to the missing surfaces and *centralizes* the route path in `withAuth`. The genuinely new code is the stamping/audit helper (AUTHZ-03) and the coverage test (D-07).

## Runtime State Inventory

> This phase is a security refactor + a destructive DB migration, not a rename. The relevant "runtime state" is the live database whose triggers/policies are dropped.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `audit_log` rows currently stamped via `auth.uid()`; existing `created_by`/`updated_by` values across all domain tables (set by trigger). | **No data migration of existing rows needed** — historical stamps stay valid. Going forward, the app must populate them. |
| Live DB schema/triggers | RLS policies + `set_row_metadata`/`log_audit_event` triggers + `can_read`/`can_edit`/`current_app_role` functions live in the Supabase DB, defined across migrations 0001/0003/0004/0006/0007/0008/0009. Dropping them is a destructive migration applied to the live DB. | Teardown migration (`0010_*`), applied manually (per CLAUDE.md migrations are applied by hand). Must land LAST (D-02). |
| Live service config | Supabase project: RLS toggle is server-side state, not in git beyond migrations. PostgREST will expose all tables to any valid JWT once RLS is off (accepted, D-01). | None this phase — closed at cutover (Phase 5/6) when Supabase Auth retires. |
| Secrets/env vars | `app_settings.secret_value` (Gemini key) readable by any authenticated user via PostgREST today (CRITICAL). `PORTAL_GEMINI_API_KEY` in env. | App-layer admin gate on the secret read (D-08). Key rotation deferred (operational follow-up). |
| Build artifacts / installed packages | None affected by this phase (no renamed packages). New dev/runtime deps added (Vitest, rate limiter). | `npm install` after package.json change; commit single lockfile (note: repo has both `package-lock.json` tracked and `pnpm-lock.yaml` untracked — CI uses `npm ci`, so keep `package-lock.json`). |
| OS-registered state | None — verified: no scheduled tasks, pm2, systemd units referenced in repo. | None. |

**The canonical question — "after every file is updated, what runtime systems still hold old behavior?":** The Supabase database. The teardown migration is the only out-of-repo state change, and D-02 fixes its ordering. Existing audit/stamp data needs no backfill.

## RLS + Trigger Teardown Surface (AUTHZ-02 / D-03)

The final migration (`0010_*`, lands LAST per D-02) must drop the following. Enumerated by direct read of every migration:

**Tables with RLS enabled + policies (all must `DISABLE ROW LEVEL SECURITY` + `DROP POLICY`):**
- `profiles` (0001): `profiles_select_authenticated`, `profiles_insert_self_or_admin`, `profiles_update_self_or_admin`
- `people` (0001): `domain_select_authenticated`, `domain_insert_editors_people`, `domain_update_editors_people`, `domain_delete_editors_people`
- `roles` (0001): `domain_select_authenticated_roles`, `domain_insert_editors_roles`, `domain_update_editors_roles`, `domain_delete_editors_roles`
- `matches` (0001): `domain_select_authenticated_matches`, `domain_insert_editors_matches`, `domain_update_editors_matches`, `domain_delete_editors_matches`
- `assignments` (0001): `domain_select_authenticated_assignments`, `domain_insert_editors_assignments`, `domain_update_editors_assignments`, `domain_delete_editors_assignments`
- `audit_log` (0001): `audit_select_authenticated`, `audit_insert_editors`
- `announcements` (0006): `announcements_read`, `announcements_insert_admin`, `announcements_update_admin`, `announcements_delete_admin`
- `collaborator_reports` (0007): `collaborator_reports_select_authenticated`, `collaborator_reports_insert_editors`, `collaborator_reports_update_editors`, `collaborator_reports_delete_editors`
- `app_settings` (0008): `app_settings_read`, `app_settings_insert_admin`, `app_settings_update_admin`, `app_settings_delete_admin`
- `club_contacts` (0009): `domain_select_authenticated_club_contacts`, `domain_insert_editors_club_contacts`, `domain_update_editors_club_contacts`, `domain_delete_editors_club_contacts`

**`auth.uid()`-based triggers to drop (D-03)** — exist on every domain table:
- `set_row_metadata` triggers: `people_metadata`, `roles_metadata`, `matches_metadata`, `assignments_metadata` (0001), `announcements_metadata` (0006), `collaborator_reports_metadata` (0007), `app_settings_metadata` (0008), `club_contacts_metadata` (0009)
- `log_audit_event` triggers: `people_audit`, `roles_audit`, `matches_audit`, `assignments_audit` (0001), `announcements_audit` (0006), `collaborator_reports_audit` (0007), `app_settings_audit` (0008), `club_contacts_audit` (0009)

**Helper functions** (drop after triggers/policies that reference them):
- `public.set_row_metadata()` (0001) — uses `auth.uid()`; drop.
- `public.log_audit_event()` (0001, redefined 0002) — `security definer`, uses `auth.uid()`; drop (replaced by app-side `writeAudit`).
- `public.current_app_role()` (0001) — used only by policies; drop after policies gone.
- `public.can_read()` (0001) — used only by policies; drop.
- `public.can_edit()` (0001, redefined 0003 then 0004) — used only by policies; drop.

**Do NOT drop:**
- `public.handle_new_user()` + `on_auth_user_created` trigger on `auth.users` — that's the Supabase-Auth profile-creation path; its removal belongs to Phase 4 (MIG-02 explicitly drops it). Leaving it is harmless this phase.
- The `created_by`/`updated_by`/`changed_by` **columns** — keep them; the app now populates them.
- The `app_role` enum and table structure.

**Sequencing caution (D-02):** Because `log_audit_event` is `security definer` and fires on every write, dropping it removes audit insertion. The app-side `writeAudit` must be live on every write path and verified BEFORE this migration runs. Same for `set_row_metadata` and the stamping helper.

## Actor Stamping — Recommended Mechanism (AUTHZ-03)

**Recommendation: explicit app-set columns + app-written audit rows (Option a), NOT a server-set GUC trigger (Option b).**

**Why (a) for this codebase:**
1. **Already the data model.** Every table has `created_by`/`updated_by` columns referencing `profiles(id)`, and `audit_log.changed_by` references `profiles(id)`. The app already resolves the profile id (`ctx.userId`). Stamping is a one-line payload merge.
2. **No DB-connection-state fragility.** Option (b) requires `SET LOCAL app.current_user_id = ...` per request and a rewritten trigger reading `current_setting('app.current_user_id')`. With Supabase's pooled connections (`@supabase/ssr` over the data API / PostgREST), there is no stable session to `SET LOCAL` on — PostgREST runs each request in its own transaction and the JS client does not expose a `SET` hook. GUCs are the right tool for a *direct* pooled Postgres connection (the HARD-01 defense-in-depth idea), not for the Supabase JS client used here. (See Pitfall 3.)
3. **Testable.** A pure `stampInsert(ctx, payload)` helper is trivially unit-testable; a DB trigger reading a GUC is only verifiable against a live DB.
4. **Fail-closed.** If a write path forgets to stamp, the column is NULL and the D-07 coverage test / a dedicated audit test can catch it — versus a silent GUC misconfiguration.

**Hard constraint satisfied:** `audit_log.changed_by` is set to `ctx.userId` in `writeAudit`, called explicitly on every domain mutation. The planner must ensure **every** write path calls both `stamp*` and `writeAudit` — this is exactly what makes the stamping work the riskiest item and why D-02 sequences verification before teardown.

**Cost/risk of (a):** It is more invasive — every write call site (see inventory below) must be touched. That is the tradeoff the user implicitly accepted by requiring app-side stamping. A `writeAudit` omission is the failure mode to guard against with tests.

### Write-path inventory (every call site that must stamp + audit)
Verified by grep across `src/app/actions/*` and `src/app/api/*`:
- `src/app/actions/matches.ts` — `matches` insert (`createMatchAction`), `matches` update, `assignments` upsert (multiple: lines ~152, 180, 257, 373, 429, 487). **None currently set `created_by`/`updated_by`** — confirmed by reading the insert payload construction.
- `src/app/actions/people.ts` — `people` insert/update (line ~145); also uses service-role admin client for auth-user creation (legitimate, stays).
- `src/app/actions/roles.ts` — role upserts/deletes.
- `src/app/actions/settings.ts` — `app_settings` upsert.
- `src/app/actions/auth.ts` — profile-related writes (check).
- `src/app/api/collaborator-reports/route.ts` — `collaborator_reports` upsert (already sets `reporter_profile_id: user.userId` manually — closest existing model; still relies on trigger for `created_by`/audit).
- `src/app/api/matches/intake/route.ts` — external intake writes to `matches` (currently NO auth at all).
- Contacts import tooling (`tools/import/*.mjs`) uses the **service-role** client directly — out of the app guard path; decide whether import writes need stamping (likely set `created_by` to a system/admin profile id or leave NULL for import provenance — confirm with user).

## Common Pitfalls

### Pitfall 1: `audit_log.changed_by` goes NULL when triggers drop
**What goes wrong:** Teardown migration drops `log_audit_event`/`set_row_metadata`; app writes were never updated to stamp/audit; audit history silently stops and `changed_by` is NULL.
**Why it happens:** App code today relies 100% on the triggers; the dependency is invisible (no app code mentions `created_by`).
**How to avoid:** D-02 ordering — wire `stamp*` + `writeAudit` into every write path (inventory above) and prove it with a test that performs a write and asserts a non-NULL `changed_by`, BEFORE the teardown migration. Treat the teardown migration as the last plan in the phase.
**Warning signs:** Any write path in the inventory not touched; a passing build with no audit assertion.

### Pitfall 2: `matches/intake` has no auth at all
**What goes wrong:** It's an external-caller route; wrapping it in `withAuth` (session-required) may break the upstream integration that posts to it.
**Why it happens:** It was designed for a machine caller, not a logged-in user.
**How to avoid:** Decide the auth model for machine routes explicitly — a shared secret / API key header checked in `withAuth` (or a dedicated `withApiKey` wrapper), not a Supabase session. Don't assume `withAuth({roles})` fits; confirm the caller's auth capability with the user. The D-07 coverage test should still require *some* wrapper on it.

### Pitfall 3: GUC stamping doesn't work over the Supabase JS client
**What goes wrong:** A plan that picks Option (b) tries `SET LOCAL app.current_user_id` — but the `@supabase/ssr` client talks to PostgREST, which runs each call in its own transaction with no place to set a session GUC, and connection pooling means a GUC set on one request can leak to another.
**Why it happens:** GUC stamping is a valid pattern for a *direct* `postgres`-driver connection (the analytics/Drizzle style, and the HARD-01 idea), not for the Supabase data API.
**How to avoid:** Use Option (a). If GUC is ever wanted, it belongs to the deferred HARD-01 work over a direct connection, not here.

### Pitfall 4: `(dashboard)/people` admin-client removal changes behavior
**What goes wrong:** The page uses `supabaseAdmin.auth.admin.listUsers()` to determine whether a person has platform access. The normal server client cannot list `auth.users`. Naively swapping the client loses the "has platform access" toggle.
**Why it happens:** That data lives in `auth.users`, only reachable via service-role.
**How to avoid:** Re-derive platform-access from `profiles` (or a join the normal client can read) per D-09, OR move just the admin-listUsers read into a `server-only` data function that the guarded page calls — the constraint is the *page module* must not import `admin.ts`, while a `server-only` helper still may. Confirm the intended boundary with the planner: D-09 says the page stops importing the admin client; a guarded server-only helper is still legitimate (like `people.ts` actions).

### Pitfall 5: Vitest cannot test async Server Components
**What goes wrong:** Attempting to `render()` an async RSC page (e.g. `people/page.tsx`) in Vitest fails.
**Why it happens:** [CITED: nextjs.org/docs/app/guides/testing/vitest] — "Since `async` Server Components are new to the React ecosystem, Vitest currently does not support them."
**How to avoid:** This phase's design already routes around it: test the pure loaders (`getPeopleData(ctx)`) and `withAuth`-wrapped handlers (plain async functions taking a `Request`) directly. Cover end-to-end page behavior with manual verification (or defer to Playwright if the user wants smoke coverage). Do not plan unit tests against RSC pages.

### Pitfall 6: PostgREST exposure window is real (accepted, but document for the user)
**What goes wrong:** Between the teardown migration and Supabase Auth retirement (Phase 5/6), any authenticated user can hit `/rest/v1/<table>` directly, bypassing app guards.
**Why it happens:** D-01 trades this for simplicity. App-layer guards do nothing for direct PostgREST access.
**How to avoid:** Nothing to *fix* (accepted), but the plan should note it in the phase summary/PR so it's a conscious, time-bounded state — and confirm the window is short.

## Code Examples

(See Patterns 1–4 above for the full sketches: `withAuth`, pure-loader threading, `stampActor`/`writeAudit`, and the guard-coverage test.)

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| RLS as authz backstop | App-layer fail-closed guards | This phase | All enforcement moves server-side; Supabase becomes plain Postgres. |
| `auth.uid()` DB triggers for stamping/audit | App-set columns + app-written audit | This phase | Removes DB dependency on Supabase Auth's `auth.uid()`; required before auth cutover. |
| Per-route opt-in `getUserContext()` (some routes forget) | `withAuth` HOF + CI coverage test | This phase | Default-safe; forgotten guard fails CI. |
| No test runner (`check` = lint+typecheck+build) | Vitest unit + route-handler tests in `check`/CI | This phase | First behavioral test coverage in the repo. |

**Deprecated/outdated:**
- `src/lib/supabase/browser.ts` — already dead (imported nowhere; no client `.from()`). Not in scope to delete but confirms no client-side re-guarding needed.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `rate-limiter-flexible` is the best-fit rate limiter (vs hand-rolled Map / Upstash) | Standard Stack | Low — limiter choice is swappable; in-memory suffices for single-instance internal tool. Confirm with user. |
| A2 | Direct-calling route `POST`/`GET` with a constructed `Request` is sufficient for tests (no NTARH needed) | Alternatives | Low — validate when wiring the first 401 test; NTARH is a drop-in fallback. |
| A3 | Loaders can stay "pure" by accepting a ctx arg while still creating their own server client internally | Pattern 2 | Medium — if the planner wants full unit-testability without a DB, the supabase client must also be injected. Decide in planning. |
| A4 | `matches/intake` needs an API-key/secret wrapper, not a Supabase-session `withAuth` | Pitfall 2 | Medium — wrong choice breaks the external integration. Confirm the caller's auth capability with the user. |
| A5 | Contacts import tooling (service-role) should stamp `created_by` to a system/admin id or leave NULL | Write-path inventory | Low — provenance decision; confirm with user. |
| A6 | Keeping `package-lock.json` (CI uses `npm ci`) and ignoring the untracked `pnpm-lock.yaml` | Runtime State Inventory | Low — matches current CI; just don't introduce pnpm-only deps. |

## Open Questions

1. **Machine-route auth for `matches/intake`** — What can the upstream caller send (API key header? nothing)? Determines whether `withAuth` fits or a `withApiKey` variant is needed.
   - What we know: it currently has no auth; D-04 says all `api/*` get a wrapper.
   - Recommendation: confirm caller capability; likely a shared-secret header check.
2. **Loader testability depth (A3)** — Inject the supabase client into loaders (full unit testability, no DB) or accept loaders are integration-tested against a test DB?
   - Recommendation: For this phase, the ctx arg is enough to satisfy D-06/D-07; defer client injection unless the planner wants DB-free loader tests now.
3. **Rate-limiting backing store (A1)** — In-memory (single instance, simplest) vs durable. Netlify functions may be multi-instance.
   - Recommendation: in-memory for the bounded window; note the multi-instance caveat for the user.
4. **Audit write granularity** — Should `writeAudit` capture `before`/`after` jsonb like the old trigger did, and must it exclude `secret_value` (CONCERNS LOW finding)?
   - Recommendation: yes capture before/after for parity; explicitly redact `secret_value` in the `app_settings` audit path.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | runtime + Vitest | ✓ (assumed 20.x per CLAUDE.md) | 20.x | — |
| npm | install + CI (`npm ci`) | ✓ | — | — |
| Supabase (live DB) | applying teardown migration, integration tests | ✓ (cloud) | — | Local Supabase / a DB copy for verification (recommended for the destructive migration). |
| Vitest | new test runner | ✗ (to be installed) | — | none — must install |
| Playwright | optional smoke (deferred) | ✗ | — | manual verification |

**Missing with no fallback:** Vitest (install it — this is the deliverable).
**Missing with fallback:** Playwright (deferred; manual verification of page flows in the interim).

## Validation Architecture

> nyquist_validation not found disabled in config — section included.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^4.1.8 (+ `@vitejs/plugin-react`, `vite-tsconfig-paths`) |
| Config file | `vitest.config.mts` — **Wave 0** (none exists) |
| Quick run command | `npx vitest run <path>` (or `npm test -- run <path>`) |
| Full suite command | `npm test` (add `"test": "vitest run"` to package.json; wire into `check`) |

**Config note:** Default `environment: 'node'` for route-handler + loader + guard-coverage tests (no DOM needed). Add `jsdom` only if a component test is introduced. Plugins: `[tsconfigPaths(), react()]` per the official guide to resolve `@/*`.

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUTHZ-01 | Each `api/*` route returns 401 with no session | unit (route handler) | `npx vitest run src/app/api/**/__tests__/*auth*.test.ts` | ❌ Wave 0 |
| AUTHZ-01 | Each `api/*` route returns 403 for under-privileged role | unit | (same) | ❌ Wave 0 |
| AUTHZ-01 | `withAuth` passes resolved ctx to inner handler | unit | `npx vitest run src/lib/api/__tests__/with-auth.test.ts` | ❌ Wave 0 |
| AUTHZ-01 / D-07 | Every `api/*` route is `withAuth`-wrapped; every `lib/data/*` loader takes a ctx arg | unit (static analysis) | `npx vitest run src/lib/api/__tests__/guard-coverage.test.ts` | ❌ Wave 0 |
| AUTHZ-03 | A domain write populates `audit_log.changed_by` (never NULL) | integration (test DB) or unit on `writeAudit` | `npx vitest run src/lib/__tests__/audit.test.ts` | ❌ Wave 0 |
| D-08 | Non-admin cannot read `app_settings.secret_value` | unit (gate fn) + integration | `npx vitest run src/lib/__tests__/settings-secret.test.ts` | ❌ Wave 0 |
| D-05 | Guest AI route is rate-limited after N calls | unit | `npx vitest run src/lib/api/__tests__/rate-limit.test.ts` | ❌ Wave 0 |

**Mocking strategy for 401/403 without a live Supabase session:** mock `@/lib/auth`'s `getUserContext` with `vi.mock` to return `{ userId: null, ... }` (401 case), an under-privileged role (403 case), or an admin (happy path). This is the cleanest seam — `withAuth` and route handlers depend only on `getUserContext`, so no Supabase or cookies are needed in unit tests. Reserve a real test DB only for the audit/secret integration tests (or mock the supabase client there too).

### Sampling Rate
- **Per task commit:** `npx vitest run` on the touched test file(s).
- **Per wave merge:** `npm test` (full suite).
- **Phase gate:** full suite green + `npm run check` green before `/gsd-verify-work`; coverage test (D-07) must pass.

### Wave 0 Gaps
- [ ] `vitest.config.mts` — runner config (plugins + node env)
- [ ] `package.json` `"test"` script + add to `check`; add `npm test` step to `.github/workflows/ci.yml`
- [ ] `src/lib/api/__tests__/with-auth.test.ts` — covers AUTHZ-01 (401/403/ctx pass-through)
- [ ] `src/lib/api/__tests__/guard-coverage.test.ts` — covers AUTHZ-01/D-07 (structural)
- [ ] per-route auth tests under `src/app/api/**/__tests__/` — covers AUTHZ-01
- [ ] `src/lib/__tests__/audit.test.ts` — covers AUTHZ-03 (`changed_by` never NULL)
- [ ] `src/lib/__tests__/settings-secret.test.ts` — covers D-08
- [ ] `src/lib/api/__tests__/rate-limit.test.ts` — covers D-05
- [ ] shared test fixtures: a `makeUserContext(overrides)` factory and a `vi.mock("@/lib/auth")` helper

## Security Domain

> `security_enforcement` not disabled in config — section included. This phase IS a security phase.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V1 Architecture | yes | Centralized, fail-closed authz (`withAuth` + boundary guards); documented trust boundary (PostgREST window). |
| V4 Access Control | **yes (core)** | App-layer role gates on every data path; deny-by-default `withAuth`; admin-only secret read (D-08). |
| V5 Validation/Sanitization | partial | Existing Zod on inputs stays; intake still hand-rolled (CONCERNS — out of scope here). |
| V6 Cryptography / Secrets | yes | `app_settings.secret_value` admin-gated (D-08); audit redaction of secret; key rotation deferred. |
| V7 Errors/Logging | yes | App-written audit log (`audit_log`); keep bracketed `console` prefixes. |
| V13 API/Web Service | yes | Per-route auth via `withAuth`; rate limiting on guest AI routes (D-05); machine-route auth for `intake` (Open Q1). |

### Known Threat Patterns for this stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Direct PostgREST data-API access bypassing app guards | Info Disclosure / Elevation | Accepted time-bounded window (D-01); closed at cutover. Documented. |
| Secret exfiltration (`secret_value` readable by any auth user) | Info Disclosure | App-layer admin-only read (D-08) + test; rotate key (deferred). |
| Unauthenticated/guest abuse of paid Gemini routes | DoS / financial | `withAuth` + rate limiting (D-04/D-05). |
| Forgotten guard on a new route/loader | Elevation | CI structural coverage test (D-07). |
| Lost actor attribution after trigger drop | Repudiation | App-side stamping + audit, verified before teardown (D-02/AUTHZ-03). |

## Sources

### Primary (HIGH confidence)
- Direct read of repo: `src/lib/auth.ts`, `src/lib/auth-access.ts`, `src/lib/supabase/{server,middleware}.ts`, `src/lib/settings.ts`, `src/app/api/**/route.ts` (all 9), `src/app/actions/matches.ts`, `src/app/(dashboard)/people/page.tsx`, `supabase/migrations/0001–0009`, `package.json`, `.github/workflows/ci.yml`, `src/lib/data/*` (signatures) — the threat surface and teardown inventory.
- nextjs.org/docs/app/guides/testing/vitest — Vitest setup, required dev deps, config, and the async-RSC limitation. (Page version 16.2.7, lastUpdated 2026-06-03.)
- npm registry — `vitest@4.1.8`, `@vitejs/plugin-react@6.0.2`, `vite-tsconfig-paths@6.1.1`, `rate-limiter-flexible@11.1.0`, `next-test-api-route-handler@5.0.5`, `@upstash/ratelimit@2.0.8` (versions confirmed via `npm view`).

### Secondary (MEDIUM confidence)
- WebSearch (Next.js + Vitest route-handler testing patterns; `next-test-api-route-handler`) — corroborates the mock-`getUserContext`-and-call-handler-directly approach.

### Tertiary (LOW confidence)
- `rate-limiter-flexible` as the *best* choice (A1) — popularity/training-based, marked [ASSUMED]; verify with user/slopcheck.

## Metadata

**Confidence breakdown:**
- Teardown surface & write-path inventory: HIGH — enumerated by direct read of every migration and action.
- Stamping mechanism recommendation: HIGH — grounded in the Supabase-JS-vs-GUC constraint (verified by reading `server.ts` uses `@supabase/ssr` over the data API).
- Test runner + technique: HIGH — official Next.js guide; route handlers are plain functions.
- Rate limiter choice: MEDIUM/LOW — [ASSUMED], swappable.

**Research date:** 2026-06-03
**Valid until:** ~2026-07-03 (Vitest/Next move fast; re-verify versions if planning slips a month).
