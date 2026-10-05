# Unified auth — cutover order and smoke checklist per app

Companion to `unified-auth-acceso.md` (migrations, seeds) and ADR 0009. This is
the checklist for the day the Session readers go live (spec #172, ticket #175)
and for any later rollout that touches the session cookie or an Acceso gate.

> The `db:auth:seed-*` scripts this order runs were removed on 2026-10-05,
> after the cutover; see `unified-auth-acceso.md`.

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

## Smoke, login lands on the apex directory (#199)

Check it with four identities: one with no app, one with only a sibling app
(say `facturacion`), one with two apps, and a super admin. Log out between
identities. Dashboard redirects stream as a meta refresh (HTTP 200), not a 307.

| Identity | Log in at `portal/login` | Open the apex `/` | Open portal `/` |
|----------|--------------------------|-------------------|-----------------|
| No app | Ends on `portal/no-access?app=portal`, with the Función field | Same | Same |
| One sibling app | Ends inside that app (the apex forwards), never mi-jornada | Straight to the app | `/no-access?app=portal` with "Ir a mis aplicaciones" |
| Two apps | The directory, listing only those two | The directory | Their dashboard if the portal is one of them, else `/no-access?app=portal` with "Ir a mis aplicaciones" |
| Super admin | The directory, every app and "Usuarios y accesos" | The directory | Their dashboard, never `/no-access`; a super admin with no Cuenta gets one on this first visit (check `profiles.auth_user_id`) |

An explicit target still wins: `analytics.…/financiero` without a session goes
to `portal/login?redirectTo=…` and comes back to `/financiero`, not to the
directory.

## Smoke, apex bell for super admins (#200)

Needs a pending Solicitud for the portal and one for a sibling (sign up from
`portal/no-access?app=facturacion` with a throwaway identity).

1. **Super admin on the apex:** the bell next to the email shows the count and
   the modal opens on its own once per tab. Each item has its app badge
   (Producción, Facturación…).
2. **Sibling approval:** open the facturación item, pick a role, Aprobar. The
   notice on the directory names the person, the role and the app; the invite
   email links to `https://facturacion.basket-app.com`. In the Auth DB, the
   applicant has exactly one `auth_app_access` row (facturación), the
   Solicitud is `aprobada` with `decided_by` = the super admin, and
   `auth_audit_log` has an `access-request.aprobada` row. No `profiles` or
   `people` row for that email.
3. **Sibling rejection:** reject another one. No email, no Acceso,
   `access-request.rechazada` in `auth_audit_log`.
4. **Portal item from the apex:** today's form (ficha link or merge, Función,
   Nivel). Aprobar lands back on the directory, not on `/grid`; the Cuenta,
   ficha and portal Acceso exist, and both `audit_log` and `auth_audit_log`
   have the decision.
5. **First decision wins:** open the same portal Solicitud in the portal bell
   and on the apex; decide on one, then the other. The second says "Esta
   solicitud ya fue resuelta."
6. **Nobody else sees it:** a user with two apps and no super admin gets the
   directory without the bell.

## Smoke, Solicitudes inside each app (#201)

Each app's admins decide their own app's Solicitudes from a bell in that app.
For each app you need a throwaway identity with no Acceso to it, an admin of
that app who is not a super admin, a non-admin holder, and a super admin. In
the Auth DB, approving one writes `auth_access_request.status = 'aprobada'`
with `granted_role` and `decided_by`, an `auth_app_access` row, and one
`auth_audit_log` row `access-request.aprobada`. Rejecting writes `rechazada`,
an `access-request.rechazada` row, no Acceso and no email.

Run these checks in every app:

1. **Redirect:** without the Acceso, open the app. You land on
   `portal/no-access?app=<key>`, the form is titled for that app and doesn't
   ask for Función. Submit it.
2. **Bell:** the app's admin and a super admin see the bell with the count, and
   the modal opens by itself once per tab, listing only this app's
   Solicitudes. A non-admin holder sees no bell.
3. **Approve:** only roles up to the admin's own rank are offered. Aprobar
   shows "Solicitud aprobada: <email> es <rol> en <app>." and the applicant
   gets in.
4. **Reject:** Rechazar shows "Solicitud rechazada.".
5. **First decision wins:** open the same Solicitud in the app and on the apex
   bell. Decide in one, then in the other. The second shows "Esta solicitud ya
   fue resuelta." and nothing else changes.
6. **Volver:** someone holding only this app sees no Volver. Grant them a
   second app (the portal counts) and reload: Volver appears and leads to
   `https://basket-app.com`.
7. **Sign-out:** one click goes to `portal/logout` and leaves every subdomain
   signed out.

| App | Key | Open without the Acceso | Invite email on approval | Notes |
|-----|-----|-------------------------|--------------------------|-------|
| Facturación | `facturacion` | `/`; `curl -sI -H 'Accept: text/html' -b '<cookie>' …/admin` gives `302` to the form | "Tienes acceso a Facturación", linking to `https://facturacion.basket-app.com` | Roles Periodista, Coordinador, Admin. A coordinador gets `403 NO_AUTORIZADO` from `GET /api/solicitudes`. The "Cerrar sesión" link is new |
| Analytics | `analytics` | `/` | "Tienes acceso a Analytics", linking to `https://analytics.basket-app.com` | The bell sits in the landing header and on `/basket`, `/partidos`, `/financiero`; the notice shows next to it, so the dashboard filters stay |
| Incidencias | `incidencias` | `/ar` | None: the notice ends "Incidencias no envía correo de aviso: avisale vos." | |
| Ops hub | `ops` | `op.…/clubs` | None: the notice says "Operaciones no envía correos…" | A non-admin POST to approve or reject redirects with "No tenés permisos para decidir Solicitudes." and the row stays pending |
| Generator | `generator` | Any path, with a session and no `generator` role | — | Needs the nginx change in `unified-auth-acceso.md`. `curl -sI -b '<cookie>' portal/api/gates/generator` gives `403` with `X-Gate-Redirect: …/no-access?app=generator`; the browser lands on the form. Its Solicitudes are decided on the apex |

## Smoke, portal shells: back link and ficha completion (#202)

Before deploying, count the portal Cuentas without a ficha: all of them are
candidates for the modal (portal Admins and super admins are then left out).

```sql
-- Domain DB
SELECT count(*) FROM profiles p
WHERE NOT EXISTS (SELECT 1 FROM people pe WHERE pe.profile_id = p.id);
```

| Identity | Expected |
|----------|----------|
| Two apps or more (portal + facturación) | "Volver" in the header of both shells (dashboard and collaborator), and "Elegir aplicación" in the sidebar |
| Portal only | No "Volver", no "Elegir aplicación" |
| Externo or Productor whose Cuenta has no ficha | The "Completá tus datos de producción" modal on every portal page, pre-filled from their latest Solicitud in any app. "Más tarde" hides it until the browser session ends |
| Same, submitting | With an unlinked ficha under the same email: that ficha is linked and keeps its name. Otherwise a new ficha appears in Personal with the Función's role and `Ciudad:` in the notes. The modal stops showing |
| Same, name matching an unlinked ficha under another email | No modal; the Cuenta shows under "Cuentas por vincular" in Registros → Solicitudes |
| Portal Admin or super admin without a ficha | No modal |

## After the soak

Delete the Supabase Auth users of the incidencias and ops projects (Postgres
stays). Remove stale secrets: Better Auth vars in the generator env, the browser
cookie string in the analytics env, token-in-URL git remotes on the server.
