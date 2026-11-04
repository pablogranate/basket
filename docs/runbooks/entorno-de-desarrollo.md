# Entorno de desarrollo: puesta en marcha

`dev.portal.basket-app.com` y `dev.cashflow.basket-app.com`, en el VPS de producción (ADR 0015). Every step runs as root on the VPS unless it says otherwise. Run them in order: cashflow reads the dev portal's session, so the portal goes first.

| Piece | Portal | Cashflow |
|---|---|---|
| Host | `dev.portal.basket-app.com` | `dev.cashflow.basket-app.com` |
| Folder | `/opt/basket-app-dev` | `/opt/cashflow-bp-dev` |
| pm2 | `basket-app-dev` | `cashflow-bp-dev` |
| Port | 3012 | 3013 |
| Databases | `basket_portal_dev` (in `basket-portal-db`), `basket_auth_dev` (in `basket-auth-db`) | `basket_cashflow_dev` (in `basket_cashflow`) |
| Deploy | `deploy-staging.yml`, on push to `staging` | `deploy-dev.yml`, on push to `staging` |

## 0. Before you start

1. **Room on the VPS.** `free -h`: the two apps take about 1 GB more, and a build takes more for a while. `ss -ltn | grep -E ':301[23] '` must print nothing; if a port is taken, pick another one and change it here, in cashflow's `deploy-dev.yml`, `ecosystem.dev.config.cjs` and its nginx file.
2. **DNS (DonWeb).** Two A records to `162.249.168.210`: `dev.portal` and `dev.cashflow`.
3. **Google OAuth.** In the portal's OAuth client add the authorized origin `https://dev.portal.basket-app.com` and the redirect URI `https://dev.portal.basket-app.com/api/auth/callback/google`.
4. **The `staging` branch** in both repos, from `main` once the PRs that add the dev deploy are merged:
   ```bash
   git push origin origin/main:refs/heads/staging
   ```

## 1. Databases

Copies of production. The dev Auth DB keeps users, accounts and Accesos but no sessions or verifications, so nobody arrives logged in.

```bash
# Auth
docker exec basket-auth-db createdb -U basket_auth basket_auth_dev
docker exec basket-auth-db pg_dump -U basket_auth -d basket_auth \
    --exclude-table-data=public.auth_session --exclude-table-data=public.auth_verification \
  | docker exec -i basket-auth-db psql -q -U basket_auth -d basket_auth_dev

# Portal domain
docker exec basket-portal-db createdb -U basket_portal basket_portal_dev
docker exec basket-portal-db pg_dump -U basket_portal -d basket_portal \
  | docker exec -i basket-portal-db psql -q -U basket_portal -d basket_portal_dev

# Cashflow
docker exec basket_cashflow createdb -U basket_cashflow basket_cashflow_dev
docker exec basket_cashflow pg_dump -U basket_cashflow -d basket_cashflow \
  | docker exec -i basket_cashflow psql -q -U basket_cashflow -d basket_cashflow_dev
```

Roles are per container, so the grants in the dump (cashflow's catalog role, the readers' views) already apply to the copies. To refresh a copy later, `dropdb` it and repeat its block.

## 2. Portal

```bash
git clone "$(git -C /opt/basket-app remote get-url origin)" /opt/basket-app-dev
cd /opt/basket-app-dev && git checkout staging
cp /opt/basket-app/.env.local .env.local && chmod 600 .env.local
```

Edit `.env.local`:

| Variable | Value |
|---|---|
| `DATABASE_URL` | the production one, with the database `basket_portal_dev` |
| `AUTH_DATABASE_URL` | the production one, with the database `basket_auth_dev` |
| `BETTER_AUTH_SECRET` | a new one: `openssl rand -base64 32`. Never production's |
| `BETTER_AUTH_URL`, `NEXT_PUBLIC_APP_URL` | `https://dev.portal.basket-app.com` |
| `GRID_SYNC_ENABLED`, `FIXTURES_SYNC_ENABLED`, `NOTIFICATIONS_ENABLED`, `OPENWA_NOTIFY_ENABLED` | `false`. They default to on, and the data has real phones and emails |
| `OPENWA_API_URL`, `OPENWA_API_KEY`, `TELEMETRY_TOKEN` | empty |
| `INTAKE_API_KEY` | a new one |
| `SMTP_USER`, `SMTP_PASS` | empty. Invitations and access-request mails would reach real people. Staff log in with Google; fill them only while testing a magic link |

Delete any `SERVER`/`SERVER_PASS` lines the copy brought. Then:

```bash
npm install --no-save --no-package-lock && npm run build
pm2 start npm --name basket-app-dev --cwd /opt/basket-app-dev -- start -- -p 3012
pm2 save
```

## 3. Cashflow

```bash
git clone "$(git -C /opt/cashflow-bp remote get-url origin)" /opt/cashflow-bp-dev
cd /opt/cashflow-bp-dev && git checkout staging
cp /opt/cashflow-bp/.env .env && chmod 600 .env
```

Edit `.env` as cashflow's README § Entorno de desarrollo says: `NEXT_PUBLIC_PORTAL_URL=https://dev.portal.basket-app.com`, the dev portal's `BETTER_AUTH_SECRET` and `basket_auth_dev`, `DATABASE_URL` to `basket_cashflow_dev`, `CATALOG_DATABASE_URL` to `basket_portal_dev`, `PORT=3013`, `TELEMETRY_TOKEN` empty. The Asistente keeps the same `ANTHROPIC_API_KEY`.

```bash
COREPACK_ENABLE_DOWNLOAD_PROMPT=0 pnpm install --frozen-lockfile && pnpm build && pnpm db:migrate
pm2 start ecosystem.dev.config.cjs && pm2 save
```

## 4. nginx and TLS

nginx `sites-enabled/*` are links: write the files in `sites-available`.

1. **Port 80 first, so certbot can answer.** For each host, a block that only proxies:
   ```nginx
   server {
       listen 80;
       server_name dev.portal.basket-app.com;
       location / {
           proxy_pass http://127.0.0.1:3012;
           proxy_set_header Host $host;
           proxy_set_header X-Forwarded-Host $host;
           proxy_set_header X-Forwarded-Proto $scheme;
       }
   }
   ```
   Same for `dev.cashflow.basket-app.com` → 3013. Link both, `nginx -t && systemctl reload nginx`.
2. **Certificates.** `certbot --nginx -d dev.portal.basket-app.com` and `certbot --nginx -d dev.cashflow.basket-app.com`. Certbot adds the 443 block to each file.
3. **Portal.** Copy the headers and limits of the production portal's server block (not the apex or generator blocks) into `dev.portal`'s 443 block, keeping port 3012.
4. **Cashflow.** Replace its file with the repo's `deploy/nginx/dev.cashflow.basket-app.com.conf`. Its certificate paths are the ones certbot just created.
5. `nginx -t && systemctl reload nginx`.

## 5. Check

- `https://dev.portal.basket-app.com/login` → log in with Google. In the browser the cookie is `__Secure-basket-dev.session_token`; production's `__Secure-better-auth.session_token` is still there and `portal.basket-app.com` stays logged in.
- `https://dev.cashflow.basket-app.com` opens without asking you to log in again.
- `pm2 logs basket-app-dev --lines 50` shows the schedulers as disabled.

## Working with it

- Merge or push a branch to `staging`; the dev deploy runs. Then merge to `main` as usual.
- Portal Domain DB migrations are applied by hand: run them on `basket_portal_dev` first (`docker exec -i basket-portal-db psql -U basket_portal -d basket_portal_dev < file.sql`). Auth migrations: `npm run db:auth:migrate` in `/opt/basket-app-dev`. Cashflow's deploy migrates on its own.
- The `/usuarios` section lives on the apex only, so it is not available in development; Accesos come from the copy.
- Off-site backups list their databases by name; check that basket-tv-infra does not pick up the `_dev` ones.
