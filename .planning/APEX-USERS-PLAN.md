# Apex user management — per-app roles + super admin

Decision record: `docs/adr/0010-per-app-roles-and-super-admin.md`. This file is the rollout.

## Target model (Auth DB)

```sql
auth_app        (key text pk, label text, sort_order int)
auth_app_role   (app text fk auth_app, key text, label text, description text,
                 rank int, is_admin bool,          -- exactly one is_admin per app
                 legacy_level auth_app_access_level, -- Nivel it equals; dropped at contract
                 primary key (app, key))
auth_app_access (user_id fk auth_user, app text, role text,
                 granted_by, granted_at,
                 primary key (user_id, app),
                 foreign key (app, role) references auth_app_role)
auth_user.role  = 'superadmin' | null              -- admin plugin column

-- view auth_effective_access (user_id, app, role, rank, is_admin, via_superadmin)
-- one row per user+app: a non-banned superadmin resolves every app to its
-- is_admin role regardless of explicit rows (kept, so demotion restores them);
-- everyone else gets their explicit row.
```

Seed catalog:

| app         | roles (rank asc)                                   |
|-------------|----------------------------------------------------|
| portal      | collaborator "Externo", editor "Productor", admin* |
| facturacion | periodista (=read), coordinador (=write), admin*   |
| incidencias | read "Lectura", write "Escritura", admin*          |
| analytics   | read, write, admin*                                |
| ops         | read, write, admin*                                |
| generator   | read, write, admin*                                |

`*` = `is_admin`. Non-portal keys start as the old levels; each app renames later
with a data migration of its own rows.

## Phases

### 1. Expand (Auth DB, portal repo) — no behaviour change
- Migration: create `auth_app`, `auth_app_role`, seed catalog; add nullable
  `auth_app_access.role`, backfill `role = level::text`; convert `app` enum → text
  + FK (keep enum type until phase 5); create `auth_effective_access`.
- Portal `/access` writes both `level` and `role`.
- Tests: integration test for the view (explicit row, super admin synthesis,
  banned super admin excluded).

### 2. Portal moves onto the table
- Seed script (cross-DB, like `seed-generator`): linked Cuentas → `portal` Acceso
  from `profiles.role`; unlinked reported.
- First-login auto-link consumes `profiles.role` of an unlinked Cuenta into an
  Acceso.
- `getUserContext`: role from `auth_effective_access` (app `portal`); `hasAccess`
  = row exists. `can()` / capability table unchanged (keys kept).
- Access requests approve/revoke write `auth_app_access`; `canGrantTier` →
  generic `canGrantRole(actorRank, targetRank)` in `src/lib/acceso/`.
- `profiles.role` stays written (dual-write) until phase 5 for rollback.

### 3. Apex `/usuarios` (portal repo)
- Route group served only when `isApexHost`; middleware 404s it elsewhere and
  refuses non-superadmins (403 → `/no-access`).
- Matrix: identity × app, select per cell from that app's catalog + "Sin acceso";
  super admins show every cell as "Admin (super admin)", locked.
- Per identity: create (email + name, no email sent), ban/unban, sign out
  everywhere (`revokeUserSessions`), toggle super admin (confirm dialog; last one
  can't be demoted). All via Better Auth admin plugin server-side calls.
- Audit: `granted_by`/`granted_at` on rows; super admin toggles logged.
- `/access` → redirect to apex `/usuarios`.
- Bootstrap: script sets the first super admin(s) by email.

### 4. Readers move to the view (one PR per repo, pin same better-auth)
- facturacion-bp: `leerNivel` → read `role` from view; drop `rolDelNivel`
  translation (keep periodista padrón fallback).
- incidencias-bp, data-bp (analytics), basquetpass-operations: gate query → view,
  compare role keys / rank instead of level.
- generator gate (`/api/gates/[app]`, portal) → view.

### 5. Contract
- Drop `auth_app_access.level`, enum types `auth_app_access_level`,
  `auth_app_access_app`; drop `profiles.role` once no unlinked Cuenta holds one.
- Update CONTEXT.md: retire **Nivel**, add **Rol de app**, **Super admin**,
  **Catálogo de roles**; supersede ADR 0009 in part.

## Risks
- Auth DB outage already blocks login everywhere; this adds portal role reads to
  it. Keep the query indexed (pk covers it) and uncached (ADR 0009).
- Phase 4 ordering: contract only after every reader deploys; grep all repos for
  `level` on `auth_app_access` before phase 5.
- Better Auth admin plugin `adminRoles` default is `["admin"]`: configure
  `adminRoles: ["superadmin"]` so its endpoints accept super admins and nobody
  else.
