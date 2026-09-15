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

## After the soak

Delete the Supabase Auth users of the incidencias and ops projects (Postgres
stays). Remove stale secrets: Better Auth vars in the generator env, the browser
cookie string in the analytics env, token-in-URL git remotes on the server.
