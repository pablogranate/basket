---
status: accepted
---
# Sibling authorization is centralized as Acceso rows in the Auth DB; portal is the only auth server

Extending unified auth to incidencias and ops hub made the per-app authorization doctrine (ADR 0006: "each app decides on its own who may enter") untenable: analytics kept an `auth_allowed_emails` table, incidencias a `profiles.role`, ops hub a hardcoded email list, and the generator a portal capability. Onboarding one person meant four places. We decided that every sibling except the portal reads its gate from one table in the Auth DB, `auth_app_access (user_id, app, level, granted_by, granted_at)`, with `app` a Postgres enum (`analytics | incidencias | generator | ops`) and `level` an enum (`read | write | admin`). Portal admins manage it from a single page; no row means the portal's `/no-access`. The portal itself stays on `profiles.role` because its three-tier model carries access requests, ficha linking and grant-tier rules that a flat level cannot express.

At the same time we stopped running a Better Auth *server* per sibling. Only the portal exposes `/api/auth/*`, Google, magic link and sign-out. Siblings embed Better Auth with the shared secret and Auth DB solely to read the session cookie (`auth.api.getSession`); they carry no auth routes, no provider credentials, no login page, and link to the portal to log out.

## Considered Options

- **Per-app authorization tables** (the ADR 0006 doctrine): keeps the Auth DB identity-only, but four authorization systems for ~50 users, and no single view of who can use what.
- **Central table, apps fetch it through a portal API**: one manager, but every sibling page would depend on the portal being up; rejected in favour of a direct indexed read against the local Postgres, uncached.
- **Grants carried in the session** (`customSession`): stale until re-login; rejected.
- **Full Better Auth server per sibling** (what analytics did): duplicated Google credentials and `trustedOrigins`, and a sibling's own `databaseHooks` could refuse a login the portal would accept. Reader-only removes the whole class.
- **nginx `auth_request` for the new apps** (the generator pattern): rejected because incidencias and ops hub write `created_by` and need the user id.

## Consequences

- `auth_app_access` lives in the Auth DB even though it is not identity. The glossary now says the Auth DB holds "users, sessions and every Acceso". Adding a sibling is a migration that extends the `app` enum, deliberately.
- Analytics loses its `databaseHooks`, `@basquetpass.tv` domain check, `/api/auth` route, Google credentials, `auth_allowed_emails` and its `/admin` allowlist manager. Its `admin` level currently unlocks nothing beyond `viewer`.
- The generator gate in `/api/gates/[app]` looks up an Acceso instead of the `dashboard.full` capability; the nginx block is unchanged.
- Legacy identities in sibling databases (Supabase `auth.users` uuids in incidencias `profiles`/`incidencias`, ops `messages.created_by`, `audit_logs.user_id`) are linked to the Better Auth user id by email on first login; old uuids stay as history.
- The ops worker keeps writing `created_by = null` for system actions; it never touches auth.
- Revocation relies on Better Auth session invalidation plus the per-request Acceso read; a deleted row denies on the next request.
- Rollout order: ops hub first (server-only data access already), then incidencias after its browser-side Supabase calls move to server actions.
