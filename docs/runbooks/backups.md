# Runbook — backups of every basket-app.com app

One cron entry on the VPS backs up every app's data each night and sends it off
the server, encrypted, to a Google Shared Drive. Why it is built this way:
[ADR 0015](../adr/0015-offsite-backups-restic-drive.md). The code lives in
`scripts/backup/`; cron runs it from the Portal checkout in `/opt/basket-app`,
so a Portal deploy updates it. **The root/VPS steps are yours to run.**

## What is backed up

`scripts/backup/config.sh` is the one list. Add a new app's DB or folder there.

| What | How | Restore-test sanity |
|---|---|---|
| `basket_portal` (Portal + Incidencias) | `pg_dump` in `basket-portal-db` | `matches` count |
| `basket_auth` (users, sessions) | `pg_dump` in `basket-auth-db` | `auth_user` count |
| `basket_facturacion` | `pg_dump` in `basket_facturacion` | `envios` count |
| `basket_cashflow` | `pg_dump` in `basket_cashflow` (bytea: the raw `.xlsx` are in it) | `importaciones`, `archivos`, bytes |
| `basket_analytics` | `pg_dump` in `data-bp-postgres-1` | `basket_payments` count |
| Ops DB (Supabase) | `pg_dump --schema=public` over `OPS_DATABASE_URL` | `venues`, `messages` count |
| Ops photos and WhatsApp media (Supabase Storage) | mirrored to `/var/backups/ops-storage` | — |
| Matchwatch | `/var/lib/matchwatch`, its SQLite copied with `.backup` | — |
| Incidencias photos, Facturación uploads | `/srv/incidencias-fotos`, `/var/lib/facturacion-bp/uploads` | — |
| Server config | every app's `.env`, `/etc/matchwatch`, `/etc/cashflow-bp`, `/etc/basket-backup`, matchwatch systemd units, nginx, letsencrypt, `/root/.ssh`, pm2 dump, root's crontab | — |

Not backed up: app code (GitHub), `node_modules` and builds, n8n, the Ops
worker's WhatsApp session (scan the QR again).

## What runs

`scripts/backup/nightly.sh`, 04:00 every night:

1. `dump-databases.sh` — one `pg_dump` per DB → `/var/backups/basket/<db>-<stamp>.sql.gz`
   (gzip `--rsyncable`), plus the cluster's roles without passwords in
   `<db>-<stamp>.roles.sql`. 14 days kept on the server. Root-only files.
2. `mirror-ops-storage.mjs` — downloads new Ops Storage objects, removes deleted ones.
3. `offsite.sh` — stages the newest dump of each DB under fixed names
   (`/var/backups/basket-offsite/dbs/<db>-latest.sql.gz`) and runs `restic backup`
   of everything above. restic encrypts it and uploads only the chunks Drive
   lacks: on a test, a few hundred changed rows cost 1.9 MB of a 6.8 MB dump;
   files go up once.

On Sundays it also runs:

4. `offsite.sh weekly` — `restic forget --prune` (keeps 14 daily, 8 weekly,
   12 monthly snapshots) and `restic check --read-data-subset=10%`.
5. Restore-test from Drive — restores the latest snapshot's dumps from Drive into
   a temp folder and runs `restore-test.sh` on them: one scratch `postgres:17`,
   each DB's roles then its dump with `ON_ERROR_STOP`, then its sanity query.

A failing step does not stop the others. Any failure mails the whole run log to
`BACKUP_ALERT_TO` (Portal's SMTP); a clean Sunday mails "Backup semanal OK".
**No Sunday mail means the backup stopped running.**

Check by hand: `grep -E 'FAILED|done' /var/log/basket-backup.log | tail`.

## One-time setup

### Google (console, as a Workspace admin)

1. Create a Shared Drive, e.g. "Backups BasquetPass". A service account has no
   storage of its own, so it must write to a Shared Drive.
2. In a Google Cloud project, enable the Drive API, create a service account
   just for backups (e.g. `basket-backups`) and a JSON key for it.
3. Add the service account's email to the Shared Drive as **Content manager**.
4. Note the Shared Drive's ID and the ID of the folder inside it that holds the
   backups (`drive/folders/<ID>`). Today: Shared Drive `0ANhWLdXtnxGpUk9PVA`,
   folder "Backups" `1AESHLih20vug9wXd4M4RYz4qlsEmRIj8`; the repo is its `restic/` subfolder.

### Supabase (Ops project)

Dashboard → Connect → **Session pooler** URI (IPv4; the VPS has no IPv6, so
the direct `db.<ref>.supabase.co` host does not work). Fill in the DB password.

### VPS (root)

```bash
apt install -y restic rclone

install -d -m 700 /etc/basket-backup
# Copy the JSON key here, then:
chmod 600 /etc/basket-backup/gdrive-sa.json

cat > /etc/basket-backup/rclone.conf <<'EOF'
[gdrive]
type = drive
scope = drive
service_account_file = /etc/basket-backup/gdrive-sa.json
team_drive = <SHARED_DRIVE_ID>
root_folder_id = <FOLDER_ID>
EOF

# The encryption password. Save it in the password manager NOW: without it the
# backups on Drive can never be read, and it is not inside them.
openssl rand -base64 32 > /etc/basket-backup/restic-password

cat > /etc/basket-backup/env <<'EOF'
RCLONE_CONFIG=/etc/basket-backup/rclone.conf
RESTIC_REPOSITORY=rclone:gdrive:restic
RESTIC_PASSWORD_FILE=/etc/basket-backup/restic-password
OPS_DATABASE_URL=postgresql://postgres.<ref>:<password>@<pooler-host>:5432/postgres
BACKUP_ALERT_TO=<who gets the alerts>
EOF
chmod 600 /etc/basket-backup/*

# Create the encrypted repo on Drive.
set -a; . /etc/basket-backup/env; set +a
restic init

# The analytics dump from August is world-readable.
chmod 600 /var/backups/data-bp/*.dump

# First run by hand, with the Sunday steps. The first upload is the full set
# (a few hundred MB); expect the "Backup semanal OK" mail at the end.
BASKET_BACKUP_WEEKLY=1 /opt/basket-app/scripts/backup/nightly.sh
```

Then replace the two old backup lines in root's crontab (`crontab -e`) with:

```
0 4 * * *  /opt/basket-app/scripts/backup/nightly.sh >> /var/log/basket-backup.log 2>&1
```

and delete the `scripts/db/backup.sh` and `scripts/db/restore-test.sh` shims in
a follow-up PR.

## Restoring

Load the settings first: `set -a; . /etc/basket-backup/env; set +a`.

```bash
restic snapshots                          # pick a date
restic restore <snapshot-id> --target /tmp/r --include /var/backups/basket-offsite/dbs/basket_portal-latest.sql.gz
restic restore <snapshot-id> --target /tmp/r --include /srv/incidencias-fotos   # or any path
```

A dump restores into an empty DB, roles first (`pg_dump` never writes roles, and
the Portal dump has RLS policies `TO incidencias`). Set the roles' passwords again
afterwards; they are not in the backup.

```bash
docker exec -i <container> psql -U <user> -d postgres < <db>-latest.roles.sql   # "already exists" is fine
gunzip -c <db>-latest.sql.gz | docker exec -i <container> psql -v ON_ERROR_STOP=1 -U <user> -d <db>
```

The last 14 days are also on the server in `/var/backups/basket/`, with no
download needed.

**Lost server.** On the new one: `apt install restic rclone`, a new JSON key for
the service account, `rclone.conf` and `restic-password` (from the password
manager) as above, then `restic restore latest --target /`. That brings back
every `.env`, nginx, certificates, deploy keys, crontab and the data; then
clone the apps, build, start pm2 and the containers, and load the dumps.
