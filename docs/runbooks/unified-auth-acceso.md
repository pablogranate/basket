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

Transition safety net, removed by #189: a Cuenta with no `portal` row fell
back to its `profiles.role`. Since #189 the `portal` Acceso alone admits: no
row, or the Auth DB unreachable, means `/no-access`.

Grant rule (`canGrantRole`): a manager grants, re-tiers or revokes roles
ranked below their own; the portal Admin also reaches Admin; super admins
grant anything. Productores stay limited to Externo.

## Users section at basket-app.com/usuarios (#187)

Replaced the portal's `/access`, now removed (no redirect, no links). Served
on the apex host only: every other host gets a 404 (middleware, page and
every action). Only active super admins get in; anyone else lands on `/no-access`.
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
is a 404.

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

## Solicitudes in the Auth DB (#198, ADR 0011)

`0006_access_requests` adds `auth_access_request` (one Solicitud per identity
and app, pending uniqueness by partial indexes) and
`auth_app_request_recipients` (who gets the email for each app but the
portal).

Done on prod 2026-10-01: 0006 applied, then a one-off script (removed in
#204, see `git log`) copied the 12 Domain DB `access_requests` rows as portal
Solicitudes with the same ids, before and after the deploy. Counts matched:
aprobada 7, pendiente 4, rechazada 1.

In `/usuarios` → "Avisos de solicitudes", set each app's recipients. An app
without any sends no email (the portal keeps its routing in Configuración).

### Contract: drop the Domain DB `access_requests` (#204)

`supabase/migrations/0044_drop_access_requests.sql`. Non-reversible. The
portal stopped reading the table with #198, so the order is free. First check
that every Domain row has its copy, by id (Auth DB counts drift as
Solicitudes are filed and decided, so they no longer have to match):

```bash
cd /opt/basket-app && node --env-file=.env.local -e '
const postgres = require("postgres");
const domain = postgres(process.env.DATABASE_URL);
const authDb = postgres(process.env.AUTH_DATABASE_URL);
(async () => {
  const ids = (await domain`SELECT id FROM access_requests`).map((r) => r.id);
  const copied = await authDb`SELECT id FROM auth_access_request WHERE id = ANY(${ids}::uuid[])`;
  console.log({ domain: ids.length, copied: copied.length });
  await domain.end(); await authDb.end();
})();'
```

`domain` and `copied` must be equal (12 on 2026-10-01). Then:

```bash
docker exec -i basket-portal-db psql -U basket_portal -d basket_portal \
  -v ON_ERROR_STOP=1 < /opt/basket-app/supabase/migrations/0044_drop_access_requests.sql
```

`audit_log` rows keep `table = 'access_requests'`: that labels history, it
doesn't point at the table.

## Integration tests

`npm run test:integration` applies both journals to the throwaway Postgres
(`drizzle/portal` then `drizzle/auth`, the latter into its own
`__drizzle_migrations_auth` table so the two timelines don't shadow each
other). `AUTH_DATABASE_URL` points at the same database in that run.

## Contract: retire the Nivel and profiles.role (#189)

Two Auth DB drops (`0005_contract_drop_nivel`: `auth_app_access.level`,
`auth_app_role.legacy_level`, enums `auth_app_access_level` and
`auth_app_access_app`) and one Domain DB drop (`profiles.role`, in two steps:
`0042_profiles_role_nullable`, `0043_drop_profiles_role`). After #189 the
portal reads only the `portal` Acceso; the Cuenta is the uuid domain rows point
at. A super admin without a Cuenta gets one on their first dashboard visit.

Deploy order:

1. Every reader already deployed on `auth_effective_access` (#188:
   facturacion-bp, data-bp, incidencias-bp, ops) and each one's smoke rows
   passed. A reader still on `level` loses its gate when 0005 runs. Grep every
   sibling's deployed commit for `level` reads (recorded in the #189 PR).
2. Domain DB: apply `0042_profiles_role_nullable.sql` (`docker exec`). The old
   build works either way.
3. Seed from the #189 checkout, before deploying it:

   ```bash
   pnpm db:auth:seed-portal -- --dry-run   # identities to create, Accesos to grant
   pnpm db:auth:seed-portal
   ```

   Every Cuenta gets an identity (a never-linked one: created verified, no
   email sent, and linked) and a `portal` Acceso from its `profiles.role`; an
   existing Acceso is never touched. Check (Domain DB), expecting 0:

   ```sql
   SELECT count(*) FROM profiles WHERE auth_user_id IS NULL;
   ```

   And (Auth DB) that the `portal` rows cover every Cuenta — the seed's
   granted + already-had count equals `SELECT count(*) FROM profiles`.
4. Deploy the portal. It writes neither `level` nor `profiles.role`, and both
   columns are nullable by now.
5. Run `pnpm db:auth:seed-portal` again: it picks up any Cuenta the old build
   created or re-tiered between steps 3 and 4. Idempotent.
6. Domain DB: apply `0043_drop_profiles_role.sql`.
7. Auth DB: `pnpm db:auth:migrate` — `0005_contract_drop_nivel`.

Not in the other order: the old portal build writes `level` and
`profiles.role` on every grant, so a grant made after a drop and before the
deploy would fail.

Check after both drops, expecting no rows (Auth DB, then Domain DB):

```sql
SELECT column_name FROM information_schema.columns
WHERE (table_name = 'auth_app_access' AND column_name = 'level')
   OR (table_name = 'auth_app_role' AND column_name = 'legacy_level');

SELECT column_name FROM information_schema.columns
WHERE table_name = 'profiles' AND column_name = 'role';
```

## Generator deny path: the Solicitud form tagged `generator` (#201)

A session without a `generator` Acceso gets `403` from `/api/gates/generator`,
with `X-Gate-Redirect: https://portal.basket-app.com/no-access?app=generator`.
nginx sends the browser there, so the Solicitud is tagged with the generator.
Deploy the portal first. Then, in the generator vhost under
`/etc/nginx/sites-enabled/`, inside the `server` block that has
`auth_request /__gate`:

The vhost already sends every `403` to a named location, and every denial
there is for the generator, so the change is that location's target
(applied on prod 2026-10-01):

```nginx
location @gate_denied {
    return 302 https://portal.basket-app.com/no-access?app=generator;
}
```

`error_page 401 = @gate_login` (portal login) stays. The gate location also
sets `proxy_set_header X-Forwarded-Host portal.basket-app.com;` next to its
`Host`, like `portal.conf` and the apex vhost set `X-Forwarded-Host $host`
(see #216). Apply with `nginx -t && systemctl reload nginx`.

The `auth_request` cache (key: cookie) stores only `204`, so a denial is
never cached and a grant shows on the next request.
