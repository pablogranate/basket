---
status: accepted
---
# An Entorno de desarrollo on the production VPS, recognized by its host

Until now there were two places to run the portal: a laptop and production. Changes that need real data, the real nginx, Google login or a sibling app reading the session could only be tried in production. The Entorno de desarrollo is a second copy of the portal and of cashflow, at `dev.portal.basket-app.com` and `dev.cashflow.basket-app.com`, on the same VPS.

## Decisions

- **Same VPS, own databases.** Each app gets a `_dev` database inside the container it already uses (`basket_portal_dev`, `basket_auth_dev`, `basket_cashflow_dev`), copied from production. The dev Auth DB has no sessions or verifications, so nobody inherits a production login.
- **The host says which environment it is.** A host whose first label is `dev` is the Entorno de desarrollo (`src/lib/environment.ts`). The portal and its Session readers read the same URL, so they cannot disagree. A per-app env var could.
- **Own session cookie.** The dev cookie is `basket-dev.session_token` on `.basket-app.com`, so the dev cashflow reads the dev portal's login and a dev login never overwrites the production cookie. Production keeps `better-auth.session_token`. A reader in the Entorno de desarrollo must use the same prefix and the dev `BETTER_AUTH_SECRET`, which differs from production's.
- **No Lanzador.** `buildApexUrl` returns null on a dev host, so after login the portal forwards by role (as off basket-app hosts) instead of sending people to the production apex. Links between apps go to `dev.<app>.basket-app.com`. The users section (`/usuarios`) lives on the apex only, so it is not available here; Accesos come from the production copy.
- **Nothing leaves the server.** The grid and fixtures schedulers, notifications and WhatsApp are switched off in its `.env.local` (they default to on), and it has no telemetry token.
- **Deployed from `staging`.** `deploy-staging.yml` builds `/opt/basket-app-dev` on every push to `staging`. It shares a concurrency group with `deploy.yml`, so production and development never build at once on the same machine.

## Considered Options

- **A second VPS**: full isolation, but another server to pay for and maintain for two apps.
- **`staging.basket-app.com` with an env var for the cookie prefix and the apex**: two settings to keep equal in every app, and a mismatch fails silently ("sin sesión").
- **A dev Lanzador at `dev.basket-app.com`**: one more host, certificate and nginx site for a page only people with several apps see. Can be added later.
