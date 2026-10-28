# Runbook — self-hosted domain DB infra (migration Phase 1)

Provisions the `basket-portal-db` Postgres container (local + prod), the
`db:refresh` dev workflow; backups moved to `WencesCapolo/basket-tv-infra` (§3).
Code artifacts live in the repo; the
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

## 3. Backups

Backups are no longer in this repo. `WencesCapolo/basket-tv-infra` runs them
(`backups/nightly.sh`, root cron 04:00): a nightly dump of every DB, an
encrypted off-site copy on Google Drive, and a weekly restore-test from that
copy. To add a DB, an upload folder or a `.env`, edit `backups/config.sh` there.
Runbook: `docs/backups.md` in that repo.

---

## Verify Phase 1 done

- [ ] `docker port basket-portal-db` → `127.0.0.1:5434` on prod (loopback only).
- [ ] Local dev container up; `npm run db:portal:migrate` created the schema.
- [ ] Backups: see §3 (`basket-tv-infra`).
