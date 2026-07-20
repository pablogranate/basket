# Smoke checklist — self-hosted domain DB (migration verification)

Manual verification that portal behaves identically on the self-hosted
`basket-portal-db` as it did on Supabase. Run it **twice**:

1. **Pre-cutover** — locally, app pointed at a local `basket-portal-db` loaded
   with a prod dump (`docs/runbooks/db-selfhost-infra.md` §1 + a dump restore).
2. **At cutover** — against prod, immediately after the swap (runbook PRD §6.4),
   before declaring success.

Automated coverage already in place — don't re-do by hand:
- Read parity: `npx tsx --tsconfig scripts/parity/tsconfig.json scripts/parity/run.ts` (19/19 loaders byte-identical).
- Write paths: `npm run test:integration` (stamp columns, audit rows, timestamptz codec, upsert).
- Full gate: `npm run check`.

This checklist covers what those can't: end-to-end UI flows and role gating.

## Setup

- [ ] `DATABASE_URL` points at the self-hosted container (not the Supabase pooler).
- [ ] `docker exec basket-portal-db psql -U basket_portal -d basket_portal -c '\dt'` lists all 19 tables.
- [ ] App boots (`pnpm dev` locally / pm2 online in prod); no `assertDatabaseUrl` throw in logs.
- [ ] Row-count sanity vs the source (matches, people, assignments, roles) within expected delta.

## Per-area flows (do as **editor/admin** unless noted)

### Grid (`/grid`)
- [ ] Loads with the current window of matches; day columns + assignments render.
- [ ] Text search (home/away/competition — the `gin_trgm_ops` indexes) returns hits.
- [ ] Filters (status, competition, date range) narrow the grid.
- [ ] Export button produces a PDF/CSV with the visible rows.
- [ ] Grid sheet-sync run (if triggered) writes `grid_sync_runs` + upserts assignments (no actor stamp, `updated_at` bumped).

### Matches CRUD (`/match/[id]`, create/edit)
- [ ] Create a match → appears in grid; `created_by`/`updated_by` = you (check `audit_log`).
- [ ] Edit a field → `audit_log` UPDATE row with correct before/after + `changed_by`.
- [ ] Assign a person to a role → assignment upserts (one row per match+role).
- [ ] Delete a match → cascades assignments + audit rows; grid updates.

### People (`/people`)
- [ ] List loads with search + category filters.
- [ ] Create/edit a person → stamped + audited; `person_functions` sync on save.
- [ ] Linked-person view (a person's matches/assignments) renders.

### Teams (`/teams`, `/teams/[slug]`)
- [ ] Team catalog loads; club/league/category grouping intact.
- [ ] Team detail page (logo, memberships) renders.
- [ ] Upsert a team (admin) → reference tables update (no stamp columns — expected).

### Reports / exports (`/reports`)
- [ ] Report stats aggregate correctly.
- [ ] PDF and CSV exports generate and open.
- [ ] Collaborator-reports API (`/api/collaborator-reports`) returns data for a real assignment.

### Attendance (`/mi-jornada`)
- [ ] Collaborator sees only their own assignments.
- [ ] Confirm / decline attendance → `attendance_response` + `attendance_confirmed_at` persist.
- [ ] Report submission (`/mi-jornada/[matchId]/reportar`) writes a collaborator_report (stamped + audited).

### Announcements
- [ ] Active announcement shows in the dashboard shell.
- [ ] Save/toggle an announcement (admin) → cache clears, new value shows within TTL.

### Settings (`/settings`)
- [ ] Settings load; secret values are masked in the UI.
- [ ] Save a secret (e.g. Gemini key) → `app_settings` row updated; `audit_log.after.secret_value` = `[redacted]`.

### Notifications (`/notifications`, `/notifications/{logs,syncs}`)
- [ ] Logs + sync history pages load.
- [ ] Match-day notification **dry-run** resolves recipients without sending (WhatsApp test → Wenceslao only).
- [ ] A send writes a `notification_logs` row.

### AI intake (`/api/matches/intake`, `/api/ai/*`)
- [ ] Intake POST with a sample payload creates/updates a match (stamped + audited).
- [ ] AI people/section endpoints respond (auth-gated).

## Role matrix (repeat the login + landing check for each)

| Role | Can reach | Must be blocked from | Landing |
|------|-----------|----------------------|---------|
| **viewer** | grid/read views | edit actions (buttons hidden; server action rejects with "No tenes permisos") | `/grid` |
| **collaborator** | `/mi-jornada` (own assignments only) | full grid edit, people/teams/settings | `/mi-jornada` |
| **editor** | create/edit matches, people, assignments | roles/settings admin-only screens | `/grid` |
| **admin** | everything incl. roles, settings, access management | — | `/grid` |

- [ ] viewer — read-only confirmed; a mutation attempt is rejected server-side.
- [ ] collaborator — sees only own jornada; cannot open editor screens.
- [ ] editor — CRUD works; admin-only screens blocked.
- [ ] admin — all screens reachable; role/access changes persist + audit.

## Sign-off
- [ ] All areas green on the self-hosted DB.
- [ ] `audit_log` accumulating rows with non-NULL `changed_by` for every mutation.
- [ ] No `NULL created_by/updated_by` on rows written post-swap (the trigger-drop risk).

## Rehearsal log

### 2026-07-20 — mechanical restore rehearsed locally (pre-cutover)
Dumped live Supabase → restored into a local `basket-portal-db` (postgres:17). Result: **19/19 tables row-count identical** to source, restore clean, read parity 19/19, write-path integration 8/8. Cutover-runbook (PRD §6.2) refinements found — apply these at cutover:

1. **`CREATE SCHEMA public` in the dump aborts under `ON_ERROR_STOP=1`** ("schema public already exists"). Reset the target to a clean schema first — `DROP SCHEMA public CASCADE; CREATE SCHEMA public;` — then restore (or tolerate that one error). The empty fresh container ships a `public`, so the dump's create collides.
2. **`pg_trgm` must be created explicitly before restore** — `CREATE EXTENSION IF NOT EXISTS pg_trgm;`. Supabase keeps extensions off the `public` schema, so `--schema=public` dumps omit it; the 3 `matches` trigram indexes need it.
3. **0 triggers on source** — Phase 4 already dropped the `updated_at` triggers on Supabase, so the dump carries none. Nothing to strip; app owns `updated_at`.
4. **RLS**: 19 tables `ENABLE`d, 0 policies. Owner (`basket_portal`) bypasses RLS anyway; disable to be safe — `ALTER TABLE <t> DISABLE ROW LEVEL SECURITY;` for every `public` table.
5. **"mark drizzle baseline applied" — solved + scripted: `scripts/db/mark-baseline-applied.sh`.** `db:portal:migrate` would otherwise fail against the restored schema (0000's plain `CREATE TABLE`s hit existing tables). The script inserts the exact rows drizzle-kit itself writes — `hash = sha256(<tag>.sql)`, `created_at = journal when` — into `drizzle.__drizzle_migrations`, journal-driven so it stays correct if the baseline changes. Verified end-to-end 2026-07-20: after the script, `db:portal:migrate` skips 0000 (`[✓] migrations applied successfully!`, exit 0) with data intact (19 tables / 798 matches); the empirically-derived baseline hash is `324155a3…d96fe5`, `created_at 1784303027915`.

Ordered restore recipe (rehearsed on a local `basket-portal-db` loaded from a live Supabase dump):
```bash
# target = the self-hosted basket-portal-db; run against its socket
docker exec -i basket-portal-db psql -U basket_portal -d basket_portal <<'SQL'
DROP SCHEMA public CASCADE; CREATE SCHEMA public;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
SQL
# restore the Supabase dump (public schema, --no-owner --no-privileges)
gunzip -c supabase-dump.sql.gz | docker exec -i basket-portal-db psql -U basket_portal -d basket_portal
# disable RLS on every public table
docker exec basket-portal-db psql -U basket_portal -d basket_portal -tAc \
  "SELECT 'ALTER TABLE '||quote_ident(tablename)||' DISABLE ROW LEVEL SECURITY;' FROM pg_tables WHERE schemaname='public';" \
  | docker exec -i basket-portal-db psql -U basket_portal -d basket_portal
# mark the drizzle baseline applied (so migrate skips it, future migrations still run)
scripts/db/mark-baseline-applied.sh
```

Still owed pre-cutover: the manual UI + role-matrix pass below — **done 2026-07-20, all areas green** (local app pointed at the loaded container; profiles relinked to local auth ids).

### 2026-07-20 — CUTOVER EXECUTED (prod)

Prod portal now runs on `basket-portal-db` (127.0.0.1:5434). Executed per PRD §6 + the rehearsal recipe above; all steps clean:

- Final Supabase dump archived: `/var/backups/basket/supabase-final-20260720-2147.sql.gz` (this doubles as the retirement archive).
- Restore: 19/19 tables **row-count identical** to source; only expected stderr (`schema "public" already exists`).
- RLS disabled on all 19; baseline marked (`324155a3…d96fe5` / `1784303027915`) via `npm run db:portal:mark-baseline`.
- `DATABASE_URL=postgresql://basket_portal:***@127.0.0.1:5434/basket_portal` appended to prod `.env.local` (Supabase vars left in place until retirement).

**Bug found at cutover — prod-only pool leak (PR #89, hotfixed same window).** `src/lib/db/client.ts` memoized the postgres pool only when `NODE_ENV !== "production"`, so in prod every `db` Proxy access built a fresh 10-conn pool → Postgres `max_connections` exhausted within minutes (`FATAL 53300: sorry, too many clients already`). Rehearsal missed it because local ran dev mode. Fix: memoize unconditionally. Deployed; steady-state connection count = 1.

Note: cutover also repaired an outage — the migration build had been deployed to prod earlier that day *without* `DATABASE_URL`, so every domain query was failing (`Missing DATABASE_URL`). Lesson: this build hard-requires `DATABASE_URL`; never deploy it without the env swap.
