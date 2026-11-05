---
status: accepted
---
# An Entorno de desarrollo on the production VPS, recognized by its host

Until now there were two places to run the portal: a laptop and production. Changes that need real data, the real nginx, Google login or a sibling app reading the session could only be tried in production. The Entorno de desarrollo is a second copy of the portal and of cashflow, at `dev.portal.basket-app.com` and `dev.cashflow.basket-app.com`, on the same VPS.

## Decisions

- **The host says which environment it is.** A host whose first label is `dev` is the Entorno de desarrollo. `src/lib/environment.ts` owns that rule and the shape of a dev host. The portal and its Session readers read the same URL, so they cannot disagree, which a per-app env var could.
- **Own session cookie and secret.** The dev cookie is `basket-dev.session_token` on `.basket-app.com` (`src/lib/auth/cookie-domain.ts`). The dev cashflow reads the dev portal's login, and a dev login never overwrites the production cookie. Production keeps `better-auth.session_token`. The dev `BETTER_AUTH_SECRET` differs from production's, and a reader in development must use both the dev prefix and the dev secret.
- **Own databases and roles, checked at startup.** Each app gets a `_dev` database with its own `_dev` role inside the container it already uses (`basket_portal_dev`, `basket_auth_dev`, `basket_cashflow_dev`), copied from production. The dev Auth DB has no sessions or verifications, and its OAuth tokens are cleared. The portal refuses to open a database whose `_dev` suffix does not match its environment (`assertDatabaseUrl`, `assertAuthDatabaseUrl`), and cashflow does the same. A `.env.local` copied from production and left unedited therefore fails instead of writing to the real data.
- **Nothing leaves the server unless asked.** On a dev host the grid and fixtures schedulers, notifications and WhatsApp are off unless their variable is `"true"` (`isSideEffectEnabled`). In production they stay on unless it is `"false"`. SMTP and telemetry are left empty in its `.env.local`.
- **No Lanzador.** `buildApexUrl` returns null on a dev host. After login the portal forwards by role, as it does off basket-app hosts, instead of sending people to the production apex. `buildAppUrlFromAnyHost` keeps links in development (`dev.<app>.basket-app.com`). An app without a dev copy (analytics, incidencias, ops) gets a host that does not exist, and the external Incidencias item still points at production. `/usuarios` and the Solicitudes of sibling apps live on the apex, so they cannot be used here. Accesos come from the production copy.
- **Deployed from `development`, one build at a time.** `deploy-dev.yml` builds `/opt/basket-app-dev` on every push to `development`. Every deploy of the portal and cashflow, in both environments, takes `/var/lock/basket-vps-deploy.lock` (`flock`) before it installs. Each workflow keeps its own concurrency group.

## Consequences

- Code on `development` runs as root on the production VPS, and the browser sends it the production cookies of `.basket-app.com`. The cookies cannot authenticate in development, but that code could read them. The branch must be protected like `main` (a PR with a review, no direct pushes). A separate deploy user and GitHub Environment would narrow this further; that is left for later.

## Considered Options

- **A second VPS**: full isolation, but another server to pay for and maintain for two apps.
- **`staging.basket-app.com` with an env var for the cookie prefix and the apex**: two settings to keep equal in every app, and a mismatch fails silently ("sin sesión").
- **`<app>.dev.basket-app.com` with the cookie on `.dev.basket-app.com`**: it keeps dev cookies off production hosts and gives a dev Lanzador at `dev.basket-app.com` almost for free. We chose `dev.<app>` hosts instead. The dev Lanzador can still be added later.
- **One concurrency group shared by the production and development workflows**: it serializes builds within a repo, but GitHub cancels a waiting run when another one joins the group. A push to development would drop a pending production deploy, and the group would not cover the other repo.
