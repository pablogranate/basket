# Unified auth — cutover order and smoke checklist per app

Companion to `unified-auth-acceso.md` (migrations, seeds) and ADR 0009. This is
the checklist for the day the Session readers go live (spec #172, ticket #175)
and for any later rollout that touches the session cookie or an Acceso gate.

## Order

1. Portal: merge, deploy, `pnpm db:auth:migrate`, `pnpm db:auth:seed-generator`
   (dry-run first). Verify the generator. Then merge the Accesos page and run
   `pnpm db:auth:seed-siblings` (dry-run first) while the Supabase Auth users of
   incidencias and ops still exist: the seed reads them.
2. Ops hub (`op.basket-app.com`).
3. Incidencias (`incidencias.basket-app.com`).
4. Analytics (`analytics.basket-app.com`); its migration `0022` drops the old
   allowlist and runs only after the sibling seed.

Each reader's env holds exactly three auth values: `BETTER_AUTH_SECRET` (equal
to the portal's), `AUTH_DATABASE_URL`, `NEXT_PUBLIC_PORTAL_URL`. Google, SMTP,
Supabase Auth and Better Auth URL variables are removed from readers. Every
nginx vhost forwards `Host` and `X-Forwarded-Proto`; without them the reader
builds an `http://127.0.0.1:<port>` return URL that the portal rejects and the
deep link is lost.

## Smoke, per reader

Run from a cold browser (private window, no portal cookie). Use two
identities: one with escritura, one with lectura in that app.

| # | Check | Expected |
|---|-------|----------|
| 1 | Open a deep link inside the app | Redirect to `portal/login?redirectTo=<that URL>`; after login, back on the same page |
| 2 | Log in on the portal first, then open the app root | Straight in, no second login |
| 3 | Identity with no Acceso for this app | `portal/no-access`, not a login loop |
| 4 | Lectura identity | Read pages open; write controls hidden; write URL redirects; a direct action call is refused (403 or thrown), not silently accepted |
| 5 | Escritura identity | Full write path works (create, edit, delete, upload where the app has it) |
| 6 | Revoke in Accesos (Sin acceso) while the person has a tab open | Their next request is denied; restore afterwards |
| 7 | API route without a session (`curl -sI <app>/api/...`) | `401`, never a redirect |
| 8 | "Salir" in the app | Portal `/logout` ends the session; every reader tab and the portal ask for login again |

Cookie cache is 60 s: session validity may lag that long after a portal logout
from *another* device. The Acceso read is uncached, so revoke is immediate.

### App specifics

- **Generator**: gated by nginx `auth_request` to `/api/gates/generator`. Admin
  or editor with a `generator` Acceso opens it; productor gets `403`.
- **Ops hub**: dashboard at read; every other page and action at write. The
  WhatsApp pairing QR only reaches escritura. Viewer emails were seeded as
  lectura.
- **Incidencias**: lists, detail, reports and CSV at read (CSV route answers
  `401` without session); create, edit, delete, upload at write. First login
  links or creates the `profiles` row by auth id, then by email.
- **Analytics**: every dashboard admits read and admin; the role only drives
  the header label. `curl /api/basket/overview` without session is the `401`
  check.

## Smoke, gates on `auth_effective_access` (#188)

Every gate reads the role from the `auth_effective_access` view instead of the
`auth_app_access` Nivel. Permissions are unchanged; the one intended change is
that a super admin (`auth_user.role = 'superadmin'`, not banned) enters every
app as its admin role without a grant of their own. Deploy after the Auth DB is
on migration 0003. For each app, check it with four identities: one without a
role, the lowest role, the write or admin role, and a super admin with no grant
of their own.

| App | Login | Role enforcement | Super admin | Revoke |
|-----|-------|------------------|-------------|--------|
| Generator | No session: `curl -sI portal/api/gates/generator` gives `401` | Any `generator` role gives `204`; a session with no role gives `403`, whatever the portal role | `204` | Remove the role in `/usuarios`: the next request gives `403` |
| Ops hub | `op.…/dashboard` goes to portal login and comes back | `read`: dashboard only; `/templates` and `/clubs/[id]` bounce to `/dashboard`; write actions throw "Tu Acceso a Operaciones es de lectura." `write`/`admin`: everything | Opens `/templates`; the nav shows the write items | Delete the ops role, or ban or demote the super admin: the next request goes to `portal/no-access` |
| Incidencias | Goes to portal login and comes back | `read`: lists, detail and reports; `/int/nuevo` redirects to `/ar`; writes fail with "Tu Acceso a Incidencias es de lectura." `write`: create, edit, delete, upload | Gets in; the navbar shows "Admin"; writes are allowed | The next request goes to `portal/no-access`, with no logout |
| Analytics | `analytics.…/financiero` goes to portal login and comes back | `read`/`write`: every dashboard, and the header shows viewer. `admin`: the header shows admin. No role: `/no-access` | Gets in as admin; once banned, denied | The next request with the same session goes to `/no-access` |
| Facturación | `/` goes to `portal/login?redirectTo=…` and comes back | `coordinador`: `/api/yo` returns `rol: coordinador`, and `/admin` and `/api/admin/*` return `403`. `admin`: `/admin` loads. `periodista` with an active padrón row: `rol: periodista`. `periodista` without a padrón row: "Sin acceso" | `/api/yo` returns `rol: admin`; `/admin` opens | Remove the role, or unset the super admin: `/api/yo` returns `403 SIN_ACCESO`. A person with no role but an active padrón row still enters as periodista |

## After the soak

Delete the Supabase Auth users of the incidencias and ops projects (Postgres
stays). Remove stale secrets: Better Auth vars in the generator env, the browser
cookie string in the analytics env, token-in-URL git remotes on the server.
