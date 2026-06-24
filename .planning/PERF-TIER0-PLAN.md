# Perf Tier 0 — quick wins (app-wide, low risk)

**Goal:** five independent low-effort optimizations that touch the whole app, shipped as one commit. No behavior change — same UI, fewer client constructions / smaller initial JS / fewer DB round-trips.

**Source:** synthesized from a 4-agent audit (data-loading, client-bundle, caching/runtime, DB). Tiers 1–3 (`getPeopleData`, cross-request caching, broad streaming) are deliberately out of scope here.

**Quality gate (every item):** `npm run typecheck && npm run lint && npm run build`. Build output is also the verification for the bundle items (4) — compare `/reports` and `/grid` First Load JS before/after.

---

## Item 1 — Supabase service-role client → module singleton
**Impact:** High · **Effort:** Low · **Risk:** Low

`createSupabaseAdminClient()` (`src/lib/supabase/admin.ts:8`) runs `assertSupabaseEnv()` + `assertServiceRoleKey()` and builds a fresh `createClient<Database>()` on **every** call. `createSupabaseServerClient()` (`src/lib/supabase/server.ts:14`) just delegates to it. A single `/grid` render constructs ~7 of these (one per loader). The client is now stateless (no longer cookie-bound — RLS is off, everything uses the service-role key, see `server.ts` comment), so it is safe to reuse one instance for the process.

**Change** (`src/lib/supabase/admin.ts`):
```ts
let cachedAdminClient: SupabaseClient<Database> | null = null;

export function createSupabaseAdminClient() {
  if (cachedAdminClient) {
    return cachedAdminClient;
  }
  assertSupabaseEnv();
  assertServiceRoleKey();
  cachedAdminClient = createClient<Database>(
    appEnv.supabaseUrl,
    appEnv.supabaseServiceRoleKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  return cachedAdminClient;
}
```
- Import `SupabaseClient` type from `@supabase/supabase-js`.
- Keep `server.ts` async + same name — zero caller changes.
- Asserts now run once on first construction (still throw if env missing — acceptable, fail-fast on first DB use).

**Verify:** typecheck/build pass; grid + a couple of pages render (no env-assert regression).

---

## Item 2 — `optimizePackageImports` in next.config.ts
**Impact:** Medium · **Effort:** Trivial · **Risk:** Low

`next.config.ts` is the empty default. `lucide-react` is imported in ~50 files; `date-fns` (+ `es` locale) in many client components.

**Change** (`next.config.ts`):
```ts
const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: ["lucide-react", "date-fns"],
  },
};
```

**Verify:** build succeeds; check First Load JS on icon-heavy routes is flat or lower.

---

## Item 3 — `cache()`-wrap the Gemini config DB read
**Impact:** Medium (honest: per-request dedup; cross-request caching is Tier 2) · **Effort:** Low · **Risk:** Low

`getPortalGeminiConfig()` (`src/lib/settings.ts:50`) hits `app_settings` and is **not** memoized. It is reached via `getGeminiRuntimeConfig` → `getSettingsSnapshot`, consulted on ~8 pages. React `cache()` collapses duplicate calls **within a single request** (e.g. if a layout + page, or page + AI route, both consult settings) to one round-trip.

**Change** (`src/lib/settings.ts`): wrap the DB-only function (it takes no args and reads no cookies, so it caches cleanly):
```ts
import { cache } from "react";
const getPortalGeminiConfig = cache(async () => { /* existing body */ });
```
- Do **not** wrap `getGeminiRuntimeConfig`/`getSettingsSnapshot` — they read `cookies()`; leave them, they call the cached inner fn.

**Note:** the real win for settings is Tier 2 (`"use cache"` + `cacheTag`, survives across requests on the pm2 server). This item is the cheap intra-request guard only.

**Verify:** typecheck/build; AI assistant still detects key presence on grid/people/settings.

---

## Item 4 — code-split heavy client components with `next/dynamic`
**Impact:** Medium–High · **Effort:** Low (4a) → Medium (4b, 4c) · **Risk:** Low–Medium

Zero `next/dynamic` in the codebase today. Three heavy `"use client"` components ship in initial route bundles though they only appear on click/tab.

### 4a — `IncidentsWorkspace` inside `/reports` (cleanest)
`reports-workspace.tsx:31` statically imports `IncidentsWorkspace` (2,417 lines); rendered conditionally at `:3281`. `/reports` currently ships **both** workspaces. `reports-workspace.tsx` is already `"use client"`, so `ssr: false` is allowed here.
```ts
import dynamic from "next/dynamic";
const IncidentsWorkspace = dynamic(
  () => import("@/components/incidents/incidents-workspace").then(m => m.IncidentsWorkspace),
  { ssr: false, loading: () => <WorkspaceFallbackSkeleton /> },
);
```

### 4b — `CreateMatchModal` (1,736 lines)
Importers: `grid-regions.tsx` (server), `match-card-actions.tsx` (client), `grid-table.tsx` (client). It's a `"use client"` modal opened on click but currently ships in the `/grid` initial bundle.
- **Client importers** (`match-card-actions`, `grid-table`): replace static import with `dynamic(() => import(...), { ssr: false })`.
- **Server importer** (`grid-regions`): `ssr: false` is **not** allowed in a Server Component. Create a tiny client wrapper `create-match-modal-lazy.tsx` (`"use client"`) that does the `dynamic(..., { ssr: false })` and re-exports, then render that wrapper from `grid-regions`.
- The modal renders its own trigger button; lazy-loading keeps the trigger but defers the 1,736-line form body to first interaction.

### 4c — `SectionAiAssistant`
Importers (8): server pages `people`/`roles`/`teams`, server `grid-regions`, client `reports-workspace`/`incidents-workspace`, `mi-jornada`. Same split as 4b: client importers use `dynamic` directly; server importers go through a `section-ai-assistant-lazy.tsx` client wrapper. Defers the chat/Gemini panel JS off initial load.

**Verify (4):** `npm run build` — confirm `/reports`, `/grid`, `/people`, `/teams` First Load JS dropped vs the pre-change build numbers. Manually: open a match modal, the incidents tab on reports, and an AI assistant — each loads on demand without error.

**Scope decision:** 4a is unambiguous low-risk — always include. 4b/4c add a small wrapper file each; include in this batch unless we want to keep the commit minimal, in which case they move to a fast follow-up.

---

## Item 5 — kill whole-`profiles`-table scans + JS `.find()`
**Impact:** Medium · **Effort:** Low · **Risk:** Medium (email-case correctness)

Three sites fetch the entire `profiles` table then `.find()` by email in JS, ignoring the existing unique index `profiles_email_lower_key` on `lower(email)` (migration `0015:23`):
- `src/lib/data/platform-access.ts:17` — `select("email, role")` all rows.
- `src/app/actions/people.ts:42` — `findProfileByEmail`, `select("*")` all rows, called multiple times per upsert.
- `src/lib/auth.ts:51` — first-login link path, `select("*").is("auth_user_id", null)` then JS find.

**Change:** replace the table scan with a targeted filter. The existing JS-match comment warns about `_`/`%` being LIKE wildcards — so prefer exact `.eq` on a normalized (lowercased) email, or `.ilike` with `%`/`_`/`\` escaped, matched against the `lower(email)` index. Confirm how emails are stored (lowercased on write?) before choosing `.eq` vs expression match.

**Verify:** login as an existing linked user (no lockout — see constraint in CLAUDE.md); create/update a person whose email matches a profile; confirm platform-access gate still resolves. This item carries the most behavioral risk → test the auth path explicitly.

**Scope decision:** because of the email-case subtlety and auth-path risk, consider shipping items 1–4 first and item 5 as its own verified commit. Recommended: **split 5 out.**

---

## Sequencing & commits

- **Commit A (this batch):** items 1, 2, 3, 4a — pure low-risk wins, no auth/behavior surface. Optionally fold in 4b/4c.
- **Commit B (follow-up):** item 5 alone, with explicit auth/login verification (avoid lockout regression).

One commit per logical change set; stage only the touched files (auto-commit hook bundles the whole tree). Push to `main` auto-deploys to the VPS — verify HEAD match + `.next/lock` gone + pm2 uptime reset after each push (see `portal-deploy` memory).

## Out of scope (later tiers)
- **Tier 1:** `getPeopleData` unbounded all-time assignments scan + `/people`/`/teams` streaming + pagination.
- **Tier 2:** Next 16 `"use cache"`/`unstable_cache` + `cacheTag`/`revalidateTag` for roles, person_functions, announcements, app_settings.
- **Tier 3:** stream `/match/[id]`, parallelize dashboard `layout.tsx`, split monolithic reports/incidents workspaces into server rows + client shell.
