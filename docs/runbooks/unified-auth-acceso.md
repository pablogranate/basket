# Unified auth — Auth DB migrations, Acceso seed, pinned Better Auth

Companion to ADR 0009 and `CONTEXT.md` "Unified auth". Applies to the portal
(Auth server); readers have their own pointer ADRs.

## Pinned Better Auth version

The portal pins `better-auth` **exactly** (no caret) in `package.json`:

| Package       | Version  |
|---------------|----------|
| `better-auth` | `1.6.15` |

Every Session reader (analytics, ops hub, incidencias) must pin the **same**
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

## Integration tests

`npm run test:integration` applies both journals to the throwaway Postgres
(`drizzle/portal` then `drizzle/auth`, the latter into its own
`__drizzle_migrations_auth` table so the two timelines don't shadow each
other). `AUTH_DATABASE_URL` points at the same database in that run.
