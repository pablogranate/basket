# Spec — Role catalog + capabilities (architecture review 2026-09-04, candidate 4)

**Branch:** `refactor/roles-catalog` off `main`
**Status (2026-09-04):** implemented on `refactor/roles-catalog`; `npm run check` + `test:integration` green; 0041 applied to the local portal DB. Prod still needs 0041 via docker exec before merge. Deviation from §5: path-gating helpers in `constants.ts` kept their role-only signatures (they run after `requireAccess`, and client nav components only hold the role); internals go through `can`.
**Predecessors:** candidates 1+2 of the same review shipped (`59453f8`, merged to main).

---

## 0. Environment gotchas

- Skip GSD. Work this file directly, no `gsd-*` skills.
- One commit at the end. Stage related files explicitly; the auto-commit hook bundles the tree.
- Quality gate: `npm run check`, then `npm run test:integration` (needs `podman start basket-portal-db basket-auth-db`, ports 5434/5433). Local portal DB drifts from `supabase/migrations/`; replay pending migrations with psql before running integration tests.
- Merging to `main` deploys. Migration 0041 must run on prod before the restart lands (`docker exec` into `basket-portal-db`, see memory `prod-migrations-docker-exec`). Order on deploy day: run 0041, then merge.

---

## 1. Problem

Authorization sets are declared in many places and have already drifted:

| Set | Members today | Declared where |
|---|---|---|
| Full-access (dashboard shell, generator gate) | admin, editor, coordinator | `constants.ts:107`, `auth-access.ts:30`, `auth-access.ts:37-41` |
| Can edit | admin, editor, coordinator, collaborator | `auth.ts:94-97`; `test/integration/db.ts:54` says admin‖editor (wrong) |
| Grantable tier / has login | admin, editor, collaborator | `access-tier.ts`, `platform-access.ts:11` (copy), `people/page.tsx:114-119`, `create-person-modal.tsx:31`, `access-request-decision-form.tsx:12` |
| Approver | admin, editor | `auth-access.ts:61` |
| Admin-only | admin | 13 literal `=== "admin"` sites |

`coordinator` and `viewer` are dead: migration 0016 folded their rows (coordinator→editor, viewer→collaborator) and left the enum intact. Code still carries both, including a rule (D-06: coordinator cannot approve) about a role nobody holds. `viewer` doubles as the in-code sentinel for no-session / unprovisioned contexts.

---

## 2. Decisions (agreed)

1. **Drop `coordinator` and `viewer` from the enum.** Live roles = grantable tiers = `admin | editor | collaborator`. `AppRole` becomes that type; `AccessTierRole` disappears (same thing).
2. **`profiles.role` loses its default.** NOT NULL, no default. Every write path already sets it explicitly; this keeps it that way.
3. **Sentinel for no-session / unprovisioned contexts:** `role: "collaborator"`, `hasAccess: false`. Keeps the field non-null so the 166 `canEdit`/`role` consumers don't churn.
4. **Capability interface takes the context, not the role.** `can(ctx, cap)` folds the `hasAccess` gate in, so the sentinel from (3) can never pass a check. This is the deepening move.
5. **Tier granting is a parametrised capability**, not a separate role→role function.
6. **Path gating stays in `constants.ts`**, internals switch to `can`. Old export names are kept so importers don't churn this PR.
7. **`canEdit` stays a cached field on `UserContext`**, derived from the same table.
8. **Five capabilities.** `access.approve` coincides with `dashboard.full` today; kept as its own row because it records a policy decision (D-06), not a coincidence.

---

## 3. Interface — `src/lib/roles.ts`

Pure module. No `server-only`, no db imports (the parse layer and client components import it).

```ts
import type { AppRole } from "@/lib/database.types";

export const APP_ROLES = ["admin", "editor", "collaborator"] as const satisfies ReadonlyArray<AppRole>;

export const APP_ROLE_LABELS: Record<AppRole, string> = {
  admin: "Admin",
  editor: "Productor",
  collaborator: "Externo",
};

// Ordered least → most privileged, for selects.
export const ACCESS_TIER_OPTIONS: ReadonlyArray<{ value: AppRole; label: string }> = [
  { value: "collaborator", label: APP_ROLE_LABELS.collaborator },
  { value: "editor", label: APP_ROLE_LABELS.editor },
  { value: "admin", label: APP_ROLE_LABELS.admin },
];

export type Capability =
  | "dashboard.full"   // full content shell, generator gate, reports API
  | "edit"             // any mutation of domain data (requireEditor)
  | "access.manage"    // grant/revoke platform access (tier-limited, see access.grant)
  | "access.approve"   // decide access requests (D-06: a productor job)
  | "admin";           // settings, logs, roles catalog, tier select, delete-with-revoke

const CAPABILITY_ROLES = {
  "dashboard.full": ["admin", "editor"],
  edit: ["admin", "editor", "collaborator"],
  "access.manage": ["admin", "editor"],
  "access.approve": ["admin", "editor"],
  admin: ["admin"],
} as const satisfies Record<Capability, ReadonlyArray<AppRole>>;

export type Actor = { role: AppRole; hasAccess: boolean };

export function can(actor: Actor | null | undefined, cap: Capability): boolean;
// Admins grant any tier; productores grant Externo only. Requires access.manage.
export function canGrantTier(actor: Actor | null | undefined, tier: AppRole): boolean;
export function normalizeAccessTier(value: string): AppRole; // unknown → "collaborator"
export function isAppRole(value: string): value is AppRole;

export const CAPABILITY_DENIED_MESSAGE: Record<Capability, string>;
```

`auth-access.ts` shrinks to the async guards:

```ts
export async function requireCapability(cap: Capability): Promise<UserContext>;
// Thin named wrappers kept for readability at call sites:
export const requireAdmin = () => requireCapability("admin");
export const requireAccessManager = () => requireCapability("access.manage");
export const requireAccessRequestApprover = () => requireCapability("access.approve");
```

`requireEditor` in `auth.ts` becomes `requireCapability("edit")` semantics (message unchanged: "No tenes permisos para editar.").

Denied messages (keep existing Spanish copy):

| cap | message |
|---|---|
| admin | Solo un admin puede realizar esta accion. |
| access.manage | No tenes permisos para gestionar accesos a la plataforma. |
| access.approve | No tenes permisos para aprobar solicitudes de acceso. |
| edit | No tenes permisos para editar. |
| dashboard.full | No tenes permisos para acceder a esta seccion. |

---

## 4. Migration — `supabase/migrations/0041_app_role_three_values.sql`

Preconditions verified: `current_app_role()` dropped in 0011; `profiles.role` is the only column typed `app_role` (`access_requests.access_role` is text); 0016 already zeroed legacy rows.

```sql
-- 0041: shrink app_role to the three live values. 0016 folded the rows;
-- this drops the labels. Postgres cannot drop enum values, so swap the type.
-- Also drops the column default: every write path sets role explicitly.
do $$
begin
  if exists (select 1 from public.profiles where role::text in ('coordinator','viewer')) then
    raise exception 'profiles still hold coordinator/viewer rows; run 0016 first';
  end if;
end $$;

create type public.app_role_next as enum ('admin', 'editor', 'collaborator');

alter table public.profiles
  alter column role drop default,
  alter column role type public.app_role_next using role::text::public.app_role_next;

drop type public.app_role;
alter type public.app_role_next rename to app_role;
```

Non-reversible by design (a down would re-add labels nobody uses). Idempotency: guarded by the type swap failing loudly if re-run; acceptable, matches 0011 style.

Code mirrors:
- `src/lib/db/schema.ts:5` → `pgEnum("app_role", ['admin','editor','collaborator'])`; line 12 drop `.default('viewer')`.
- `src/lib/database.types.ts:1099` and `:1228` → three values.

---

## 5. Changes by file

### Create
- `src/lib/roles.ts` — §3.
- `src/lib/__tests__/roles.test.ts` — matrix: every `APP_ROLES` × every `Capability` asserted explicitly (a table in the test, not derived from the module). Plus: `hasAccess:false` denies everything for every role; `null` actor denies; `canGrantTier` matrix (3 actors × 3 tiers); `normalizeAccessTier` fallbacks.
- `supabase/migrations/0041_app_role_three_values.sql` — §4.

### Delete
- `src/lib/access-tier.ts` — folded into `roles.ts`.
- `src/lib/data/platform-access.ts` role literal + "kept in sync" comment → `isAppRole(profile.role)`. File stays (it's the DB lookup); only the set goes.
- `requireAdminAccessManager` (`auth-access.ts:18`) — zero callers.
- `isAccessManagerRole`, `canManageAccessTier`, `isAccessRequestApproverRole`, `FULL_DASHBOARD_ACCESS_ROLES`, `hasFullDashboardAccessRole`, `isAdminDashboardRole`, `isCollaboratorLimitedRole` — replaced. Keep `hasFullDashboardAccessRole` / `isCollaboratorLimitedRole` as one-line re-exports over `can` ONLY if the importer count makes inline replacement noisy; prefer replacing.
- `APP_ROLE_DISPLAY_NAMES` in `display.ts:55` → re-export of `APP_ROLE_LABELS`; `getAppRoleDisplayName` loses the "Externo" viewer fallback.

### Route through `can`
- `src/lib/auth.ts:83` sentinel `"viewer"` → `"collaborator"` (two places + no-profile branch). `:94-97` `canEdit: can({ role, hasAccess: true }, "edit")`. `requireEditor` unchanged shape.
- `src/lib/constants.ts` path gating: admin branch → `can(_, "admin")`, full-access → `can(_, "dashboard.full")`. Signatures currently take `role?: AppRole | null`; change to take `Actor | null | undefined`. Callers: `layout.tsx`, `dashboard-shell.tsx`, `middleware`, `apex` helpers, `teams/page.tsx`, `people/page.tsx`, `api/gates/[app]`, `api/grid/reports`. Check each passes the context, not a bare role.
- `src/lib/api/with-auth.ts` — `roles?: ReadonlyArray<AppRole>` → `capability?: Capability`. Two callers: `api/ai/people/route.ts:37` → `"dashboard.full"`, `api/grid/reports/route.ts:45` → `"dashboard.full"`, `api/gates/[app]/route.ts` allowlist becomes `Record<string, Capability>`.
- 13 `=== "admin"` sites → `can(user, "admin")`: `settings/page.tsx` ×4, `people/page.tsx:109`, `actions/people.ts:217`, `actions/settings.ts:103`, `data/sync-logs.ts:36`, `data/notification-logs.ts:41`.
- `people/page.tsx:114-119` inline tier narrowing → delete; `selectedPersonAccessRole` already is `AppRole | null`.
- `people/page.tsx:278`, `dashboard-shell.tsx:81`, `actions/people.ts:68,302-303`, `actions/access-requests.ts:114` → `canGrantTier(ctx, tier)`.
- `create-person-modal.tsx:31-33`, `access-request-decision-form.tsx:12-14` → import `ACCESS_TIER_OPTIONS`. Decision form's local labels go.
- `person-access-role-form.tsx`, `collaborator-shell.tsx` — consumers of display names; swap import.
- `src/lib/actions/parse/people.ts`, `parse/access-requests.ts` — import `normalizeAccessTier` from `roles.ts`.
- Loaders with `void ctx` (`src/lib/data/access-requests.ts:69,83,105,133`, `src/lib/access-requests/review.ts:22`) → `if (!can(ctx, "access.approve")) throw new Error(CAPABILITY_DENIED_MESSAGE["access.approve"])`. Check each loader's actual audience first; `getOwnAccessRequest` (used by `/no-access`) is the applicant's own row and must NOT gate on approve.

### Tests / fixtures
- `src/test/integration/db.ts:54` → `canEdit: can({ role, hasAccess: true }, "edit")`.
- `src/test/fixtures/user-context.ts:54` guest role `"viewer"` → `"collaborator"`.
- `src/lib/__tests__/role-access.test.ts` — drop `coordinator`/`viewer` `describe.each` rows; viewer cases become "hasAccess:false" cases.
- `src/lib/__tests__/auth-access.test.ts` — rewrite against `requireCapability`; keep the issue references in describe titles.
- `src/lib/__tests__/display-app-role.test.ts` — drop viewer/coordinator expectations.
- `src/app/actions/__tests__/active-flag-persistence.test.ts` — imports a constant from the deleted set; update.
- Comments mentioning viewer/coordinator: `my-day-assignments-panel.tsx:70`, `auth-access.ts:26-28,58-59`, `actions/people.ts:48-50,67`.

---

## 6. Verification

1. `npm run check` — 0 lint errors, typecheck clean, unit tests green, build ok.
2. `npm run test:integration` against local DB after applying 0041 locally.
3. `grep -rn '"coordinator"\|"viewer"' src --include=*.ts --include=*.tsx` → only `database.types.ts` history-free; expect zero hits.
4. `grep -rnE 'role\s*(===|!==)\s*"' src` → only inside `roles.ts`.
5. Manual: log in as admin, editor, collaborator locally (magic-link flow, memory `localhost-login-magic-link`). Check: /settings visible only to admin; /people tier select only for admin; productor can grant/revoke Externo only; unprovisioned user lands on /no-access and cannot reach /mi-jornada.
6. Prod deploy: apply 0041 via docker exec **before** merging; confirm `select enum_range(null::app_role)` returns three values.

---

## 7. Out of scope

- Moving path-gating functions out of `constants.ts` into `roles.ts`.
- Expressing the productor-grants-Externo-only rule as a full role×tier matrix.
- Candidate 3 (PersonForm), 5 (defineAction value outcome), 6 (grid view-model) — independent, next picks.
