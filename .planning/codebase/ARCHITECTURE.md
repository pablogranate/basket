<!-- refreshed: 2026-06-03 -->
# Architecture

**Analysis Date:** 2026-06-03

## System Overview

```text
┌─────────────────────────────────────────────────────────────┐
│                  Next.js App Router (RSC)                    │
├──────────────────┬──────────────────┬───────────────────────┤
│  (auth) pages    │ (dashboard) pages │   api/ route handlers │
│ `src/app/(auth)` │`src/app/(dashboard)`│   `src/app/api`     │
└────────┬─────────┴────────┬──────────┴──────────┬────────────┘
         │                  │                      │
         ▼                  ▼                      ▼
┌─────────────────────────────────────────────────────────────┐
│   Server Actions             │   Data Loaders / Lib          │
│   `src/app/actions/*.ts`     │   `src/lib/data/*`,           │
│   ("use server" mutations)   │   `src/lib/*` (domain logic)  │
└──────────────────────────────┴───────────────┬───────────────┘
         │                                      │
         ▼                                      ▼
┌─────────────────────────────────────────────────────────────┐
│            Supabase Client Layer (`src/lib/supabase`)        │
│  server.ts (RSC) · middleware.ts (edge) · admin.ts (service) │
│  browser.ts (client) · auth-session.ts (safe user fetch)     │
└───────────────────────────────┬───────────────────────────-─┘
         │                       │
         ▼                       ▼
┌──────────────────────┐  ┌────────────────────────────────────┐
│  Supabase Postgres   │  │  External: Gemini AI · WhatsApp      │
│  (RLS, triggers,     │  │  deep links · Google Calendar links  │
│   audit_log)         │  │  `src/lib/integrations.ts`           │
└──────────────────────┘  └────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| Root layout | Fonts, global CSS, html shell | `src/app/layout.tsx` |
| Auth middleware | Session refresh, route guarding, role redirect | `middleware.ts`, `src/lib/supabase/middleware.ts` |
| Auth context | Resolve user + profile + role + `canEdit` | `src/lib/auth.ts` |
| Dashboard layout | Pick collaborator vs full shell by role | `src/app/(dashboard)/layout.tsx` |
| Server actions | Mutations for matches, people, roles, auth, settings | `src/app/actions/*.ts` |
| Data loaders | Read/aggregate queries for pages | `src/lib/data/*.ts` |
| Supabase clients | Per-context DB access (server/edge/admin/browser) | `src/lib/supabase/*.ts` |
| Domain libs | Dates, audit formatting, integrations, display labels | `src/lib/*.ts` |
| Page components | Section UIs (grid, people, teams, reports, etc.) | `src/components/**` |

## Pattern Overview

**Overall:** Next.js 16 App Router full-stack application with React Server Components, server actions for mutations, and Supabase (Postgres + Auth) as the backend. No separate API server — backend logic lives in route handlers, server actions, and `src/lib`.

**Key Characteristics:**
- Server-first: pages are async RSCs that fetch data directly via Supabase server client.
- Mutations go through `"use server"` actions (`src/app/actions/*`), not REST endpoints.
- `src/app/api/*` route handlers exist only for machine/external callers (AI, intake, health, exports, logos, reports).
- Authorization is layered: edge middleware (coarse gate) + per-action `requireEditor`/`requireAdminAccessManager` + Postgres RLS.
- Path alias `@/*` → `src/*` (`tsconfig.json`).

## Layers

**Routing / Presentation (App Router):**
- Purpose: Render UI, handle navigation, dispatch server actions.
- Location: `src/app/(auth)`, `src/app/(dashboard)`, `src/components`.
- Contains: RSC pages, client components, route groups.
- Depends on: server actions, data loaders, UI primitives.
- Used by: end users via browser.

**Server Actions (mutation layer):**
- Purpose: Validate input, enforce permissions, write to DB, revalidate.
- Location: `src/app/actions/*.ts` (all start with `"use server"`).
- Contains: `matches.ts`, `people.ts`, `roles.ts`, `auth.ts`, `settings.ts`, shared `helpers.ts`.
- Depends on: `requireEditor`/`requireUserContext` (auth), Supabase server client, `revalidatePath`, `redirect`.
- Used by: forms in page/components.

**API Route Handlers:**
- Purpose: External and programmatic entry points.
- Location: `src/app/api/*/route.ts`.
- Contains: `ai/*` (Gemini-backed), `matches/intake`, `collaborator-reports`, `grid/calendar`, `team-logo`, `health`.
- Depends on: Supabase clients, `src/lib` domain helpers.

**Domain / Data layer:**
- Purpose: Reusable read queries, normalization, business rules.
- Location: `src/lib/data/*` (queries) and `src/lib/*` (pure logic: dates, audit, integrations, display, settings).
- Depends on: Supabase clients, `database.types.ts`, `types.ts`.
- Used by: pages, actions, route handlers.

**Supabase access layer:**
- Purpose: Context-specific Supabase clients.
- Location: `src/lib/supabase/`.
- Files: `server.ts` (RSC cookie-bound), `middleware.ts` (edge session refresh), `admin.ts` (service-role, `server-only`), `browser.ts` (client components), `auth-session.ts` (stale-session-safe user fetch).

## Data Flow

### Primary Page Render (read path)

1. Request hits edge middleware (`middleware.ts` → `src/lib/supabase/middleware.ts:15`); session refreshed, role resolved, `x-pathname` header set, unauthenticated users redirected to `/login`.
2. `(dashboard)/layout.tsx:21` calls `getUserContext()` (`src/lib/auth.ts:28`) and chooses `DashboardShell` vs `CollaboratorShell` by role.
3. Page RSC (e.g. `src/app/(dashboard)/grid/page.tsx:24`) calls `requireUserContext()` then a data loader (`getGridData` in `src/lib/data/dashboard.ts`).
4. Data loader uses `createSupabaseServerClient()` to query Postgres (RLS-scoped) and returns typed view models from `src/lib/types.ts`.
5. RSC renders components with fetched data.

### Mutation (write path)

1. Form submits to a server action, e.g. `src/app/actions/matches.ts:1` (`"use server"`).
2. Action calls `requireEditor()` (`src/lib/auth.ts:116`) to enforce permission, throwing on failure.
3. Action validates/normalizes form fields, writes via Supabase server client.
4. Postgres triggers write to `audit_log` (see `supabase/migrations/0001_initial.sql`, `0002_fix_audit_trigger.sql`).
5. Action calls `revalidatePath(...)` then `redirectWithNotice(...)` (`src/app/actions/helpers.ts:16`) to surface a notice via query params.

### External Intake / AI Flow

1. External caller POSTs to `src/app/api/matches/intake/route.ts` (or `api/ai/*`).
2. Route normalizes payload, calls Gemini via `appEnv.portalGeminiApiKey` (for AI routes) or writes matches.

**State Management:**
- Server state lives in Postgres; pages refetch on navigation/revalidation.
- Client UI state is local React state in client components.
- Notices are passed via URL search params (`src/lib/search-params.ts`).
- Some client-only persistence in `src/lib/teams-local-storage.ts`.

## Key Abstractions

**User Context:**
- Purpose: Single source of identity + role + edit permission.
- Examples: `src/lib/auth.ts` (`getUserContext`, `requireUserContext`, `requireEditor`), `src/lib/auth-access.ts`.
- Pattern: Resolve once per request, auto-create profile row on first login, fall back to a synthetic `viewer` profile on failure.

**Role / Access Resolution:**
- Purpose: Map DB role + auth `app_metadata` to an effective dashboard role.
- Examples: `src/lib/constants.ts` (`resolveDashboardAccessRole`, `isCollaboratorLimitedRole`, `isDashboardPathAllowedForRole`, `getDefaultDashboardHrefForRole`).
- Pattern: Centralized role logic shared by middleware, layout, and actions.

**Typed Database:**
- Purpose: Compile-time-safe DB access.
- Examples: `src/lib/database.types.ts` (generated), `src/lib/types.ts` (view models like `MatchDetail`, `MatchListItem`, `PersonListItem`, `AuditEntry`).
- Pattern: `Database["public"]["Tables"][...]["Insert" | "Update" | "Row"]` used throughout actions/loaders.

**Integration Builders:**
- Purpose: Generate WhatsApp deep links, Google Calendar links, notification text.
- Examples: `src/lib/integrations.ts`, `src/lib/utils.ts` (`buildWhatsAppUrl`).

## Entry Points

**Web app:**
- Location: `src/app/layout.tsx` (root), route groups `(auth)` and `(dashboard)`.
- Triggers: HTTP navigation.
- Responsibilities: Render UI, dispatch actions.

**Edge middleware:**
- Location: `middleware.ts` (matcher excludes static/image assets).
- Triggers: Every non-asset request.
- Responsibilities: Session refresh, auth gating, role-based redirects.

**API handlers:**
- Location: `src/app/api/*/route.ts`.
- Triggers: External POST/GET (AI, intake, health, exports, logos, reports, calendar).

**Auth confirm:**
- Location: `src/app/auth/confirm/route.ts` — handles email OTP / password-reset confirmation redirects.

**CSV import tool:**
- Location: `tools/import/index.mjs` (`npm run import:csv`), `tools/import/contactos.mjs` — uses service-role key.

## Architectural Constraints

- **Threading:** Single-threaded Node/edge runtime per request (Next.js). No worker threads.
- **Global state:** `appEnv` object (`src/lib/env.ts`) is the only module-level singleton; it reads `process.env` once at import.
- **Service-role isolation:** `src/lib/supabase/admin.ts` is marked `import "server-only"` and must never be reachable from client bundles.
- **Cookie writes in RSC:** `createSupabaseServerClient` (`src/lib/supabase/server.ts:21`) swallows cookie-set errors because server components may render with read-only cookies — session refresh must happen in middleware.
- **Auth source of truth:** Effective role is derived from both `profiles.role` and `user.app_metadata` via `resolveDashboardAccessRole`; never read role from only one source.

## Anti-Patterns

### Reading role from a single source

**What happens:** Reading `profiles.role` directly without merging `app_metadata`.
**Why it's wrong:** Operator/elevated roles can live in `app_metadata`; ignoring it under-privileges or mis-gates users.
**Do this instead:** Always resolve via `resolveDashboardAccessRole(...)` in `src/lib/constants.ts`.

### Mutating data from API routes or client without permission checks

**What happens:** Writing to tables without `requireEditor`/`requireAdminAccessManager`.
**Why it's wrong:** Bypasses the app-layer authorization that complements RLS.
**Do this instead:** Route mutations through `src/app/actions/*` which call the `require*` guards in `src/lib/auth.ts` / `src/lib/auth-access.ts`.

### Using the admin (service-role) client for ordinary reads

**What happens:** Importing `createSupabaseAdminClient` for normal page queries.
**Why it's wrong:** Bypasses RLS and risks leaking data across tenants/roles.
**Do this instead:** Use `createSupabaseServerClient()` for user-scoped access; reserve admin client for trusted server-only jobs (e.g. CSV import, access provisioning).

## Error Handling

**Strategy:** Throw localized Spanish error messages from guards/actions; log to `console.error` with `[area]` prefixes (e.g. `[auth]` in `src/lib/auth.ts:51`).

**Patterns:**
- Guards throw (`requireEditor` throws "No tenes permisos para editar.").
- Navigation errors re-thrown via `unstable_rethrow` (`src/app/actions/helpers.ts:29`).
- Supabase query errors checked via `.error` and degraded gracefully (fallback profile in `getUserContext`).
- API routes return `NextResponse.json({ error }, { status })`.

## Cross-Cutting Concerns

**Logging:** `console.error`/`console` with bracketed area tags; no external logger.
**Validation:** Manual normalization helpers (`src/lib/utils.ts`, action-local helpers) plus `zod` (dependency) where structured parsing is needed.
**Authentication:** Supabase Auth (cookie-based via `@supabase/ssr`), enforced at edge middleware + per-action guards + Postgres RLS.
**Audit:** DB triggers populate `audit_log`; formatted for UI by `src/lib/audit.ts`.
**Localization:** UI copy centralized in `src/lib/copy.ts` and display labels in `src/lib/display.ts` / `src/lib/constants.ts` (Spanish).

---

*Architecture analysis: 2026-06-03*
