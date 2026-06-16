<!-- GSD:project-start source:PROJECT.md -->

## Project

**Basket-App Portal — Unified Auth**

`portal.basket-app.com` (this repo, "portal") is a basketball broadcast/production management app — matches, people/contacts, teams, scheduling grid, incident reports, AI (Gemini) intake, and WhatsApp/Calendar integrations. Built on Next.js 16 (App Router, RSC, server actions) with Supabase as backend.

It is one of three sibling apps under `basket-app.com`: `portal.` (this), `analytics.` (a Next.js + Drizzle/Postgres data dashboard), and `incidencias.` (incidents — out of scope for now). This milestone makes the three apps **share one identity** via Better Auth so a user logs in once and is recognized across subdomains.

**Core Value:** A single sign-on across `*.basket-app.com` where identity is shared but each app authorizes its own users independently — without breaking portal's existing role-based access.

### Constraints

- **Tech stack**: Better Auth (^1.6.11) is the chosen auth across all apps; reuse analytics' Drizzle + Postgres approach for the auth layer in portal.
- **Tech stack**: Portal stays on Next.js 16 App Router + Supabase (cloud) for domain data; auth adds a Drizzle/Postgres connection to the company-server auth DB.
- **Compatibility**: SSO requires identical `BETTER_AUTH_SECRET`, shared session table, and `.basket-app.com` cookie domain across all participating apps.
- **Security**: Service-role/admin DB access stays server-only; per-app access gates enforced in `databaseHooks`; portal authorization moves fully to the app layer once RLS is dropped.
- **Migration**: Existing portal users must retain access — no lockout; external-user path must work without Google.

<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->

## Technology Stack

## Languages

- TypeScript ^5 - All application code in `src/` (`.ts`, `.tsx`), strict mode enabled (`tsconfig.json`)
- JavaScript (ESM `.mjs`) - CLI import tooling in `tools/import/index.mjs` and `tools/import/contactos.mjs`
- SQL (PostgreSQL dialect) - Database schema and migrations in `supabase/migrations/*.sql`, `supabase/seed.sql`
- CSS - Global styles in `src/app/globals.css` (Tailwind CSS v4 via PostCSS)

## Runtime

- Node.js (no version pinned; `@types/node` ^20 suggests Node 20.x as baseline; no `.nvmrc` present)
- Next.js 16.1.6 runtime — App Router, React Server Components, server actions, route handlers
- pnpm (primary) - `pnpm-lock.yaml` present (145 KB)
- npm also has a lockfile - `package-lock.json` present (246 KB); both lockfiles committed (see CONCERNS)
- Lockfile: present

## Frameworks

- Next.js 16.1.6 - Full-stack React framework (App Router). Entry: `src/app/layout.tsx`, `src/app/page.tsx`; route groups `(auth)`, `(dashboard)`; API route handlers under `src/app/api/`
- React 19.2.3 / React DOM 19.2.3 - UI library
- Tailwind CSS v4 (`^4`) - Styling, configured via `@tailwindcss/postcss` in `postcss.config.mjs`
- Not detected - No test runner (Jest/Vitest), no test files, no test scripts in `package.json`
- Next.js CLI - `next dev`, `next build`, `next start` (`package.json` scripts)
- TypeScript compiler - `tsc --noEmit` (`typecheck` script)
- ESLint ^9 - Flat config `eslint.config.mjs` using `eslint-config-next` 16.1.6 (core-web-vitals + typescript presets)

## Key Dependencies

- `@supabase/supabase-js` ^2.98.0 - Supabase client (auth, Postgres, admin). Used in `src/lib/supabase/admin.ts`, `tools/import/index.mjs`
- `@supabase/ssr` ^0.9.0 - Cookie-based SSR auth for Next.js. Used in `src/lib/supabase/server.ts`, `src/lib/supabase/browser.ts`, `src/lib/supabase/middleware.ts`
- `zod` ^4.3.6 - Runtime schema validation for forms/actions and API payloads
- `next` 16.1.6 / `react` 19.2.3 - Framework and UI runtime
- `date-fns` ^4.1.0 + `date-fns-tz` ^3.2.0 - Date formatting and timezone conversion (default tz `America/Bogota`). Used in `src/lib/date.ts`, `tools/import/index.mjs`
- `jspdf` ^4.2.0 + `jspdf-autotable` ^5.0.7 - Client-side PDF generation/export. Used in `src/components/grid/grid-export-button.tsx`, `src/components/incidents/incidents-workspace.tsx`, `src/components/reports/reports-workspace.tsx`
- `csv-parse` ^6.1.0 - CSV parsing for the import CLI (`tools/import/index.mjs`)
- `dotenv` ^17.3.1 - Loads `.env.local`/`.env` for the import CLI
- `lucide-react` ^0.577.0 - Icon set
- `clsx` ^2.1.1 + `tailwind-merge` ^3.5.0 - Conditional class composition (`src/lib/utils.ts`)

## Configuration

- Centralized accessor: `src/lib/env.ts` (`appEnv` object) reads all env vars with defaults
- Local env file present: `.env.local` (contents not read — may contain secrets)
- Required/consumed env vars:
- Validation guards: `assertSupabaseEnv()`, `assertServiceRoleKey()` in `src/lib/env.ts`
- `next.config.ts` - Next.js config (currently empty/default)
- `tsconfig.json` - `strict: true`, `moduleResolution: bundler`, path alias `@/* → ./src/*`
- `postcss.config.mjs` - Tailwind v4 PostCSS plugin
- `eslint.config.mjs` - ESLint flat config
- `.editorconfig` - Editor formatting rules
- `middleware.ts` - Root middleware delegating to `src/lib/supabase/middleware.ts` for session refresh

## Platform Requirements

- Node.js 20.x (inferred), pnpm
- Local Supabase project or hosted Supabase instance (env vars must be set)
- Run: `pnpm dev` (or `npm run dev`); quality gate: `npm run check` (lint + typecheck + build)
- Persistent Node server (VPS, long-lived `next start`) — NOT serverless. In-process `node-cron` schedulers (`src/instrumentation.ts`) depend on the process staying alive. The OpenWA WhatsApp instance runs on this same server.
- Requires Supabase env vars provisioned in the host
- Database hosted on Supabase (PostgreSQL); migrations in `supabase/migrations/` applied manually

<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->

## Conventions

## Naming Patterns

- All source files use `kebab-case`: `team-logo-mark-client.tsx`, `auth-session.ts`, `create-match-form.tsx`.
- Route files follow Next.js App Router conventions: `page.tsx`, `layout.tsx`, `route.ts`, `middleware.ts`.
- Client variants append a `-client` suffix when a server/client split exists: `league-logo-mark.tsx` vs `league-logo-mark-client.tsx`.
- No barrel/`index.ts` files exist anywhere under `src/` — every module is imported by its explicit path.
- `camelCase` for all functions and helpers: `getUserContext`, `buildKickoffAt`, `pickFirstString`, `ensureErrorMessage`.
- Server Actions end with the `Action` suffix: `upsertRoleAction`, `deleteRoleAction` (`src/app/actions/roles.ts`).
- Predicate/guard helpers prefixed with `is`/`assert`/`require`/`ensure`/`build`/`normalize`/`get`:
- React components use `PascalCase`: `Button`, `Badge`, `RolesPage`, `SectionPageHeader`.
- `camelCase` for locals and object properties.
- Module-level constants in `SCREAMING_SNAKE_CASE`: `STAFF_ROLE_FIELD_MAP`, `OPTIONAL_MATCH_COLUMNS`, `MATCH_STATUS_OPTIONS` (`src/app/actions/matches.ts`, `src/lib/constants.ts`).
- Database column names stay `snake_case` to match Postgres/Supabase (`full_name`, `sort_order`, `created_at`); application-facing identifiers are `camelCase` (`responsableId`, `graphicsOperatorId`).
- `PascalCase` for types and interfaces: `ButtonProps`, `PageProps`, `ProfileRow`, `AppRole`.
- `type` aliases are strongly preferred over `interface` (40 `export type` vs. 1 `export interface` across `src/`).
- Supabase-derived types use indexed access into generated `Database` type: `Database["public"]["Tables"]["matches"]["Insert"]` (`src/app/actions/matches.ts`).
- `as const` is used to lock literal arrays/objects: `STAFF_ROLE_FIELD_MAP = [...] as const`.

## Code Style

- No Prettier or Biome config present. Formatting is enforced by `.editorconfig`:
- Double quotes for strings everywhere; trailing commas in multiline literals and parameter lists.
- Applies to `*.{js,jsx,ts,tsx,mjs,cjs,json,md,yml,yaml,sql}`.
- ESLint flat config in `eslint.config.mjs`, composed from `eslint-config-next/core-web-vitals` + `eslint-config-next/typescript`.
- No custom rules added; ignores `.next/**`, `out/**`, `build/**`, `next-env.d.ts`.
- Run with `npm run lint` (`eslint .`).
- `strict: true` in `tsconfig.json`. Target ES2017, `moduleResolution: bundler`, `noEmit: true`.
- Verify types with `npm run typecheck` (`tsc --noEmit`).
- `unknown` is used for untrusted inputs and caught errors, then narrowed (see `ensureErrorMessage` in `src/lib/utils.ts`). Avoid `any`.

## Import Organization

- `@/*` maps to `./src/*` (`tsconfig.json`). Always use `@/...` for internal imports; relative `../` imports are not used across module boundaries.
- Use `import type { ... }` for type-only imports: `import type { Database } from "@/lib/database.types";`.

## Directives

- `"use server"` at the top of Server Action modules (`src/app/actions/*.ts`, 5 files).
- `"use client"` at the top of interactive components (40 files), typically the `*-client.tsx`, modal, form, and `components/ui/*` interactive widgets.
- Default: server components. Only opt into client when interactivity/hooks are required.

## Error Handling

- `ensureErrorMessage(error: unknown)` in `src/lib/utils.ts` normalizes any throwable into a user-facing string. It checks `Error.message`, then Supabase-style fields `error_description`, `details`, `hint`, falling back to `"Ocurrio un error inesperado."`.
- Validate Supabase results via `result.error` and `throw` on failure.
- Call `rethrowNavigationError(error)` (wraps `unstable_rethrow`) first in every `catch` so Next.js redirect/`notFound` control-flow throws are not swallowed (`src/app/actions/helpers.ts`).
- Surface errors to the user as a redirect with `intent: "error"` and a `notice` message rather than throwing to an error boundary.
- Validate request body with a `zod` schema and `safeParse`, returning `NextResponse.json({ error }, { status })` on failure:
- Health/simple routes return plain JSON: `NextResponse.json({ ok: true, ... })` (`src/app/api/health/route.ts`).
- `assertSupabaseEnv()` / `assertServiceRoleKey()` throw descriptive `Error`s when required env vars are missing (`src/lib/env.ts`).
- Pages short-circuit to a `<SetupPanel />` when `!isSupabaseConfigured` rather than crashing (`src/app/(dashboard)/roles/page.tsx`).

## Input Validation

- Per `CONTRIBUTING.md`: "Validate inputs at the boundary. Do not trust form or CSV data."
- Form data is read defensively: `String(formData.get("name") ?? "")`, then normalized via helpers (`maybeNull`, `pickFirstString`, `normalizeText`, `toTitleCase` in `src/lib/utils.ts`).
- External JSON payloads validated with `zod`; loosely-typed external integrations use manual `firstString`/`getPathValue`/`normalizeDate` walkers (`src/app/api/matches/intake/route.ts`).

## Logging

- `console.error` (11×): failed Supabase queries / unexpected failures, namespaced with a bracket tag, e.g. `console.error("[auth] failed to load profile", profileQuery.error);` (`src/lib/auth.ts`).
- `console.warn` (8×): recoverable / degraded conditions.
- `console.info` (4×): notable runtime events.
- Use a bracketed module prefix (`[auth]`, etc.) when logging.

## Comments

- Comments are sparse and explain non-obvious intent only (e.g., the `globalIgnores` note in `eslint.config.mjs`). Code is expected to be self-documenting via descriptive names.
- Not used. No `/**` doc blocks exist in `src/`. Do not introduce JSDoc; rely on TypeScript types and clear names.

## Function Design

- Functions with more than ~2 arguments take a single destructured options object typed inline:
- Defaults provided inline: `getRedirectTarget(formData: FormData, fallback = "/grid")`.
- Helpers return early on the failure/empty case (guard clauses) before the happy path.
- Normalizers return safe empty defaults (`""`, `null`, `[]`) rather than throwing — e.g. `maybeNull`, `pickFirstString`, `sanitizePhone`.

## Module Design

- Named exports are the norm (157 `export function`, 46 `export const`, 46 `export async function`).
- `export default` is reserved for Next.js page/layout components (17 `export default async function`, 2 `export default function`) and config objects (`next.config.ts`, `eslint.config.mjs`).
- None. Import each symbol from its explicit module path.
- `src/lib` — domain logic, data access, auth, utils, types, integrations.
- `src/components` — reusable UI and route-level presentation.
- `src/app` — routes, layouts, Server Actions (`src/app/actions/`), and route handlers (`src/app/api/`).
- Prefer Server Actions for authenticated dashboard mutations; add route handlers only for external HTTP needs (webhooks, machine clients, health checks). Do not bypass RLS assumptions in application code.

## Styling Conventions

- Tailwind CSS 4 with utility classes; class merging via `cn(...)` = `twMerge(clsx(...))` (`src/lib/utils.ts`).
- Design tokens referenced through CSS custom properties: `bg-[var(--accent)]`, `text-[var(--foreground)]`, `rounded-[var(--panel-radius)]` (`src/components/ui/button.tsx`).
- Components expose a `variant` prop typed as a string-literal union, mapped through a `Record<Variant, string>` of class strings (`src/components/ui/button.tsx`).
- Shared base class strings are exported for reuse: `badgeBaseClassName` (`src/components/ui/badge.tsx`).
- Component props extend native HTML attributes: `React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ... }`.

<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->

## Architecture

## System Overview

```text

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

- Server-first: pages are async RSCs that fetch data directly via Supabase server client.
- Mutations go through `"use server"` actions (`src/app/actions/*`), not REST endpoints.
- `src/app/api/*` route handlers exist only for machine/external callers (AI, intake, health, exports, logos, reports).
- Authorization is layered: edge middleware (coarse gate) + per-action `requireEditor`/`requireAdminAccessManager` + Postgres RLS.
- Path alias `@/*` → `src/*` (`tsconfig.json`).

## Layers

- Purpose: Render UI, handle navigation, dispatch server actions.
- Location: `src/app/(auth)`, `src/app/(dashboard)`, `src/components`.
- Contains: RSC pages, client components, route groups.
- Depends on: server actions, data loaders, UI primitives.
- Used by: end users via browser.
- Purpose: Validate input, enforce permissions, write to DB, revalidate.
- Location: `src/app/actions/*.ts` (all start with `"use server"`).
- Contains: `matches.ts`, `people.ts`, `roles.ts`, `auth.ts`, `settings.ts`, shared `helpers.ts`.
- Depends on: `requireEditor`/`requireUserContext` (auth), Supabase server client, `revalidatePath`, `redirect`.
- Used by: forms in page/components.
- Purpose: External and programmatic entry points.
- Location: `src/app/api/*/route.ts`.
- Contains: `ai/*` (Gemini-backed), `matches/intake`, `collaborator-reports`, `grid/calendar`, `team-logo`, `health`.
- Depends on: Supabase clients, `src/lib` domain helpers.
- Purpose: Reusable read queries, normalization, business rules.
- Location: `src/lib/data/*` (queries) and `src/lib/*` (pure logic: dates, audit, integrations, display, settings).
- Depends on: Supabase clients, `database.types.ts`, `types.ts`.
- Used by: pages, actions, route handlers.
- Purpose: Context-specific Supabase clients.
- Location: `src/lib/supabase/`.
- Files: `server.ts` (RSC cookie-bound), `middleware.ts` (edge session refresh), `admin.ts` (service-role, `server-only`), `browser.ts` (client components), `auth-session.ts` (stale-session-safe user fetch).

## Data Flow

### Primary Page Render (read path)

### Mutation (write path)

### External Intake / AI Flow

- Server state lives in Postgres; pages refetch on navigation/revalidation.
- Client UI state is local React state in client components.
- Notices are passed via URL search params (`src/lib/search-params.ts`).
- Some client-only persistence in `src/lib/teams-local-storage.ts`.

## Key Abstractions

- Purpose: Single source of identity + role + edit permission.
- Examples: `src/lib/auth.ts` (`getUserContext`, `requireUserContext`, `requireEditor`), `src/lib/auth-access.ts`.
- Pattern: Resolve once per request, auto-create profile row on first login, fall back to a synthetic `viewer` profile on failure.
- Purpose: Map DB role + auth `app_metadata` to an effective dashboard role.
- Examples: `src/lib/constants.ts` (`resolveDashboardAccessRole`, `isCollaboratorLimitedRole`, `isDashboardPathAllowedForRole`, `getDefaultDashboardHrefForRole`).
- Pattern: Centralized role logic shared by middleware, layout, and actions.
- Purpose: Compile-time-safe DB access.
- Examples: `src/lib/database.types.ts` (generated), `src/lib/types.ts` (view models like `MatchDetail`, `MatchListItem`, `PersonListItem`, `AuditEntry`).
- Pattern: `Database["public"]["Tables"][...]["Insert" | "Update" | "Row"]` used throughout actions/loaders.
- Purpose: Generate WhatsApp deep links, Google Calendar links, notification text.
- Examples: `src/lib/integrations.ts`, `src/lib/utils.ts` (`buildWhatsAppUrl`).

## Entry Points

- Location: `src/app/layout.tsx` (root), route groups `(auth)` and `(dashboard)`.
- Triggers: HTTP navigation.
- Responsibilities: Render UI, dispatch actions.
- Location: `middleware.ts` (matcher excludes static/image assets).
- Triggers: Every non-asset request.
- Responsibilities: Session refresh, auth gating, role-based redirects.
- Location: `src/app/api/*/route.ts`.
- Triggers: External POST/GET (AI, intake, health, exports, logos, reports, calendar).
- Location: `src/app/auth/confirm/route.ts` — handles email OTP / password-reset confirmation redirects.
- Location: `tools/import/index.mjs` (`npm run import:csv`), `tools/import/contactos.mjs` — uses service-role key.

## Architectural Constraints

- **Threading:** Single-threaded Node/edge runtime per request (Next.js). No worker threads.
- **Global state:** `appEnv` object (`src/lib/env.ts`) is the only module-level singleton; it reads `process.env` once at import.
- **Service-role isolation:** `src/lib/supabase/admin.ts` is marked `import "server-only"` and must never be reachable from client bundles.
- **Cookie writes in RSC:** `createSupabaseServerClient` (`src/lib/supabase/server.ts:21`) swallows cookie-set errors because server components may render with read-only cookies — session refresh must happen in middleware.
- **Auth source of truth:** Effective role is derived from both `profiles.role` and `user.app_metadata` via `resolveDashboardAccessRole`; never read role from only one source.

## Anti-Patterns

### Reading role from a single source

### Mutating data from API routes or client without permission checks

### Using the admin (service-role) client for ordinary reads

## Error Handling

- Guards throw (`requireEditor` throws "No tenes permisos para editar.").
- Navigation errors re-thrown via `unstable_rethrow` (`src/app/actions/helpers.ts:29`).
- Supabase query errors checked via `.error` and degraded gracefully (fallback profile in `getUserContext`).
- API routes return `NextResponse.json({ error }, { status })`.

## Cross-Cutting Concerns

<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->

## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:

- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->

## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
