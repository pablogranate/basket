# Unified auth — Auth DB migrations, Acceso seed, pinned Better Auth

Companion to ADR 0009 and `CONTEXT.md` "Unified auth". Applies to the portal
(Auth server); readers have their own pointer ADRs.

## Pinned Better Auth version

The portal pins `better-auth` **exactly** (no caret) in `package.json`:

| Package       | Version  |
|---------------|----------|
| `better-auth` | `1.6.15` |

Every Session reader (analytics, ops hub, incidencias, facturacion) must pin the **same**
version: they read the cookie the portal writes, and a session-format change
on one side silently logs everyone out on the other. Bump here first, then in
each reader in the same rollout.

## Auth DB migrations

Auth DB schema lives in `src/lib/auth/schema.ts`; migrations in `drizzle/auth/`.

```bash
pnpm db:auth:generate --name <slug>   # after editing the schema
pnpm db:auth:migrate                  # applies drizzle/auth to AUTH_DATABASE_URL
```

`0001_acceso_app_access` adds `auth_app_access` (one Acceso per identity and
app, enums `auth_app_access_app` and `auth_app_access_level`). Adding a sibling
app is a deliberate migration extending the `app` enum.

Before running `db:auth:migrate` against a database whose tables were not
created by this journal, check `drizzle.__drizzle_migrations` exists and lists
`0000_careful_iron_lad`; otherwise mark the baseline applied first (same
approach as `scripts/db/mark-baseline-applied.sh` for the portal DB).

`0003_role_catalog` (ADR 0010, #185) adds the Catálogo de roles
(`auth_app`, `auth_app_role`, seeded), turns `auth_app_access.app` into text
with an FK to `auth_app`, adds `role` backfilled from `level` through each
role's `legacy_level`, makes `level` nullable, and creates the view
`auth_effective_access`. Readers keep reading `level` untouched; the portal
writes both columns. Expand-only: no reader needs to deploy with it. Check
after migrating:

```sql
SELECT count(*) FROM auth_app_access WHERE role IS NULL;  -- must be 0
SELECT app, role, level, count(*) FROM auth_app_access GROUP BY 1, 2, 3;
```

Super admins are `auth_user.role = 'superadmin'`; set the first ones with the
bootstrap script (see "Users section" below), then from `/usuarios`.

`0004_audit_log` (#187) adds `auth_audit_log`: one row per identity-level
change made from `/usuarios` or the bootstrap script (create, ban, unban,
sign out everywhere, super admin set/removed). Additive only.

## Deploy-day seed: generator Acceso for admins and editors

The generator gate (`/api/gates/generator`) now admits a `generator` Acceso at
any Nivel, not the portal's full-access roles. So that nothing changes for
admins and editors on deploy day, seed them once, right after the migration:

```bash
pnpm db:auth:seed-generator -- --dry-run   # prints the plan, writes nothing
pnpm db:auth:seed-generator                # grants generator/write
```

Needs `DATABASE_URL` (Domain DB: reads Cuentas) and `AUTH_DATABASE_URL` (Auth
DB: writes Accesos), taken from `.env.local` when present. It is cross-database
on purpose, which is why it is a script and not a SQL migration.

Rules: linked Cuentas (`profiles.auth_user_id`) are granted directly; unlinked
ones are matched to an identity by email, case-insensitively, like the
first-login auto-link; an existing `generator` row is never touched (an admin
may have changed its Nivel); a full-access Cuenta with no identity yet is
reported, not created. Seeded rows have `granted_by = null` (no admin granted them). Idempotent — safe to re-run after people log in for the
first time.

## Deploy-day seed: portal Acceso from profiles.role (#186)

The portal reads its own role (Externo / Productor / Admin) from
`auth_effective_access`, app `portal`, instead of `profiles.role`. Every grant
path (solicitud approval, re-tier, revoke, delete-with-revoke) writes the Auth
DB first and still dual-writes `profiles.role` until #189.

Deploy order:

1. `pnpm db:auth:migrate` — `0003_role_catalog` (already applied with #185).
2. Seed, before the code ships:

   ```bash
   pnpm db:auth:seed-portal -- --dry-run   # prints the plan, writes nothing
   pnpm db:auth:seed-portal                # grants each linked Cuenta its role
   ```

3. Deploy #186.

Rules: every linked Cuenta (`profiles.auth_user_id`) gets a `portal` row with
its current `profiles.role`, `granted_by = null`; an existing `portal` row is
never touched; unlinked Cuentas are only reported — their first login stamps
the link and converts `profiles.role` into the portal Acceso. Idempotent.

Check after seeding (Auth DB), expecting one row per linked Cuenta:

```sql
SELECT role, count(*) FROM auth_app_access WHERE app = 'portal' GROUP BY 1;
```

Transition safety net (removed in #189): a Cuenta with no `portal` row — seed
not run yet, or the Auth DB unreachable — falls back to its `profiles.role`,
so deploying before the seed does not lock anyone out. Because of that
fallback, deleting only the `portal` row does not revoke a Cuenta that still
exists; revoke from the People page, which removes both. #187 must not ship
Acceso-only revokes for the portal until the fallback is gone.

Grant rule (`canGrantRole`): a manager grants, re-tiers or revokes roles
ranked below their own; the portal Admin also reaches Admin; super admins
grant anything. Productores stay limited to Externo.

## Users section at basket-app.com/usuarios (#187)

Replaces `/access` (which now redirects there, `?email=` kept). Served on the
apex host only: every other host gets a 404 (middleware, page and every
action). Only active super admins get in; anyone else lands on `/no-access`.
The check reads `auth_user` uncached, so it doesn't need a portal Cuenta.

- Matrix: every identity × every app of the catalog, one select per cell with
  that app's roles plus "Sin acceso", role descriptions in the header,
  `granted_by`/`granted_at` under each cell. Super admin rows are locked as
  "Admin (super admin)"; the action refuses them too.
- Portal cell: until #189 a Cuenta without a portal row still enters with
  `profiles.role` (shown as "Desde la Cuenta"). So granting also creates or
  links the Cuenta and dual-writes `profiles.role`, and "Sin acceso" removes
  the Acceso and the Cuenta (the Ficha stays, unlinked). Auth DB first; a
  Domain DB failure is logged with `[acceso]` and shown as an error notice.
- Per identity: create (email + name, verified, no email sent), ban / unban
  (ban also ends every session), sign out everywhere, set / remove super
  admin. All behind a confirm. Create, ban, unban and sign-out go through the
  Better Auth admin plugin (`adminRoles: ["superadmin"]`). Super admin
  set/remove is one Auth DB transaction that locks every active super admin
  row, refuses to remove the last one, and writes its audit row; it is logged
  with `[usuarios]`.

### Deploy (#187)

```bash
pnpm db:auth:migrate                     # applies 0004_audit_log
pnpm db:auth:bootstrap-superadmin -- --dry-run <email> [<email>…]
pnpm db:auth:bootstrap-superadmin -- <email> [<email>…]
# deploy the portal
```

The bootstrap script is idempotent. It exits 1 and lists any email with no
identity yet: have that person sign in once, then re-run it. Its audit rows
have `actor_id = null`. Smoke: a super admin opens `basket-app.com/usuarios`;
a non-super-admin is sent to `/no-access`; `portal.basket-app.com/usuarios`
is a 404; `portal.basket-app.com/access` redirects to the apex.

## Cutover seed: incidencias, ops hub and analytics users

One script maps legacy rights to Accesos (spec #172 story 27) and creates the
missing identities by email — verified, no email sent; they log in with a
magic link when they next need to:

| Source                          | Mapping                                   |
|---------------------------------|-------------------------------------------|
| incidencias `profiles.role`     | `operador` → escritura, `admin` → admin   |
| ops hub Supabase users          | viewer-only emails → lectura, rest → escritura |
| analytics `auth_allowed_emails` | `viewer` → lectura, `admin` → admin       |

```bash
pnpm db:auth:seed-siblings -- --dry-run            # plan only
pnpm db:auth:seed-siblings                         # fetch + write
pnpm db:auth:seed-siblings -- --input plan.json    # sources from a file
```

Env (in `.env.local`, only for the cutover run): `SEED_INCIDENCIAS_SUPABASE_URL`,
`SEED_INCIDENCIAS_SERVICE_ROLE_KEY`, `SEED_OPS_SUPABASE_URL`,
`SEED_OPS_SERVICE_ROLE_KEY`, `SEED_OPS_VIEWER_EMAILS` (comma list, copy from the
ops repo `src/lib/roles.ts`), `SEED_ANALYTICS_DATABASE_URL`, plus
`AUTH_DATABASE_URL`. `--input` takes a JSON file shaped like `SiblingSeedInput`
and skips every fetch. Idempotent: existing identities are reused by email
(case-insensitive) and an existing Acceso is never overridden — deliberately
"grant if absent" rather than the spec's "upsert", so an admin's later change
survives a re-run; fix a wrongly seeded row from `/usuarios`. Users the
mapping drops (unknown role, no incidencias profile) are listed in the output.
Seeded rows have `granted_by = null`.

## Integration tests

`npm run test:integration` applies both journals to the throwaway Postgres
(`drizzle/portal` then `drizzle/auth`, the latter into its own
`__drizzle_migrations_auth` table so the two timelines don't shadow each
other). `AUTH_DATABASE_URL` points at the same database in that run.
