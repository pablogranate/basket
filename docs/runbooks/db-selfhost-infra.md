# Runbook — self-hosted domain DB infra (migration Phase 1)

Provisions the `basket-portal-db` Postgres container (local + prod), the
`db:refresh` dev workflow, and nightly backups + weekly restore-test of every
Postgres on the VPS (`basket_portal`, `basket_auth`, `basket_facturacion`,
`basket_cashflow`). Code artifacts live in the repo; the
**root/VPS steps are yours to run** (`wences` has no sudo; pm2/docker run as root).

Spec: PRD §3 (locked decisions), §7.1. Server facts: `.planning/DB-SELFHOST-HANDOFF.md` §1.

---

## New env vars

Add to `.env.local` (local dev) and to the server's app env (`/opt/basket-app/.env.local`):

```
PORTAL_DB_USER=basket_portal
PORTAL_DB_PASSWORD=<generate: openssl rand -base64 32>
PORTAL_DB_PORT=5434
# After the container is up, point the app at it (replaces the Supabase pooler URL):
DATABASE_URL=postgresql://basket_portal:<PORTAL_DB_PASSWORD>@127.0.0.1:5434/basket_portal
```

`db:refresh` also needs `SERVER` + `SERVER_PASS` already in `.env.local` (prod-access memory).

> Do NOT swap the app's `DATABASE_URL` to the local/prod container until cutover
> (Phase 7). Pre-cutover the app + parity harness still read the Supabase pooler.
> You can set a *second* container up and point only tooling at it meanwhile.

---

## 1. Local dev container (each dev: wences, pablogranate)

```bash
# From the repo root. Brings up ONLY the portal DB (leaves basket-auth-db alone).
docker compose up -d basket-portal-db

# Apply the Drizzle baseline (creates the full schema in the empty DB).
DATABASE_URL=postgresql://basket_portal:<pw>@127.0.0.1:5434/basket_portal \
  npm run db:portal:migrate

# Verify.
docker exec basket-portal-db psql -U basket_portal -d basket_portal -c '\dt'
```

Post-cutover, seed local from prod instead of the baseline:

```bash
npm run db:refresh      # ssh prod pg_dump | psql local — WIPES local domain data
```

## 2. Prod container (root, on the VPS)

Use `docker run` (not `docker compose`) on prod: the shared compose file
interpolates `AUTH_DB_PASSWORD` for the existing auth-db service even when you
only target `basket-portal-db`, so compose would demand it. `docker run` is
decoupled and matches "new dedicated container".

```bash
ssh $SERVER          # sshpass -e ssh, per prod-access memory
cd /opt/basket-app && git pull    # pulls this branch's scripts + baseline

docker run -d --name basket-portal-db --restart unless-stopped \
  -e POSTGRES_DB=basket_portal \
  -e POSTGRES_USER=basket_portal \
  -e POSTGRES_PASSWORD='<PORTAL_DB_PASSWORD>' \
  -p 127.0.0.1:5434:5432 \
  -v basket-portal-data:/var/lib/postgresql/data \
  postgres:17

# Confirm it published loopback-only (must show 127.0.0.1:5434, NOT 0.0.0.0).
docker port basket-portal-db
docker exec basket-portal-db pg_isready -U basket_portal
```

The DB stays **empty** until the Phase 7 cutover restore (Supabase dump →
`basket-portal-db`, drop RLS, mark baseline applied). Do not load data now.

> The Supabase dump restored at cutover carries its own `CREATE EXTENSION`
> statements. The Drizzle baseline (dev path, §1) creates `pg_trgm` itself — the
> three `matches` trigram search indexes need it and fresh postgres:17 lacks it.

## 3. Backups + restore-test (root, on the VPS)

```bash
mkdir -p /var/backups/basket
touch /var/log/basket-backup.log

# Smoke-test both scripts once by hand before trusting cron:
/opt/basket-app/scripts/db/backup.sh
/opt/basket-app/scripts/db/restore-test.sh   # needs a dump of each DB to exist first

# Install in root crontab (crontab -e as root):
0 4 * * *  /opt/basket-app/scripts/db/backup.sh       >> /var/log/basket-backup.log 2>&1
0 5 * * 0  /opt/basket-app/scripts/db/restore-test.sh >> /var/log/basket-backup.log 2>&1
```

The DBs both scripts cover live in one list, `scripts/db/backup-targets.sh`
(container, db, user, and the sanity query the restore-test runs). Add a new
app's DB there and both scripts pick it up.

| Container | DB | Restore-test sanity |
|---|---|---|
| `basket-portal-db` | `basket_portal` | `matches` count |
| `basket-auth-db` | `basket_auth` | `auth_user` count |
| `basket_facturacion` | `basket_facturacion` | `envios` count |
| `basket_cashflow` | `basket_cashflow` | `importaciones` count, `archivos` count and total bytes |

- `backup.sh`: nightly 04:00, one plain-SQL `pg_dump` per DB (bytea included, so
  Cashflow's raw `.xlsx` in `archivos` is in the dump) → `/var/backups/basket/<db>-<stamp>.sql.gz`,
  14-day retention per DB.
- `restore-test.sh`: Sundays 05:00, restores the newest dump of each DB into its
  own database in one ephemeral scratch container, runs that DB's sanity query,
  tears down.
- A missing container, a failed `pg_dump`, a missing dump or a failed restore is
  logged as `FAILED <db>: <reason>`; the other DBs still run, and the script
  exits 1 with `done with FAILURES (<dbs>)` as its last line. A clean run ends
  with `done —`. A DB whose backup fails keeps its old dumps (pruning only runs
  after a fresh dump), so its last good dump is never aged out while it is down.
- Overridable via env: `BASKET_BACKUP_DIR`, `BASKET_BACKUP_RETENTION_DAYS`, and
  the DB users `PORTAL_DB_USER`, `AUTH_DB_USER`, `FACTURACION_DB_USER`, `CASHFLOW_DB_USER`.
- Check the last runs: `grep -E 'FAILED|done' /var/log/basket-backup.log | tail`.

> Cron runs the scripts straight from the Portal checkout in `/opt/basket-app`,
> so a Portal deploy updates them; the crontab lines only change if the paths do.

---

## Verify Phase 1 done

- [ ] `docker port basket-portal-db` → `127.0.0.1:5434` on prod (loopback only).
- [ ] Local dev container up; `npm run db:portal:migrate` created the schema.
- [ ] `backup.sh` run by hand produced four `*.sql.gz` (one per DB) in `/var/backups/basket/` and ended with `done —`.
- [ ] `restore-test.sh` reports `OK <db> — restored cleanly` for all four and ends with `all 4 DBs restored cleanly`.
- [ ] Both cron lines installed in root's crontab.
