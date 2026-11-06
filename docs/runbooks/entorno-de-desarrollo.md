# Entorno de desarrollo: setting it up

This runbook sets up `dev.portal.basket-app.com` and `dev.cashflow.basket-app.com` on the production VPS (ADR 0015). Every step runs as root on the VPS unless it says otherwise. Run them in order: cashflow reads the dev portal's session, so the portal goes first.

| Piece | Portal | Cashflow |
|---|---|---|
| Host | `dev.portal.basket-app.com` | `dev.cashflow.basket-app.com` |
| Folder | `/opt/basket-app-dev` | `/opt/cashflow-bp-dev` |
| pm2 | `basket-app-dev` | `cashflow-bp-dev` |
| Port (127.0.0.1) | 3012 | 3013 |
| Databases (role = database) | `basket_portal_dev` in `basket-portal-db`, `basket_auth_dev` in `basket-auth-db` | `basket_cashflow_dev` in `basket_cashflow` |
| Deploy | `deploy-dev.yml`, on push to `development` | `deploy-dev.yml`, on push to `development` |

The apps refuse to start when a database does not match the environment: in development every database name ends in `_dev`, and in production none does.

## 0. Before you start

1. **Check room on the VPS.**
   - Run `free -h`. The two apps take about 1 GB more, and a build briefly takes more on top of that.
   - Run `ss -ltn | grep -E ':301[23] '`. It must print nothing. If a port is taken, pick another one and change it here and in cashflow (`deploy-dev.yml`, `ecosystem.dev.config.cjs` and its nginx file).
2. **Add the DNS records (DonWeb).** Two A records pointing to `162.249.168.210`: `dev.portal` and `dev.cashflow`.
3. **Create the dev Google OAuth client (ADR 0015).** Never add dev URIs to production's client. In Google Cloud, project **Dashboards** (`dashboards-496312`, organization basquetpass.tv): APIs & Services → Credentials → Create credentials → OAuth client ID → Web application, named `Portal dev`. Authorized origin `https://dev.portal.basket-app.com`, redirect URI `https://dev.portal.basket-app.com/api/auth/callback/google`. If the project asks for a consent screen first, make it **Internal**. Keep the client ID and secret for §2. Google takes a few minutes to accept a new client.
4. **Create the `development` branch in both repos.** Do it once the PRs that add the dev deploy are merged into `main`:
   ```bash
   git push origin origin/main:refs/heads/development
   ```
   It is not protected, like `main` (ADR 0015, Consequences).

## 1. Databases

Each database is a copy of production, owned by a `_dev` role of the same name that has no grants on production. The copy leaves out ownership, grants and comments, and the production roles never appear in a dev URL. Passwords live in `/root/dev-db-passwords` (created on the first run, mode 600), never on a command line. They go into the dev `.env` files below.

Save the script and run it. It can be rerun to refresh the copies; `pm2 stop basket-app-dev cashflow-bp-dev` first, because it drops them.

```bash
cat > /root/copy-dev-dbs.sh <<'SCRIPT'
#!/usr/bin/env bash
set -euo pipefail
umask 077
PASSWORDS=/root/dev-db-passwords
[ -f "$PASSWORDS" ] || for db in basket_portal_dev basket_auth_dev basket_cashflow_dev; do
  echo "$db=$(openssl rand -hex 24)"
done > "$PASSWORDS"

# psql in <container> as its superuser (POSTGRES_USER of the image).
su_psql() { local c=$1; shift; docker exec -i "$c" sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" "$@"' psql "$@"; }

# copy_db <container> <source db> <dev db> [extra pg_dump args...]
copy_db() {
  local c=$1 src=$2 dst=$3; shift 3
  case $dst in *_dev) ;; *) echo "refusing to replace $dst: not a _dev database" >&2; return 1 ;; esac
  local pass; pass=$(grep "^$dst=" "$PASSWORDS" | cut -d= -f2)
  DEV_PASS="$pass" docker exec -i -e DEV_PASS "$c" sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres' <<SQL
\getenv pass DEV_PASS
SELECT NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '$dst') AS crear \gset
\if :crear
  CREATE ROLE $dst LOGIN;
\endif
ALTER ROLE $dst PASSWORD :'pass';
DROP DATABASE IF EXISTS $dst WITH (FORCE);
CREATE DATABASE $dst OWNER $dst;
SQL
  # Extensions need a superuser: create them first. Today they all live in public
  # (pg_trgm); one in another schema would clash with the dump's CREATE SCHEMA.
  local extensions; extensions=$(su_psql "$c" -d "$src" -Atc \
    "SELECT extname || ' ' || extnamespace::regnamespace FROM pg_extension WHERE extname <> 'plpgsql'")
  while read -r ext schema; do
    if [ -z "$ext" ]; then continue; fi
    if [ "$schema" != "public" ]; then echo "extension $ext is in $schema: copy it by hand" >&2; return 1; fi
    su_psql "$c" -d "$dst" -c "CREATE EXTENSION IF NOT EXISTS \"$ext\""
  done <<< "$extensions"
  docker exec "$c" sh -c 'pg_dump -U "$POSTGRES_USER" "$@"' pg_dump -d "$src" --no-owner --no-privileges --no-comments "$@" \
    | docker exec -i "$c" psql -q -v ON_ERROR_STOP=1 -U "$dst" -d "$dst"
}

copy_db basket-auth-db basket_auth basket_auth_dev \
  --exclude-table-data=public.auth_session --exclude-table-data=public.auth_verification
copy_db basket-portal-db basket_portal basket_portal_dev
copy_db basket_cashflow basket_cashflow basket_cashflow_dev \
  --exclude-table-data=public.claves_de_cashflow --exclude-table-data=public.sesiones_de_clave

# Users keep their Accesos, but no Google token from production.
docker exec basket-auth-db psql -v ON_ERROR_STOP=1 -U basket_auth_dev -d basket_auth_dev \
  -c "UPDATE auth_account SET access_token = NULL, refresh_token = NULL, id_token = NULL"

# Cashflow reads the dev portal's leagues with its existing catalog role (pool of 1
# per instance, within its CONNECTION LIMIT 5). Don't rerun cashflow's
# rol-de-solo-lectura.sql: it would change that role's production password.
docker exec -i basket-portal-db psql -v ON_ERROR_STOP=1 -U basket_portal_dev -d basket_portal_dev <<'SQL'
GRANT CONNECT ON DATABASE basket_portal_dev TO cashflow_catalogo;
GRANT USAGE ON SCHEMA public TO cashflow_catalogo;
GRANT SELECT (id, slug, name) ON public.leagues TO cashflow_catalogo;
SQL
echo "Copies ready."
SCRIPT
bash /root/copy-dev-dbs.sh
```

The source database names (`basket_auth`, `basket_portal`, `basket_cashflow`) are production's; check them with `docker exec <container> psql -U "$POSTGRES_USER" -l` if one fails. Never run `REASSIGN OWNED BY` a production role to fix an ownership problem. It acts on everything that role owns, including the production databases.

## 2. Portal

```bash
git clone "$(git -C /opt/basket-app remote get-url origin)" /opt/basket-app-dev
cd /opt/basket-app-dev && git checkout development
cp /opt/basket-app/.env.local .env.local && chmod 600 .env.local
```

Edit `.env.local`:

| Variable | Value |
|---|---|
| `DATABASE_URL` | `postgres://basket_portal_dev:<password>@127.0.0.1:5434/basket_portal_dev` |
| `AUTH_DATABASE_URL` | `postgres://basket_auth_dev:<password>@127.0.0.1:5433/basket_auth_dev` |
| `BETTER_AUTH_SECRET` | a new one from `openssl rand -base64 32`. Never production's. |
| `BETTER_AUTH_URL`, `NEXT_PUBLIC_APP_URL` | `https://dev.portal.basket-app.com` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | the dev client's (§0.3). Never production's. They are read at runtime: after changing them, `pm2 restart basket-app-dev --update-env` is enough. |
| `GRID_SYNC_ENABLED`, `FIXTURES_SYNC_ENABLED`, `NOTIFICATIONS_ENABLED`, `OPENWA_NOTIFY_ENABLED` | delete them. On a dev host they are off unless set to `true`. |
| `OPENWA_API_URL`, `OPENWA_API_KEY`, `TELEMETRY_TOKEN` | empty |
| `CABB_USER_*`, `CABB_PASS*` | empty, so a manual fixtures sync can't log into the real Gesdeportiva accounts |
| `INTAKE_API_KEY` | a new one |
| `SMTP_USER`, `SMTP_PASS` | empty. Otherwise invitations and access-request mails would reach real people. Staff log in with Google. Fill these only while you test a magic link. |

Delete any `SERVER`/`SERVER_PASS` lines the copy brought along. Then:

```bash
npm install --no-save --no-package-lock && npm run build
pm2 start npm --name basket-app-dev --cwd /opt/basket-app-dev -- start -- -p 3012 -H 127.0.0.1
pm2 save
```

## 3. Cashflow

```bash
git clone "$(git -C /opt/cashflow-bp remote get-url origin)" /opt/cashflow-bp-dev
cd /opt/cashflow-bp-dev && git checkout development
cp /opt/cashflow-bp/.env .env && chmod 600 .env
```

Edit `.env` as cashflow's README (section "Entorno de desarrollo") describes:

- `NEXT_PUBLIC_PORTAL_URL=https://dev.portal.basket-app.com`
- The dev portal's `BETTER_AUTH_SECRET`
- `AUTH_DATABASE_URL` set to `basket_auth_dev` (as `basket_auth_dev`)
- `DATABASE_URL` set to `basket_cashflow_dev` (as `basket_cashflow_dev`)
- `CATALOG_DATABASE_URL` set to `basket_portal_dev` (same `cashflow_catalogo` user and password)
- `PORT=3013`
- `TELEMETRY_TOKEN` empty

The Asistente keeps the same `ANTHROPIC_API_KEY`.

```bash
COREPACK_ENABLE_DOWNLOAD_PROMPT=0 pnpm install --frozen-lockfile && pnpm build && pnpm db:migrate
pm2 start ecosystem.dev.config.cjs && pm2 save
```

## 4. nginx and TLS

nginx `sites-enabled/*` are links, so write the files in `sites-available`.

1. **Start with port 80 only, so certbot can answer.** Create one block per host that only proxies:
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
   Do the same for `dev.cashflow.basket-app.com` with port 3013. Link both, then run `nginx -t && systemctl reload nginx`.
2. **Get the certificates.** `certonly` only fetches them and leaves the nginx files alone:
   ```bash
   certbot certonly --nginx --non-interactive --agree-tos --keep-until-expiring -d dev.portal.basket-app.com
   certbot certonly --nginx --non-interactive --agree-tos --keep-until-expiring -d dev.cashflow.basket-app.com
   ```
   They renew with certbot's timer, like production's.
3. **Back up the two port-80 files**, so a bad edit can be undone:
   ```bash
   B=/root/nginx-backup-dev-$(date +%Y%m%d-%H%M%S) && mkdir -p "$B"
   cp -a /etc/nginx/sites-available/dev.portal.basket-app.com /etc/nginx/sites-available/dev.cashflow.basket-app.com "$B/"
   ```
4. **Replace the portal file** (`/etc/nginx/sites-available/dev.portal.basket-app.com`). It is production's `portal.conf` with `/opt/basket-app-dev` and port 3012, without the telemetry and PostHog includes, and out of search engines:
   ```nginx
   server {
       listen 80;
       server_name dev.portal.basket-app.com;
       return 301 https://$host$request_uri;
   }

   server {
       listen 443 ssl;
       server_name dev.portal.basket-app.com;

       ssl_certificate /etc/letsencrypt/live/dev.portal.basket-app.com/fullchain.pem;
       ssl_certificate_key /etc/letsencrypt/live/dev.portal.basket-app.com/privkey.pem;
       include /etc/letsencrypt/options-ssl-nginx.conf;
       ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

       # An add_header inside a location drops the server's, so it is repeated.
       add_header X-Robots-Tag "noindex, nofollow" always;

       location /_next/static/ {
           alias /opt/basket-app-dev/.next/static/;
           access_log off;
           add_header Cache-Control "public, max-age=31536000, immutable";
           add_header X-Robots-Tag "noindex, nofollow" always;
       }

       location ~ ^/(Logos|LogosPNG)/ {
           root /opt/basket-app-dev/public;
           access_log off;
           add_header Cache-Control "public, max-age=2592000";
           add_header X-Robots-Tag "noindex, nofollow" always;
       }

       location / {
           proxy_pass http://127.0.0.1:3012;
           proxy_http_version 1.1;
           proxy_set_header Host $host;
           proxy_set_header X-Forwarded-Host $host;
           proxy_set_header X-Forwarded-Proto $scheme;
           proxy_set_header X-Real-IP $remote_addr;
       }
   }
   ```
5. **Replace the cashflow file** with the repo's: `cp /opt/cashflow-bp-dev/deploy/nginx/dev.cashflow.basket-app.com.conf /etc/nginx/sites-available/dev.cashflow.basket-app.com`.
6. Run `nginx -t && systemctl reload nginx`. If `nginx -t` fails, copy the files in `$B` back and don't reload.

## 5. Check

- **Login:** open `https://dev.portal.basket-app.com/login` and log in with Google.
- **Cookies:** the browser has `__Secure-basket-dev.session_token`. Production's `__Secure-better-auth.session_token` is still there, and `portal.basket-app.com` is still logged in.
- **Shared login:** `https://dev.cashflow.basket-app.com` opens without asking you to log in again.
- **Cashflow Clave:** the copy has no Claves de Cashflow, so nobody gets past "Ingresar" yet. Create the first one for an admin, then give the rest from Accesos:
  ```bash
  cd /opt/cashflow-bp-dev && pnpm seed:clave <email> "<name>"
  ```
  It prints a temporary password once; on first entry the app asks for a new one.
- **Schedulers:** `pm2 logs basket-app-dev --lines 50 --nostream` shows them as disabled.

## Working with it

- **Deploys:** merge or push a branch to `development` and the dev deploy runs. Then merge to `main` as usual. A deploy waits while another app's deploy holds `/var/lock/basket-vps-deploy.lock`.
- **Domain DB migrations** are applied by hand. Run each one on development first:
  ```bash
  docker exec -i basket-portal-db psql -v ON_ERROR_STOP=1 -U basket_portal_dev -d basket_portal_dev < file.sql
  ```
- **Auth migrations:** in `/opt/basket-app-dev`, run
  ```bash
  node --env-file=.env.local node_modules/drizzle-kit/bin.cjs migrate --config drizzle.auth.config.ts
  ```
  `npm run db:auth:migrate` does not read `.env.local`.
- **Cashflow migrations:** its deploy migrates on its own.
- **No apex:** `/usuarios` and the Solicitudes of sibling apps live on the apex only, so they are not available in development. Accesos come from the copy. Links to apps without a dev copy (analytics, incidencias, ops) lead nowhere, or to production in the case of the Incidencias item.
- **Refreshing the data:** rerun `/root/copy-dev-dbs.sh` (§1). It replaces everything done in development, Cashflow Claves included, so run `pnpm seed:clave` again afterwards. Cashflow dev reads the same Drive Excel as production (read-only); its Sincronización only writes to the dev database.
- **Backups:** none. basket-tv-infra lists databases and `.env` files by name, so nothing of development is backed up; it is rebuilt from production. Only the dev Google client's secret would need to be fetched again from Google Cloud.
