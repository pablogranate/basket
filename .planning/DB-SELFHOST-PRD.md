# PRD — Portal Domain DB: Supabase → self-hosted Postgres

**Status:** decided (grilled 2026-07-17), not started
**Decision record:** `docs/adr/0002-self-hosted-portal-domain-db.md`
**Audience:** the agent/dev implementing the migration
**Vocabulary:** `CONTEXT.md` → *Domain DB*, *Auth DB* (new terms; use them)

---

## 0. Environment gotchas (read first)

- **Skip GSD.** Work planning files directly; do not invoke `gsd-*` skills (standing user preference).
- **A hook may silently revert edits.** After every Edit/Write, verify it stuck (`grep`) before moving on.
- **One commit per phase**, staged explicitly — an auto-commit hook tends to bundle the whole tree.
- **Quality gate:** `npm run check` (lint + typecheck + build) + `npm test` (vitest, 14 suites exist already).
- **Prod access:** `SERVER` / `SERVER_PASS` in `.env.local` (`sshpass -e ssh`). Server uses **docker** (not podman). pm2 runs as root; `wences` has no sudo — coordinate steps needing root with the user.
- **Live WhatsApp tests go only to Wenceslao Cápolo.**

## 1. Problem

Domain DB lives in Supabase cloud (São Paulo); prod server is in NYC. Measured from the server: 125 ms wire RTT, **160–450 ms per authed query** through Cloudflare/Kong/PostgREST (1.09 s cold). Pages pay 2–3 serial query waves, server actions 3–5 sequential round trips → 0.4–1 s pure DB wait per interaction. Same queries on a local container: 1–5 ms.

Supabase provides nothing else we use: identity is Better Auth (Auth DB, already local), no Storage/Realtime/RPC/Edge Functions; RLS is a bypassed deny-all. The DB is 17 MB (779 matches, 273 people), PG 17.6, extensions `pgcrypto` + `pg_trgm` + `uuid-ossp`, **zero** app-level functions/triggers.

Portal is the **sole reader/writer** — verified: n8n, analytics, incidencias, generator, and all `/opt` apps never touch this project.

## 2. Goal / non-goals

**Goal:** portal reads/writes a self-hosted `basket-portal-db` container on the prod server via Drizzle; supabase-js and all `SUPABASE*` config are gone; per-query latency ~1–5 ms.

**Non-goals (separate side-tasks, do not fold in):**
- Locking down the `0.0.0.0` bindings of existing `:5432`/`:5433` containers.
- Offsite (Google Drive/rclone) backup leg — phase 1 backups are local-only, offsite comes later.
- Any auth changes. Auth DB is untouched throughout.

## 3. Locked decisions

| Area | Decision |
|---|---|
| Strategy | Big-bang Drizzle rewrite of all ~118 supabase-js call sites; one PR; one cutover |
| Placement | New dedicated container `basket-portal-db`, image `postgres:17`, published **127.0.0.1:5434 only**, `restart=unless-stopped` |
| Not chosen | PostgREST shim; incremental port; database inside `basket-auth-db` (auth instance gates portal + generator login; keep it boring) |
| Schema source | `src/lib/db/schema.ts` (hand-written Drizzle, domain) + drizzle-kit config `drizzle.portal.config.ts`; mirror the auth setup (`drizzle.auth.config.ts`, `db:auth:generate`) |
| Baseline migration | `drizzle-kit pull` against current schema → migration 0000, marked applied at restore; `supabase/migrations/` frozen as history, never applied again |
| Types | Drizzle inference (`$inferSelect` / `$inferInsert`) replaces `database.types.ts` (~33 importers). View models in `src/lib/types.ts` remain the app-facing layer |
| RLS | Dropped at restore (all policies + `ENABLE ROW LEVEL SECURITY`). Authorization = app layer only (`requireEditor`/`requireUserContext`) |
| Dev env | Each dev (wences, pablogranate) runs a local `basket-portal-db` container (like auth-db at :5433). `db:refresh` script: `ssh prod pg_dump | psql local`. Developing against prod data ends |
| Import CLIs | Port all 4 (`tools/import/{index,contactos,periodistas,grilla}.mjs`) from supabase-js to the `postgres` client |
| Backups | Nightly cron on server: `pg_dump` of `basket_portal` **and** `basket_auth` → `/var/backups/basket/`, 14-day retention, weekly automated restore-test into scratch container. 24 h loss budget accepted |
| Supabase retirement | Project frozen ~30 days post-cutover → final dump archived with backups → project deleted → strip `SUPABASE*` env vars + `@supabase/*` deps |

## 4. Scope of the rewrite

- Call sites: **55** in `src/app/actions/`, **30** in `src/lib/data/`, **5** in `src/app/api/`, ~4 in `tools/import/`.
- Client layer: replace `src/lib/supabase/{admin,server}.ts` with a Drizzle client module (pattern: `src/lib/db/auth-client.ts` — `drizzle(postgres(url, { prepare: false }))` singleton). Delete dead `src/lib/supabase/browser.ts`.
- Env: new `DATABASE_URL` (portal domain DB). Remove `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `isSupabaseConfigured`, `assertSupabaseEnv`, `assertServiceRoleKey` from `src/lib/env.ts` (and the `<SetupPanel />` short-circuits that key off them).
- Semantics to preserve per call site: select shape (column subset!), ordering, null vs undefined, `count` options, `.single()`/`.maybeSingle()` (throw vs null), upsert conflict targets, timezone handling (`America/Bogota` default in `src/lib/date.ts`).

## 5. Verification (all three, mandatory)

1. **Read-parity harness** (temporary, deleted post-cutover): for every loader in `src/lib/data/` + read paths in actions, run old supabase-js version and new Drizzle version against the *same* DB, deep-diff JSON. Run in CI-style script before cutover.
2. **Manual smoke checklist** on local container with prod dump: grid, matches CRUD, people, teams, reports/exports (PDF/CSV), attendance, announcements, settings, notifications dry-run, AI intake, auth roles (viewer/collaborator/editor/admin paths).
3. **Permanent vitest coverage**: extend the existing suite (`src/lib/__tests__/`, vitest ^4 already configured) with data-layer integration tests against the local container. Keep parity-harness fixtures as seeds.

## 6. Cutover runbook (~2–3 min downtime)

Precondition: branch green (check + tests + parity + checklist), no-match weekday morning (AR time, outside 11:00/22:00 notification slots), new build **pre-built** on server.

1. `pm2 stop` portal → all writers frozen (crons/WhatsApp/intake live in-process).
2. `pg_dump` Supabase (schema+data, `--no-owner --no-privileges`, public schema only) → restore into `basket-portal-db`; create extensions; drop RLS/policies; mark drizzle baseline applied; sanity row-counts vs source. **Exact steps rehearsed 2026-07-20 — see the smoke-checklist rehearsal log for the ordered commands.** Order that matters: `DROP SCHEMA public CASCADE; CREATE SCHEMA public;` (the dump's `CREATE SCHEMA public` else aborts under `ON_ERROR_STOP`) → `CREATE EXTENSION IF NOT EXISTS pg_trgm;` (dump omits it) → restore → `ALTER TABLE … DISABLE ROW LEVEL SECURITY` on all 19 → `scripts/db/mark-baseline-applied.sh` (inserts the exact hash/created_at drizzle-kit writes, so `db:portal:migrate` skips 0000 whose plain `CREATE TABLE`s would otherwise fail) → row-count sanity.
3. Swap env (`DATABASE_URL` → `127.0.0.1:5434`), `pm2 start` new build.
4. Smoke checklist against prod.
5. **Rollback** (any failure): restore old env + previous git ref build, `pm2 start`. Supabase received no writes during freeze → zero data loss.

## 7. Phases (one commit each)

1. **Infra** — prod + dev containers, `db:refresh` script, backup cron + restore-test script (covers Auth DB too — it has no backups today).
2. **Schema layer** — `schema.ts`, drizzle config, baseline migration, Drizzle client module.
3. **Port: data loaders** (`src/lib/data/`) + parity harness proving them.
4. **Port: actions + API routes** + delete supabase client layer, env cleanup.
5. **Port: import CLIs.**
6. **Verification hardening** — vitest data-layer suite, full parity run, smoke checklist doc.
7. **Cutover** (runbook above) + 30-day retirement follow-up.

Phases 2–5 land on one branch → single PR (big-bang deploy), but keep per-phase commits for reviewability.

## 8. Risks

- **No parity for writes** — mitigated by checklist + vitest write tests (audit/stamp columns: app code sets them today, must stay true — `stamping-coverage.test.ts` exists, extend it).
- **Single disk holds DB + backups** until offsite leg lands — accepted temporarily, tracked as side-task.
- **`.single()`/error-shape drift**: supabase-js returns `{ data, error }`; Drizzle throws. Every call site's error path (`ensureErrorMessage`, `result.error` checks) needs deliberate rewrite, not mechanical.
- **Pooler vs direct**: new client uses `prepare: false`? Not needed on direct connection (that flag exists for pgbouncer transaction mode) — use plain defaults, modest pool (`max: 10`).

## 9. Effort

~2 weeks: port 1–1.5 w (dominant), infra + backups + CLIs ~2 d, verification woven through, cutover morning.
