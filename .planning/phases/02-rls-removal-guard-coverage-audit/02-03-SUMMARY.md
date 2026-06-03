---
phase: 02-rls-removal-guard-coverage-audit
plan: 03
subsystem: data-loaders-authz
tags: [authz, loaders, user-context, service-role, server-only, vitest]
requires:
  - "src/lib/auth.ts UserContext type (plan 02-01)"
  - "src/test/fixtures/user-context.ts makeUserContext (plan 02-01)"
provides:
  - "All src/lib/data/* loaders take a non-optional ctx: UserContext (D-06 contract)"
  - "src/lib/data/platform-access.ts server-only personHasPlatformAccess helper (D-09)"
  - "(dashboard)/people/page.tsx no longer reaches the service-role admin client"
  - "vitest server-only alias enabling unit tests of server-only modules"
affects:
  - "Wave 2 route conversions (02-02) — loader signatures now require ctx threaded from withAuth"
  - "Wave 3 coverage test (02-05/D-07) — detects the ctx contract structurally"
tech-stack:
  added: []
  patterns:
    - "Loader signature: ctx: UserContext as required leading param (authorization decided at the boundary, not from cookies)"
    - "Service-role reads confined to server-only modules; pages call helpers"
    - "vitest resolve.alias maps server-only to a node stub for direct unit testing"
key-files:
  created:
    - "src/lib/data/platform-access.ts"
    - "src/lib/__tests__/loaders-ctx.test.ts"
    - "src/test/stubs/server-only.ts"
  modified:
    - "src/lib/data/dashboard.ts"
    - "src/lib/data/collaborators.ts"
    - "src/lib/data/announcements.ts"
    - "src/app/(dashboard)/people/page.tsx"
    - "src/app/(dashboard)/layout.tsx"
    - "src/app/(dashboard)/grid/page.tsx"
    - "src/app/(dashboard)/roles/page.tsx"
    - "src/app/(dashboard)/match/[id]/page.tsx"
    - "src/app/(dashboard)/match/[id]/notificar/page.tsx"
    - "src/app/(dashboard)/mi-jornada/page.tsx"
    - "src/app/(dashboard)/mi-jornada/[matchId]/reportar/page.tsx"
    - "src/app/(dashboard)/teams/page.tsx"
    - "src/app/(dashboard)/teams/[slug]/page.tsx"
    - "src/app/(dashboard)/settings/page.tsx"
    - "src/app/api/grid/calendar/route.ts"
    - "src/app/api/collaborator-reports/route.ts"
    - "vitest.config.mts"
decisions:
  - "ctx threaded as a required leading param; loaders still create their own server client internally (D-06 'purity' = authorization is not coupled to cookies, the ctx arg is the contract)."
  - "isUuidLike (collaborators.ts) left ctx-free — pure non-async helper on the coverage-test allowlist."
  - "personHasPlatformAccess preserves the original listUsers→profiles→resolveDashboardAccessRole derivation; only its location moved into a server-only helper (D-09)."
  - "vitest aliases the server-only package to an empty node stub so server-only modules unit-test directly in the node environment."
metrics:
  duration: ~20 min
  completed: "2026-06-03"
  tasks: 3
  files: 20
---

# Phase 2 Plan 03: Loader UserContext Contract + Service-Role Confinement Summary

Every `src/lib/data/*` loader now takes a required `ctx: UserContext` (D-06), all 16 call sites guard at the boundary and thread ctx down, and `(dashboard)/people/page.tsx` no longer reaches the service-role admin client — the platform-access read moved to a new server-only `personHasPlatformAccess` helper (D-09), all proven by 6 new passing tests.

## What Was Built

- **Task 1 (D-06)** — Added a required leading `ctx: UserContext` param to every exported async loader:
  - `dashboard.ts`: `getGridData(ctx, filters)`, `getGridCalendarData(ctx, {...})`, `getMatchDetailData(ctx, matchId)`, `getPeopleData(ctx)`, `getRolesData(ctx)`.
  - `collaborators.ts`: `getCollaboratorDayData(ctx, params)`, `getCollaboratorMatchData(ctx, params)`. `isUuidLike` left unchanged (pure helper, allowlisted).
  - `announcements.ts`: `getActiveAnnouncement(ctx)`, `getLatestAnnouncement(ctx)`.
  - Updated all callers to resolve context at the boundary (`requireUserContext()` in pages, `getUserContext()`→401 in routes) and pass it: grid, roles, both match pages, layout, settings, both teams pages, mi-jornada (day + reportar), and the grid/calendar + collaborator-reports route handlers. Loaders still construct their own server client internally — the ctx arg is the structural authorization contract, not a new query input.
- **Task 2 (D-09)** — Created `src/lib/data/platform-access.ts` (`import "server-only"`) exporting `personHasPlatformAccess(email)`, which wraps the `auth.admin.listUsers` → `profiles.role` → `resolveDashboardAccessRole(...) === "collaborator"` derivation. Removed the `createSupabaseAdminClient` import and the inline admin read block from `(dashboard)/people/page.tsx`; the page now calls the helper. The boundary guard (`requireUserContext()`) and the `user.role === "admin"` gate are preserved; `selectedPersonHasPlatformAccess` behavior is unchanged.
- **Task 3 (tests)** — `src/lib/__tests__/loaders-ctx.test.ts`: invokes `getActiveAnnouncement(makeUserContext())` against a mocked `createSupabaseServerClient` stub (proves a loader runs with a fake ctx, no cookies/session — D-06 testability), and covers `personHasPlatformAccess` across four branches (empty email, collaborator → true, no matching auth user → false, non-collaborator role → false). Added `src/test/stubs/server-only.ts` and a `resolve.alias` in `vitest.config.mts` so server-only modules import cleanly in the node test environment.

## Loaders Changed (final signatures)

| Module | Loader | New signature |
|--------|--------|---------------|
| dashboard.ts | getGridData | `(ctx: UserContext, filters: GridFilters)` |
| dashboard.ts | getGridCalendarData | `(ctx: UserContext, { month, q, league, mode, status, owner, timezone })` |
| dashboard.ts | getMatchDetailData | `(ctx: UserContext, matchId: string)` |
| dashboard.ts | getPeopleData | `(ctx: UserContext)` |
| dashboard.ts | getRolesData | `(ctx: UserContext)` |
| collaborators.ts | getCollaboratorDayData | `(ctx: UserContext, params)` |
| collaborators.ts | getCollaboratorMatchData | `(ctx: UserContext, params)` |
| announcements.ts | getActiveAnnouncement | `(ctx: UserContext)` |
| announcements.ts | getLatestAnnouncement | `(ctx: UserContext)` |

`isUuidLike(value: string)` unchanged (pure, allowlisted).

## platform-access helper signature

```ts
// src/lib/data/platform-access.ts ("server-only")
export async function personHasPlatformAccess(
  email: string | null | undefined,
): Promise<boolean>
```

Returns `true` when an auth user matching `email` exists and their derived dashboard role is `collaborator`; `false` for empty email, no match, read error, or any non-collaborator role.

## Threat Mitigations Applied

- **T-02-06** (EoP, loaders relying on RLS for read authz) — every loader now carries the boundary-resolved ctx; the read path is guard-aware by signature (D-06).
- **T-02-07** (Info Disclosure, people service-role read at render) — admin client removed from the page; service-role confined to the server-only helper (D-09).
- **T-02-08** (EoP, forgotten ctx on a future loader) — the required ctx param makes omission a typecheck failure today; the plan-05 structural coverage test (D-07) enforces it going forward.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] server-only unresolvable in the vitest node environment**
- **Found during:** Task 3 (RED run failed with `Cannot find package 'server-only'`).
- **Issue:** `platform-access.ts` starts with `import "server-only"`, which has no node-environment export; vitest could not import the module under test.
- **Fix:** Added `src/test/stubs/server-only.ts` (empty module) and a `resolve.alias` in `vitest.config.mts` mapping `server-only` to it — mirroring how the framework stubs `server-only` outside the react-server condition.
- **Files modified:** `vitest.config.mts`, `src/test/stubs/server-only.ts`
- **Commit:** 5ac106f

**2. [Scope] people-page getPeopleData() call updated in Task 1 rather than Task 2**
- The plan listed updating `getPeopleData()` → `getPeopleData(user)` under Task 2, but Task 1's `npm run typecheck` verify requires it to compile. Threaded it during Task 1's caller pass; Task 2 still owns the admin-client removal. No behavior difference.

## Verification

- `npm run typecheck` exits 0 (all 16 callers thread ctx).
- `(dashboard)/people/page.tsx` has zero `createSupabaseAdminClient` / `@/lib/supabase/admin` references.
- `npx vitest run src/lib/__tests__/loaders-ctx.test.ts` → 6/6 green.
- Full suite `npm run test` → 3 files, 13 tests, exit 0 (no regression to plan-01's 7 tests).
- `eslint` clean on all changed files.

## TDD Gate Compliance

This plan's Task 3 is a single `tdd="true"` task that characterizes the contract already established by Tasks 1–2 (the loader signatures and the platform-access helper). The RED run failed for an infrastructure reason (`server-only` resolution), which was fixed before GREEN; after the alias the tests pass against the existing implementation. Committed as a single `test(...)` commit since no new production behavior was needed beyond the test-enabling vitest config.

## Self-Check: PASSED

- FOUND: src/lib/data/platform-access.ts, src/lib/__tests__/loaders-ctx.test.ts, src/test/stubs/server-only.ts, 02-03-SUMMARY.md
- FOUND commits: 4030f30 (Task 1), 786f684 (Task 2), 5ac106f (Task 3)
