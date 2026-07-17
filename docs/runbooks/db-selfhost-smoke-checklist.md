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
