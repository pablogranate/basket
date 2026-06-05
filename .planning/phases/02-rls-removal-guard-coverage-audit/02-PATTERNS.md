# Phase 2: RLS Removal & Guard Coverage Audit - Pattern Map

**Mapped:** 2026-06-03
**Files analyzed:** 18 (new + modified)
**Analogs found:** 14 / 18 (4 have no analog — test infra is greenfield)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/lib/api/with-auth.ts` (NEW) | middleware (route HOF) | request-response | `src/app/api/team-logo/route.ts` (getUserContext→401) + `src/lib/auth.ts` (`requireEditor`) | role-match (HOF is new shape) |
| `src/lib/audit.ts` (NEW) | utility (stamp + audit writer) | transform / CRUD | `supabase/migrations/0001_initial.sql` `set_row_metadata`/`log_audit_event` (DB→app port); `collaborator-reports/route.ts` (manual `reporter_profile_id` stamp) | role-match (porting trigger logic) |
| `src/lib/api/rate-limit.ts` (NEW) | utility (rate limiter) | event-driven | none in repo | no analog |
| `src/lib/api/__tests__/guard-coverage.test.ts` (NEW) | test (static analysis) | batch / file-I/O | none (no test runner exists) | no analog |
| `src/lib/api/__tests__/with-auth.test.ts` (NEW) | test (unit) | request-response | none | no analog |
| `src/lib/__tests__/audit.test.ts` (NEW) | test (unit/integration) | CRUD | none | no analog |
| `src/lib/__tests__/settings-secret.test.ts` (NEW) | test (unit) | CRUD | none | no analog |
| `vitest.config.mts` (NEW) | config | — | `eslint.config.mjs`, `next.config.ts` (ESM config style) | partial |
| `supabase/migrations/0010_*.sql` (NEW) | migration (teardown) | — | `supabase/migrations/0009_add_contacts.sql` + `0001_initial.sql` (defines what to drop) | exact (style) |
| `src/app/api/ai/people/route.ts` (CHANGED) | controller (route handler) | request-response | `src/app/api/team-logo/route.ts` (target guarded shape) | exact |
| `src/app/api/ai/section/route.ts` (CHANGED) | controller | request-response | `team-logo/route.ts` + D-05 guest path | exact |
| `src/app/api/ai/metric-capture/route.ts` (CHANGED) | controller | request-response | `team-logo/route.ts` + D-05 guest path + rate-limit | exact |
| `src/app/api/ai/speedtest/route.ts` (CHANGED) | controller | request-response | `team-logo/route.ts` | exact |
| `src/app/api/matches/intake/route.ts` (CHANGED) | controller (machine route) | request-response | none clean (no machine-auth precedent) | partial (Open Q1) |
| `src/lib/data/dashboard.ts` (CHANGED) | service (data loader) | CRUD (read) | itself — add ctx arg per D-06 | exact (signature change) |
| `src/lib/data/collaborators.ts` (CHANGED) | service (data loader) | CRUD (read) | itself | exact |
| `src/lib/data/announcements.ts` (CHANGED) | service (data loader) | CRUD (read) | itself | exact |
| `src/app/(dashboard)/people/page.tsx` (CHANGED) | component (RSC page) | request-response | itself — drop `createSupabaseAdminClient` (D-09) | exact |
| `package.json` / `.github/workflows/ci.yml` (CHANGED) | config | — | current files (add `test` step) | exact |

## Pattern Assignments

### `src/lib/api/with-auth.ts` (NEW — route HOF, D-04/D-05)

**Analog:** `src/app/api/team-logo/route.ts` (the canonical `getUserContext()`→401 pattern this HOF generalizes) + `src/lib/auth.ts` (the role source it must reuse).

**Imports pattern** (from `team-logo/route.ts:1-4` and `auth.ts:3`):
```typescript
import { NextResponse } from "next/server";
import { getUserContext } from "@/lib/auth";
```
Note: `AppRole` for the `roles` option comes from `@/lib/database.types` (use `import type`). RESEARCH sketch (02-RESEARCH.md lines 174-226) is the target signature.

**Auth/guard pattern to centralize** (`team-logo/route.ts:6-14` — the exact behavior to lift into the HOF):
```typescript
export async function GET(request: Request) {
  const user = await getUserContext();

  if (!user.userId) {
    return NextResponse.json(
      { error: "Debes iniciar sesión para consultar los escudos." },
      { status: 401 },
    );
  }
  // ...handler body
}
```

**Role-check source (MUST reuse, never re-derive):** the resolved `user.role` from `getUserContext()` (`auth.ts:88-103`), which already runs `resolveDashboardAccessRole`. The 403 path checks `options.roles.includes(context.role)`. Error copy convention: Spanish message + `{ status }` (matches every existing route). 401 copy precedent: `"Debes iniciar sesión..."`; 403 copy precedent: `requireEditor` throws `"No tenes permisos para editar."` (`auth.ts:120`).

**Type seam for tests:** export `UserContext` (`Awaited<ReturnType<typeof getUserContext>>`) from `auth.ts` so loaders (D-06) and tests can import it. RESEARCH recommends mocking `getUserContext` via `vi.mock("@/lib/auth")` (02-RESEARCH.md line 510).

---

### `src/lib/audit.ts` (NEW — app-side stamping + audit writer, AUTHZ-03)

**Analog (logic to port):** `supabase/migrations/0001_initial.sql:90-162` — `set_row_metadata` (lines 90-104) and `log_audit_event` (lines 106-162). The app helper replaces these DB triggers.

**`set_row_metadata` logic being ported** (`0001_initial.sql:90-104`):
```sql
if tg_op = 'INSERT' then
  new.created_at = coalesce(new.created_at, timezone('utc', now()));
  new.created_by = coalesce(new.created_by, auth.uid());
end if;
new.updated_at = timezone('utc', now());
new.updated_by = auth.uid();
```
→ becomes `stampInsert(ctx, payload)` / `stampUpdate(ctx, payload)` setting `created_by`/`updated_by` = `ctx.userId` (02-RESEARCH.md lines 260-265).

**`log_audit_event` insert shape to replicate app-side** (`0001_initial.sql:141-158`): writes to `audit_log` columns `table_name, record_id, match_id, action, changed_by, before, after`. The `match_id` derivation rule (lines 122-126 / 132-136): `matches` → row id; `assignments` → row's `match_id`; else `null`. `changed_by` was `auth.uid()` → becomes `ctx.userId`. **Hard constraint: never NULL** (D-02). Capture `before`/`after` jsonb for parity (Open Q4); redact `secret_value` on the `app_settings` audit path.

**Closest existing app-side stamp precedent** (`collaborator-reports/route.ts:124`):
```typescript
reporter_profile_id: user.userId,   // app already resolves+writes a profile id here
submitted_at: new Date().toISOString(),
```
This is the only place app code currently stamps an actor id — the model `stampInsert` generalizes.

**Audit table columns** (schema, `0001_initial.sql:72-82`): `audit_log(table_name, record_id, match_id, action, changed_by, before, after, created_at)`. `created_at` has a DB default; the writer sets the rest.

**Convention:** new module, named exports, `import type { UserContext } from "@/lib/auth"`, bracketed `console.error` on failure (`[audit]`).

---

### `src/app/api/ai/{people,section,metric-capture,speedtest}/route.ts` (CHANGED — wrap in withAuth, D-04/D-05)

**Analog:** `src/app/api/team-logo/route.ts` (already-guarded target shape).

**Current state (unguarded — `ai/people/route.ts:35`):**
```typescript
export async function POST(request: Request) {
  const payload = requestSchema.safeParse(await request.json());
  // ...no auth at all; calls getGeminiRuntimeConfig() → paid Gemini
}
```

**Target (wrap export in withAuth):**
```typescript
// no-guest route (ai/people)
export const POST = withAuth({ roles: ["admin", "editor", "coordinator"] }, async (request, ctx) => {
  const payload = requestSchema.safeParse(await request.json());
  // ...existing body unchanged
});

// guest-allowed routes (ai/metric-capture, ai/section under ALLOW_GUEST_MI_JORNADA) — D-05
export const POST = withAuth({ allowGuest: true }, async (request, ctx) => {
  // existing body + rate-limit guard (rate-limit.ts) on the guest path
});
```
Keep existing Zod `safeParse`→400 (`ai/people/route.ts:36-43`), `getGeminiRuntimeConfig` call (line 45), and bracketed `console.error("[ai][people] ...")` logging (line 90). Guest whitelist source of truth: `ALLOW_GUEST_MI_JORNADA` in `src/lib/supabase/middleware.ts` (~lines 68-72).

---

### `src/app/api/matches/intake/route.ts` (CHANGED — machine route, Open Q1)

**Analog:** none clean — this route has **no auth today** (`intake/route.ts:1` imports only `NextResponse`) and serves a machine caller, not a session. Do NOT apply session-based `withAuth({roles})` blindly (Pitfall 2, 02-RESEARCH.md lines 408-411).

**Pattern note:** needs an API-key/shared-secret variant (`withApiKey` or a `withAuth` mode) checked from a header, not a Supabase cookie. The D-07 coverage test must still see *some* wrapper marker on this file. **Blocked on Open Q1** — confirm caller's auth capability with the user before planning the exact wrapper. Hand-rolled header parsing should follow the defensive `firstString`/`getPathValue` walkers already in this file (`intake/route.ts:3-21`).

---

### `src/lib/data/{dashboard,collaborators,announcements}.ts` (CHANGED — pure loaders + ctx arg, D-06)

**Analog:** each loader itself — only the signature changes.

**Current loaders (no ctx, self-fetch):**
- `dashboard.ts:529` `export async function getPeopleData(): Promise<PersonListItem[]>`
- `dashboard.ts:239` `getGridCalendarData({...})`, `:77` `getGridData(filters)`, `:330` `getMatchDetailData(matchId)`, `:622` `getRolesData()`
- `collaborators.ts:584` `getCollaboratorDayData({...})`, `:654` `getCollaboratorMatchData({...})`
- `announcements.ts:37` `getActiveAnnouncement()`, `:41` `getLatestAnnouncement()`

**Target (add typed non-optional ctx — 02-RESEARCH.md lines 241-250):**
```typescript
import type { UserContext } from "@/lib/auth";

export async function getPeopleData(ctx: UserContext): Promise<PersonListItem[]> {
  const supabase = await createSupabaseServerClient(); // loader still makes its own client
  // ctx is the structural guard marker the D-07 test detects
}
```
**Allowlist for the coverage test:** `isUuidLike` (`collaborators.ts:134`) is a pure non-async helper with no DB access — exclude it explicitly (it must NOT require a ctx arg). The loaders keep reading cookies via the client factory; D-06 "purity" = not coupling the *authorization decision* to cookies, the ctx arg is the contract (02-RESEARCH.md line 251).

**Caller pattern** (boundary guard, already in `grid/calendar/route.ts:13-20` and `people/page.tsx:168`):
```typescript
const user = await requireUserContext(); // or getUserContext()→401 in routes
const allPeople = await getPeopleData(user);   // pass ctx down
```

---

### `src/app/(dashboard)/people/page.tsx` (CHANGED — drop admin client, D-09)

**Analog:** itself — remove the service-role read.

**Code to remove** (`people/page.tsx:48` import + `:211-249` usage block):
```typescript
import { createSupabaseAdminClient } from "@/lib/supabase/admin";   // line 48 — REMOVE
// ...
const supabaseAdmin = createSupabaseAdminClient();                  // line 215
const usersResult = await supabaseAdmin.auth.admin.listUsers({...}); // line 216 — REMOVE from page
```
**Replacement:** re-derive `selectedPersonHasPlatformAccess` from `profiles` via the normal server client, OR move the `listUsers` read into a `server-only` helper the guarded page calls (Pitfall 4, 02-RESEARCH.md lines 418-421). Constraint: the **page module** must not import `admin.ts`; a `server-only` helper still may (like `people.ts` actions). It already guards at boundary (`requireUserContext()` line 168) and gates on `user.role === "admin"` (line 213) — keep both.

**`getPeopleData` call updates** to pass ctx (line 169): `await getPeopleData(user)`.

---

### `supabase/migrations/0010_*.sql` (NEW — teardown, lands LAST per D-02)

**Analog:** `supabase/migrations/0009_add_contacts.sql` (file style) — inverse of its `create trigger ... / enable row level security / create policy` blocks (lines 27-40).

**SQL style to follow** (from `0009`): lowercase keywords, leading `--` comment header, `drop ... if exists`, `public.`-qualified names. Teardown is the reverse:
```sql
-- 0010: Drop RLS policies + auth.uid() triggers (Phase 2 / D-02 / D-03).
drop trigger if exists club_contacts_metadata on public.club_contacts;
drop trigger if exists club_contacts_audit on public.club_contacts;
alter table public.club_contacts disable row level security;
drop policy if exists "domain_select_authenticated_club_contacts" on public.club_contacts;
-- ...repeat per table
drop function if exists public.set_row_metadata();
drop function if exists public.log_audit_event();
drop function if exists public.can_edit();
drop function if exists public.can_read();
drop function if exists public.current_app_role();
```

**Exact drop inventory** is enumerated in 02-RESEARCH.md lines 341-373 (every policy across migrations 0001/0003/0004/0006/0007/0008/0009, every `set_row_metadata`/`log_audit_event` trigger, helper fns). **Do NOT drop** (02-RESEARCH.md lines 368-372): `handle_new_user()` + `on_auth_user_created` (Phase 4), the `created_by`/`updated_by`/`changed_by` columns, the `app_role` enum. Applied manually (CLAUDE.md: migrations applied by hand).

---

### Test infrastructure (NEW — no analog; greenfield)

No test runner exists (`package.json:11` `check` = lint + typecheck + build only; CI `ci.yml` has Lint/Typecheck/Build steps, no test). Planner uses RESEARCH sketches (02-RESEARCH.md Patterns 1-4, lines 283-307; Wave 0 gaps lines 518-526) — there is nothing in the codebase to copy from.

- **`vitest.config.mts`** — ESM config; nearest style precedent is `eslint.config.mjs` / `next.config.ts` (default-export config object). Plugins: `[tsconfigPaths(), react()]`, `environment: 'node'` (02-RESEARCH.md line 497).
- **`package.json`** — add `"test": "vitest run"` and fold into `check` (line 11). Install: dev deps `vitest`, `@vitejs/plugin-react`, `vite-tsconfig-paths`; runtime `rate-limiter-flexible` (gate behind `checkpoint:human-verify`, 02-RESEARCH.md line 106).
- **`.github/workflows/ci.yml`** — add a `Test` step after Typecheck (mirror the existing `run: npm run ...` step format).
- **`guard-coverage.test.ts`** — static source analysis (read `src/app/api/**/route.ts` + `src/lib/data/*.ts`, assert `withAuth(` marker / ctx arg). Allowlist `api/health/route.ts` and `isUuidLike`.
- **`settings-secret.test.ts`** — covers D-08; the gated read lives in `getGeminiRuntimeConfig`/`getPortalGeminiConfig` (`settings.ts:50-86`). Add an admin-role gate on `secret_value` reads.

## Shared Patterns

### Authentication / Authorization (the single role source)
**Source:** `src/lib/auth.ts` (`getUserContext` lines 28-104, `requireUserContext` 106-114, `requireEditor` 116-124) + `src/lib/auth-access.ts` (`requireAdminAccessManager`).
**Apply to:** every route (via `withAuth`), every RSC page boundary, every loader caller.
- Role is `resolveDashboardAccessRole({ profileRole, appMetadata })` (`auth.ts:88-91`) — **never read role from a single source** (CLAUDE.md anti-pattern). `withAuth` and the secret gate (D-08) must use `context.role`, not raw `profiles.role`.
```typescript
const context = await getUserContext();
if (!context.userId) { /* 401 */ }
if (options.roles && !options.roles.includes(context.role)) { /* 403 */ }
```

### Error response shape (routes)
**Source:** every existing route handler — `team-logo/route.ts:10-13`, `ai/people/route.ts:38-43`, `collaborator-reports/route.ts:90-95`.
**Apply to:** `withAuth` 401/403 responses and all route handlers.
```typescript
return NextResponse.json({ error: "<Spanish message>" }, { status: 401 | 403 | 400 | 502 | 500 });
```
Server-action paths instead throw / `redirectWithNotice` (`matches.ts:267`) and call `rethrowNavigationError` first in catch (`helpers.ts`) — do NOT change that; routes use JSON, actions use redirect.

### Input validation
**Source:** `ai/people/route.ts:7-23` + `:36-43` (Zod `safeParse`→400); `collaborator-reports/route.ts:13-49`.
**Apply to:** keep existing Zod schemas inside the wrapped handler body unchanged when adding `withAuth`.

### Actor stamping on writes (NEW shared concern)
**Source (to build):** `src/lib/audit.ts`; precedent stamp `collaborator-reports/route.ts:124`.
**Apply to (write-path inventory, 02-RESEARCH.md lines 389-398):** `src/app/actions/{matches,people,roles,settings,auth}.ts`, `src/app/api/collaborator-reports/route.ts`, `src/app/api/matches/intake/route.ts`. Every insert/update payload calls `stampInsert`/`stampUpdate`; every mutation calls `writeAudit`. Confirmed gap: `createMatchAction` (`matches.ts:210-228`) builds its insert payload with **no** `created_by`/`updated_by` — these MUST be added before the 0010 teardown (D-02).

### Logging
**Source:** `auth.ts:51` `console.error("[auth] ...")`, `ai/people/route.ts:90` `console.error("[ai][people] ...")`, `settings.ts:61` `console.error("[settings] ...")`.
**Apply to:** new modules use bracketed prefixes — `[audit]`, `[api]`/`[with-auth]`, `[rate-limit]`.

### Service-role isolation
**Source:** `src/lib/supabase/admin.ts` (`import "server-only"`).
**Apply to:** any new `server-only` helper that wraps `listUsers` for D-09. The `people/page.tsx` module itself must drop the `admin.ts` import (D-09).

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/lib/api/rate-limit.ts` | utility | event-driven | No rate-limiting exists in the repo; new concern (D-05). Use `rate-limiter-flexible` (memory) or a small `Map`. |
| `src/lib/api/__tests__/*.test.ts`, `src/lib/__tests__/*.test.ts` | test | various | No test runner, zero test files in the repo (CI = lint/typecheck/build only). Greenfield — follow RESEARCH sketches + official Next.js Vitest guide. |
| `vitest.config.mts` | config | — | No prior test config; only loose ESM-config style analogs (`eslint.config.mjs`). |
| `src/app/api/matches/intake/route.ts` (machine auth) | controller | request-response | No machine/API-key auth precedent in the repo; blocked on Open Q1 (caller capability). |

## Metadata

**Analog search scope:** `src/app/api/**`, `src/lib/auth*.ts`, `src/lib/data/*`, `src/lib/settings.ts`, `src/app/actions/matches.ts`, `src/app/(dashboard)/people/page.tsx`, `supabase/migrations/0001` + `0009`, `package.json`, `.github/workflows/ci.yml`.
**Files scanned:** ~16 source files + 2 migrations + 2 config files.
**Pattern extraction date:** 2026-06-03
