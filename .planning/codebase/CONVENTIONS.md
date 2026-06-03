# Coding Conventions

**Analysis Date:** 2026-06-03

## Naming Patterns

**Files:**
- All source files use `kebab-case`: `team-logo-mark-client.tsx`, `auth-session.ts`, `create-match-form.tsx`.
- Route files follow Next.js App Router conventions: `page.tsx`, `layout.tsx`, `route.ts`, `middleware.ts`.
- Client variants append a `-client` suffix when a server/client split exists: `league-logo-mark.tsx` vs `league-logo-mark-client.tsx`.
- No barrel/`index.ts` files exist anywhere under `src/` — every module is imported by its explicit path.

**Functions:**
- `camelCase` for all functions and helpers: `getUserContext`, `buildKickoffAt`, `pickFirstString`, `ensureErrorMessage`.
- Server Actions end with the `Action` suffix: `upsertRoleAction`, `deleteRoleAction` (`src/app/actions/roles.ts`).
- Predicate/guard helpers prefixed with `is`/`assert`/`require`/`ensure`/`build`/`normalize`/`get`:
  - `isSupabaseConfigured`, `assertSupabaseEnv` (`src/lib/env.ts`)
  - `requireEditor`, `requireUserContext` (`src/lib/auth.ts`)
  - `normalizeText`, `normalizeProductionMode`, `buildWhatsAppUrl` (`src/lib/utils.ts`, `src/lib/constants.ts`)
- React components use `PascalCase`: `Button`, `Badge`, `RolesPage`, `SectionPageHeader`.

**Variables:**
- `camelCase` for locals and object properties.
- Module-level constants in `SCREAMING_SNAKE_CASE`: `STAFF_ROLE_FIELD_MAP`, `OPTIONAL_MATCH_COLUMNS`, `MATCH_STATUS_OPTIONS` (`src/app/actions/matches.ts`, `src/lib/constants.ts`).
- Database column names stay `snake_case` to match Postgres/Supabase (`full_name`, `sort_order`, `created_at`); application-facing identifiers are `camelCase` (`responsableId`, `graphicsOperatorId`).

**Types:**
- `PascalCase` for types and interfaces: `ButtonProps`, `PageProps`, `ProfileRow`, `AppRole`.
- `type` aliases are strongly preferred over `interface` (40 `export type` vs. 1 `export interface` across `src/`).
- Supabase-derived types use indexed access into generated `Database` type: `Database["public"]["Tables"]["matches"]["Insert"]` (`src/app/actions/matches.ts`).
- `as const` is used to lock literal arrays/objects: `STAFF_ROLE_FIELD_MAP = [...] as const`.

## Code Style

**Formatting:**
- No Prettier or Biome config present. Formatting is enforced by `.editorconfig`:
  - 2-space indentation, `space` indent style.
  - UTF-8, LF line endings, final newline inserted, trailing whitespace trimmed (except in `.md`).
- Double quotes for strings everywhere; trailing commas in multiline literals and parameter lists.
- Applies to `*.{js,jsx,ts,tsx,mjs,cjs,json,md,yml,yaml,sql}`.

**Linting:**
- ESLint flat config in `eslint.config.mjs`, composed from `eslint-config-next/core-web-vitals` + `eslint-config-next/typescript`.
- No custom rules added; ignores `.next/**`, `out/**`, `build/**`, `next-env.d.ts`.
- Run with `npm run lint` (`eslint .`).

**TypeScript:**
- `strict: true` in `tsconfig.json`. Target ES2017, `moduleResolution: bundler`, `noEmit: true`.
- Verify types with `npm run typecheck` (`tsc --noEmit`).
- `unknown` is used for untrusted inputs and caught errors, then narrowed (see `ensureErrorMessage` in `src/lib/utils.ts`). Avoid `any`.

## Import Organization

**Order (observed convention):**
1. Third-party / framework imports (`next/cache`, `next/navigation`, `next/server`, `react`, `zod`, `clsx`).
2. Blank line.
3. Internal `@/` alias imports, grouped roughly by `@/app/actions`, `@/components`, then `@/lib`.

Example from `src/app/(dashboard)/roles/page.tsx`:
```ts
import { deleteRoleAction, upsertRoleAction } from "@/app/actions/roles";
import { SectionPageHeader } from "@/components/layout/section-page-header";
import { Button } from "@/components/ui/button";
import { requireUserContext } from "@/lib/auth";
import { getRolesData } from "@/lib/data/dashboard";
```

**Path Aliases:**
- `@/*` maps to `./src/*` (`tsconfig.json`). Always use `@/...` for internal imports; relative `../` imports are not used across module boundaries.

**Type-only imports:**
- Use `import type { ... }` for type-only imports: `import type { Database } from "@/lib/database.types";`.

## Directives

- `"use server"` at the top of Server Action modules (`src/app/actions/*.ts`, 5 files).
- `"use client"` at the top of interactive components (40 files), typically the `*-client.tsx`, modal, form, and `components/ui/*` interactive widgets.
- Default: server components. Only opt into client when interactivity/hooks are required.

## Error Handling

**Centralized error message extraction:**
- `ensureErrorMessage(error: unknown)` in `src/lib/utils.ts` normalizes any throwable into a user-facing string. It checks `Error.message`, then Supabase-style fields `error_description`, `details`, `hint`, falling back to `"Ocurrio un error inesperado."`.

**Server Action pattern (canonical):**
Every mutating action follows this shape (`src/app/actions/roles.ts`, `matches.ts`, `people.ts`):
```ts
export async function upsertRoleAction(formData: FormData) {
  const redirectTo = getRedirectTarget(formData, "/roles");
  await requireEditor();                       // authz at the boundary

  const payload = { /* normalized fields */ };

  try {
    const supabase = await createSupabaseServerClient();
    const result = await supabase.from("roles").upsert(payload);
    if (result.error) {
      throw result.error;                      // Supabase errors are thrown, not returned
    }
    revalidatePath("/roles");
    revalidatePath("/grid");
    redirectWithNotice({ redirectTo, intent: "success", notice: "Rol actualizado." });
  } catch (error) {
    rethrowNavigationError(error);             // re-throw Next.js redirect/notFound signals
    redirectWithNotice({ redirectTo, intent: "error", notice: ensureErrorMessage(error) });
  }
}
```
Key rules:
- Validate Supabase results via `result.error` and `throw` on failure.
- Call `rethrowNavigationError(error)` (wraps `unstable_rethrow`) first in every `catch` so Next.js redirect/`notFound` control-flow throws are not swallowed (`src/app/actions/helpers.ts`).
- Surface errors to the user as a redirect with `intent: "error"` and a `notice` message rather than throwing to an error boundary.

**API Route pattern:**
- Validate request body with a `zod` schema and `safeParse`, returning `NextResponse.json({ error }, { status })` on failure:
```ts
const requestSchema = z.object({ question: z.string().trim().min(3).max(500), /* ... */ });
const payload = requestSchema.safeParse(await request.json());
if (!payload.success) {
  return NextResponse.json({ error: "Solicitud inválida para el asistente." }, { status: 400 });
}
```
(`src/app/api/ai/people/route.ts`, plus `ai/section`, `ai/metric-capture`, `ai/speedtest`, `collaborator-reports`.)
- Health/simple routes return plain JSON: `NextResponse.json({ ok: true, ... })` (`src/app/api/health/route.ts`).

**Environment guards:**
- `assertSupabaseEnv()` / `assertServiceRoleKey()` throw descriptive `Error`s when required env vars are missing (`src/lib/env.ts`).
- Pages short-circuit to a `<SetupPanel />` when `!isSupabaseConfigured` rather than crashing (`src/app/(dashboard)/roles/page.tsx`).

## Input Validation

- Per `CONTRIBUTING.md`: "Validate inputs at the boundary. Do not trust form or CSV data."
- Form data is read defensively: `String(formData.get("name") ?? "")`, then normalized via helpers (`maybeNull`, `pickFirstString`, `normalizeText`, `toTitleCase` in `src/lib/utils.ts`).
- External JSON payloads validated with `zod`; loosely-typed external integrations use manual `firstString`/`getPathValue`/`normalizeDate` walkers (`src/app/api/matches/intake/route.ts`).

## Logging

**Framework:** Native `console` only. No logging library.

**Patterns (observed across `src/`):**
- `console.error` (11×): failed Supabase queries / unexpected failures, namespaced with a bracket tag, e.g. `console.error("[auth] failed to load profile", profileQuery.error);` (`src/lib/auth.ts`).
- `console.warn` (8×): recoverable / degraded conditions.
- `console.info` (4×): notable runtime events.
- Use a bracketed module prefix (`[auth]`, etc.) when logging.

## Comments

**When to Comment:**
- Comments are sparse and explain non-obvious intent only (e.g., the `globalIgnores` note in `eslint.config.mjs`). Code is expected to be self-documenting via descriptive names.

**JSDoc/TSDoc:**
- Not used. No `/**` doc blocks exist in `src/`. Do not introduce JSDoc; rely on TypeScript types and clear names.

## Function Design

**Size:** Small, single-purpose functions. Large modules decompose logic into many local helpers (e.g. `buildStaffAssignments`, `getCreateOwnerId` in `src/app/actions/matches.ts`).

**Parameters:**
- Functions with more than ~2 arguments take a single destructured options object typed inline:
  ```ts
  export function redirectWithNotice(params: {
    redirectTo: string;
    intent: "success" | "error";
    notice: string;
  }) { /* ... */ }
  ```
- Defaults provided inline: `getRedirectTarget(formData: FormData, fallback = "/grid")`.

**Return Values:**
- Helpers return early on the failure/empty case (guard clauses) before the happy path.
- Normalizers return safe empty defaults (`""`, `null`, `[]`) rather than throwing — e.g. `maybeNull`, `pickFirstString`, `sanitizePhone`.

## Module Design

**Exports:**
- Named exports are the norm (157 `export function`, 46 `export const`, 46 `export async function`).
- `export default` is reserved for Next.js page/layout components (17 `export default async function`, 2 `export default function`) and config objects (`next.config.ts`, `eslint.config.mjs`).

**Barrel Files:**
- None. Import each symbol from its explicit module path.

**Layering (enforced by `CONTRIBUTING.md`):**
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

---

*Convention analysis: 2026-06-03*
