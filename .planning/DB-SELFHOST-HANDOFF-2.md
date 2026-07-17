# Handoff 2 — Domain DB migration: Supabase → self-hosted Postgres

**Audience:** the agent continuing this migration
**Status (2026-07-17):** Phases 2, 3, 4 and 5 DONE and committed. Phase 1 (infra) not started (needs the user for root steps). Phases 6–7 not started.
**Branch:** `feat/domain-db-selfhost` (Phases 2–5 live here, one commit per phase, single PR at the end).

**Read in this order:**
1. This file.
2. `.planning/DB-SELFHOST-HANDOFF.md` — the original handoff (env gotchas, server facts, source-DB facts). Still valid; not repeated in full here.
3. `.planning/DB-SELFHOST-PRD.md` — the spec (locked decisions, phases, cutover runbook). Still valid.
4. `docs/adr/0002-self-hosted-portal-domain-db.md` — why.

---

## 0. Environment gotchas (unchanged, still bite)

- **Skip GSD.** Work planning files directly; do NOT invoke `gsd-*` skills (standing user preference).
- **A hook may silently revert edits.** After every Edit/Write, verify it stuck before moving on.
- **One commit per phase**, staged explicitly (an auto-commit hook bundles the whole tree — stage only your files).
- **Quality gate:** `npm run check` (lint + typecheck + test + build). Currently green: 0 lint errors, 763 tests, build OK.
- **Pre-existing untracked junk — leave alone:** `0001registrossynclogs.patch`, `registrossynclogs.diff`, `.planning/GRID-STATS-FILTERS-HANDOFF.md`.
- **Prod access / docker / no-sudo / WhatsApp-test-to-Wenceslao-only:** see original handoff §1.

## 1. What is DONE (committed)

**Phase 2 — schema layer** (commit `8956e71`)
- `src/lib/db/schema.ts` + `relations.ts` — hand-owned Drizzle schema, 19 tables, 2 enums. Pulled via `drizzle-kit pull`, then corrected for introspection bugs (empty-string defaults, `role_names` default, audit_log identity int64 precision, bogus composite-index op-classes).
- `drizzle.portal.config.ts` + `drizzle/portal/0000_lowly_network.sql` (baseline migration + meta snapshot). Baseline verified byte-identical to the live DB (applied to an ephemeral `postgres:17`, structural diff of columns/indexes/constraints = zero).
- `src/lib/db/client.ts` — Drizzle client. **Lazy** (connection built on first query, not at import — see §3).
- `src/lib/env.ts` — `DATABASE_URL` + `assertDatabaseUrl()`.
- `package.json` — `db:portal:{generate,migrate,pull}`.

**Phase 3 — data loaders + read-parity harness** (commit `026e7c9`)
- All 9 `src/lib/data/*.ts` ported supabase-js → Drizzle: `announcements`, `platform-access`, `linked-person`, `sync-logs`, `notification-logs`, `teams`, `dashboard`, `collaborators`, `attendance`. View models (`src/lib/types.ts`) and app-facing Row types (`database.types.ts`) UNCHANGED — only the query layer changed.
- `src/lib/db/columns.ts` — `timestamptz` customType (see §3, critical).
- `src/lib/db/rows.ts` — snake_case column projections reproducing `select("*")` shapes.
- `scripts/parity/` — the read-parity harness (see §4). **19/19 cases byte-identical old-vs-new.**
- Two existing loader unit tests rewritten to mock the Drizzle client instead of the supabase query builder.

## 2. The parity principle that made Phase 3 tractable

The exported loader functions transform DB rows heavily in JS before returning view models. So the parity contract is **the exported function's return value**, not the raw query shape. This means you can restructure queries freely (multiple flat Drizzle queries + assemble nested objects in JS) instead of replicating PostgREST embedding — as long as output is identical. Use the same principle for Phase 4/5.

Per call site, preserve deliberately: select column subsets, ordering, `.single()`(throw)/`.maybeSingle()`(null), count+pagination, filter operators (`eq/ilike/inArray/gte/lte/or`), left-join `{all-null}` → `null` conversion (`row.x?.id ? row.x : null`), and `America/Bogota` date handling. supabase-js returns `{data,error}`; Drizzle **throws** — rewrite each error path (graceful fallbacks wrap in try/catch; `.single()` misses throw explicitly).

## 3. Two non-obvious decisions you MUST respect

- **timestamptz customType.** Every timestamptz column in `schema.ts` uses `timestamptz(...)` from `src/lib/db/columns.ts`, NOT Drizzle's built-in `timestamp(...)`. Reason: the `postgres` driver returns `2026-05-01 18:45:00+00` but the app + old PostgREST expect ISO 8601 `2026-05-01T18:45:00+00:00`; Drizzle's built-in timestamp forces raw text and ignores connection-level parser overrides, so normalization lives in the column codec. DDL is unchanged (verified). **New timestamptz columns → use `timestamptz(...)`.**
- **Lazy client.** `src/lib/db/client.ts` builds the connection on first query via a Proxy, not at import. This lets modules/tests that merely import a loader run without `DATABASE_URL`. Don't revert to eager.

## 4. The parity harness (how to run + a trap for Phase 4)

Location: `scripts/parity/` (temporary — delete at retirement, Phase 7). Run:
```
npx tsx --tsconfig scripts/parity/tsconfig.json scripts/parity/run.ts            # all cases
npx tsx --tsconfig scripts/parity/tsconfig.json scripts/parity/run.ts grid       # filter by name substring
```
It imports OLD supabase-js loaders from `scripts/parity/baseline/*.ts` and NEW Drizzle loaders from `@/lib/data/*`, runs both **back-to-back** against the same DB (drift-immune for live-written tables like `grid_sync_runs`), deep-diffs the JSON. Needs `.env.local` (DATABASE_URL + SUPABASE* both point at the Supabase pooler during the port). Grid within-day tie order is made deterministic (secondary sort on `id`) and canonicalized in the harness.

**⚠ Phase 4 trap:** `scripts/parity/baseline/*.ts` import `@/lib/supabase/{admin,server}` and are typechecked (`**/*.ts`). So in Phase 4 do NOT delete `admin.ts`/`server.ts` — only remove their *production* usage. Keep them (and `@supabase/*` deps) until Phase 7 retirement, deleted together with the harness. `browser.ts` is already dead → safe to delete in Phase 4. (The PRD Phase 4 line "delete supabase client layer" means "remove production usage", per this decision.)

**Phase 4 — actions + API routes + remaining prod lib (this branch, one commit)**
- All 8 `src/app/actions/*.ts` ported supabase-js → Drizzle (matches, people, teams, settings, roles, notifications, contacts, match-card-sections) + both `src/app/api/{collaborator-reports,grid/reports}/route.ts`.
- Also ported the prod lib files that used supabase-js (the handoff estimate missed these): `src/lib/auth.ts` (profiles read/auto-link), `src/lib/settings.ts` (app_settings read), `src/lib/grid/sync.ts` (full sheet-sync writes), `src/lib/notifications/{log,send-match-day}.ts`, `src/app/(dashboard)/fixtures/page.tsx`.
- `writeAudit` (`src/lib/audit.ts`) ported to write via Drizzle `db` directly; **its signature dropped the `supabase` param** → now `writeAudit(ctx, args)`. `notifyMatch` likewise dropped its client param → `notifyMatch(match, trigger)`.
- Stamp mapping: `stampInsert`/`stampUpdate` return snake_case; every Drizzle `.values()`/`.set()` maps to camelCase explicitly (see the `toMatchColumns`/`toAssignmentColumns` mappers in `matches.ts`, or the inline maps elsewhere). PostgREST upserts became `.onConflictDoUpdate` (batch upserts use `sql\`excluded.col\``; single-row upserts set literal values).
- The `OPTIONAL_MATCH_COLUMNS` insert/update fallback in `matches.ts` was **removed** — it only caught PostgREST's "Could not find the 'X' column" schema-cache error, which the postgres driver never emits (columns exist in the self-hosted schema).
- Grid sync has **no `UserContext`** → no actor stamping (created_by/updated_by stay NULL, as under the old service-role trigger) and no audit rows; but it now sets `updated_at` itself on match-update and assignment-upsert since the baseline migration ships **zero triggers** (verified: `drizzle/portal/0000` has no `set_row_metadata`/`log_audit_event`).
- `src/lib/supabase/browser.ts` **deleted** (was already dead). `admin.ts`/`server.ts` **kept** (parity baseline still imports them — see §4).
- Tests: `audit.test.ts` + `settings-secret.test.ts` re-mocked onto the Drizzle `db`. `stamping-coverage.test.ts` rewritten — its old regex matched `.from("t").insert()` (supabase-js) and would silently match nothing under Drizzle; it now detects `db.insert/update(alias)`, resolves the alias via each file's `@/lib/db/schema` import, and keeps the unknown-domain-table + stamp/audit-presence guards (stamp/audit checks are now file-scoped because stamping flows through the mappers; per-write precision moves to the Phase 6 integration suite).
- Parity harness was **not** extended with action/API read cases: those reads are gated behind `requireUserContext`/`withAuth` (not runnable standalone), and their query shapes reuse the Drizzle patterns already proven 19/19 in the loaders.
- Gate green: 0 lint errors (7 pre-existing warnings in untouched files), 763 tests, build OK.

**Phase 5 — import CLIs** (this branch, one commit)
- All 4 `tools/import/{index,contactos,periodistas,grilla}.mjs` ported supabase-js → the `postgres` client (raw SQL; `.mjs` can't import the TS Drizzle schema without a build step).
- `tools/import/db.mjs` — shared `connectDb()`: checks `DATABASE_URL`, returns a `postgres` instance (`{ max: 5 }`). Every script `await sql.end()`s before returning (postgres holds the socket open; without it Node hangs — supabase-js over HTTP never needed this).
- Query translation: `.select()` → `await sql\`SELECT ...\`` (returns row array, throws on error — no `{data,error}`); `.insert().select().single()` → `INSERT ... ${sql(obj)} RETURNING id` + destructure `[row]`; `.upsert({onConflict, ignoreDuplicates:true})` → `ON CONFLICT (...) DO NOTHING`; `.upsert({onConflict})` (assignments) → `ON CONFLICT (...) DO UPDATE SET col = excluded.col, ...`; batch inserts → `sql(arrayOfObjects)`. ON-CONFLICT targets verified against schema: `person_functions_unique`, `assignments_match_role_unique`, `club_contacts_unique`.
- **App owns `updated_at`.** The baseline migration ships zero triggers (same as Phase 4), so every UPDATE / conflict-update path sets `updated_at = new Date().toISOString()` explicitly (matches grid sync). INSERTs omit `id`/`created_at`/`updated_at` — column defaults cover them.
- Env: all scripts now require `DATABASE_URL` (was `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`). `grilla` still fails-fast on missing env at top even though its dry-run doesn't hit the DB (parity with old behavior).
- Smoke-tested: `contactos` dry-run (pure parse, exit 0), `periodistas` dry-run (real postgres read of 66 people + clean `sql.end()` exit 0). Full write paths need Phase 1's local container to test end-to-end.
- Gate green: 0 lint errors (7 pre-existing warnings, incl. `grilla.mjs`'s long-unused `FIELD_COLUMNS` — left alone), 763 tests, build OK.

## 5. What REMAINS

**Phase 1 — infra (needs the user for root/VPS steps; independent of code).**
Prod container `basket-portal-db` (`postgres:17`, published `127.0.0.1:5434` only, `restart=unless-stopped`), each dev's local container, `db:refresh` script (`ssh prod pg_dump | psql local`), nightly `pg_dump` backup cron for `basket_portal` + `basket_auth` (14-day retention, weekly restore-test). PRD §7.1.

**Phase 6 — verification hardening.** Permanent vitest data-layer integration suite against the local container (seed from parity fixtures; priority on write paths + stamp columns — `stamping-coverage.test.ts` is the seed). Write the manual smoke checklist doc (all sections, all 4 roles).

**Phase 7 — cutover + retirement.** User-scheduled (no-match weekday morning, AR time). Runbook in PRD §6. Then 30-day Supabase freeze → final dump → delete project → strip `SUPABASE*` env + `@supabase/*` deps + `scripts/parity/` + supabase client modules. Never run cutover unprompted.

## 6. Fast orientation commands

```
git log --oneline -4                    # import CLIs, a0b9f3f actions+API, 026e7c9 loaders, 8956e71 schema
npm run check                           # full gate
npx tsx --tsconfig scripts/parity/tsconfig.json scripts/parity/run.ts   # parity 19/19
grep -rn "supabase" src/lib/data/       # confirm loaders are clean (only 1 comment)
```

## 7. File map (new/changed in Phases 2–3)

- Schema/client: `src/lib/db/{schema,relations,client,columns,rows}.ts`, `drizzle.portal.config.ts`, `drizzle/portal/**`
- Loaders (ported): `src/lib/data/{announcements,platform-access,linked-person,sync-logs,notification-logs,teams,dashboard,collaborators,attendance}.ts`
- Env/scripts: `src/lib/env.ts`, `package.json`
- Harness: `scripts/parity/{lib,cases,run}.ts`, `scripts/parity/tsconfig.json`, `scripts/parity/baseline/*.ts`
- Tests rewritten: `src/lib/__tests__/loaders-ctx.test.ts`, `src/app/actions/__tests__/set-attendance-confirmation.test.ts`
