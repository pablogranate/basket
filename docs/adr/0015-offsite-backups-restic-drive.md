---
status: accepted
---
# Every app's backup goes off the server, encrypted, with restic on a Google Shared Drive

Until now the nightly backup dumped four Postgres DBs (Portal, Auth, Facturación, Cashflow) into `/var/backups/basket` on the same VPS that runs them. Losing that server would have lost the data and its backups together. Analytics had only a manual dump, and nothing covered Ops (Supabase DB and Storage), Matchwatch's SQLite, the uploaded files (Incidencias photos, Facturación attachments) or the server's own config: every `.env`, nginx, certificates, deploy keys. A failure only showed up in a log file nobody reads.

## Decisions

- **One backup for every app, run from Portal.** `scripts/backup/` and its single cron entry (`nightly.sh`) cover all the apps on the VPS; `config.sh` is the one list of what is backed up. A new app adds its DB or folder there.
- **restic, through rclone, onto a Google Shared Drive.** restic encrypts on the server, so Drive only holds ciphertext of personal data, sessions and secrets. It uploads only the chunks Drive lacks: on a 6.8 MB test dump, a night with a few hundred changed rows sent 1.9 MB, and photos go up once. It keeps 14 daily, 8 weekly and 12 monthly snapshots at little extra cost. A service account has no Drive storage, so the target is a Shared Drive.
- **Dumps stay gzip, with `--rsyncable`.** It keeps 14 days of dumps small on the server and still lets restic upload only what changed. Measured: uncompressed dumps sent more.
- **The server's config is in the backup.** Without the `.env` files and keys, rebuilding a lost server took one to two days of recreating secrets; with them it takes hours. The restic password is the only thing outside it: it lives in the password manager.
- **The weekly restore-test reads from Drive.** It restores the latest snapshot's dumps from Drive and loads each one into a scratch Postgres, so it proves the off-site copy and not only the local one.
- **Failures mail; Sundays mail "all OK".** The weekly OK mail is the heartbeat: no mail means the backup stopped.
- **Ops: only the `public` schema.** Supabase owns the `auth` and `storage` schemas; they do not restore anywhere else. Storage objects are mirrored through the Storage API, since a dump does not hold them.

## Considered Options

- **rclone copy of the dump files, no restic**: simplest, and Drive shows plain files, but they would sit unencrypted on Drive and each night's full dumps make a long history expensive.
- **Uncompressed dumps for better dedup**: on the same test, the 25 MB uncompressed dump added 7.6 MB a night (before restic's own compression) against 1.9 MB with `gzip --rsyncable`.
- **Backups in each app's repo**: four schedules and four alert paths to keep alive. The VPS is one server; one backup of it is easier to trust.
