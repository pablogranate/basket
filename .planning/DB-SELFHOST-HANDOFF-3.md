# Handoff 3 — Domain DB migration: Supabase → self-hosted Postgres

**Audience:** the agent continuing this migration
**Status (2026-07-17):** All **code** phases DONE and committed (2, 3, 4, 5, 1, 6). Only operational, user-owned work remains: Phase 1 root/VPS steps and Phase 7 cutover. The migration is code-complete on branch `feat/domain-db-selfhost`.
**Branch:** `feat/domain-db-selfhost` (Phases 2–6 live here as one reviewable commit series → the single PR the PRD calls for; not opened yet).

**Read in this order:**
1. This file.
2. `.planning/DB-SELFHOST-HANDOFF-2.md` — per-phase detail for everything already done (§1 + §4 + the appended Phase 5/1/6 blocks). Don't repeat that work; use it to understand decisions.
3. `.planning/DB-SELFHOST-HANDOFF.md` — original handoff (env/server/source-DB facts, §1 especially). Still valid.
4. `.planning/DB-SELFHOST-PRD.md` — spec, locked decisions, cutover runbook (§6).
5. `docs/adr/0002-self-hosted-portal-domain-db.md` — why.

---

## 0. Environment gotchas (unchanged, still bite)

- **Skip GSD.** Work planning files directly; do NOT invoke `gsd-*` skills (standing user preference).
- **A hook may silently revert edits.** After every Edit/Write, verify it stuck.
- **One commit per phase**, staged explicitly (an auto-commit hook bundles the whole tree — stage only your files).
- **Quality gate:** `npm run check` (lint + typecheck + test + build). Green now: 0 lint errors (7 pre-existing warnings in untouched files), 763 unit tests, build OK.
- **Integration tests need docker** and are NOT in `check`: `npm run test:integration` (spins an ephemeral `postgres:17`). 8 tests, green.
- **Pre-existing untracked junk — leave alone:** `0001registrossynclogs.patch`, `registrossynclogs.diff`, `.planning/GRID-STATS-FILTERS-HANDOFF.md`.
- **Prod access / docker (podman aliased) / no-sudo / WhatsApp-test-to-Wenceslao-only:** original handoff §1. `docker`==podman 5.8.2 locally.

## 1. Commit series (this branch)

```
9700eef Phase 6 — write-path integration suite + smoke checklist
aa61b11 Phase 1 — self-hosted DB infra (container, backups, refresh)
a142f06 Phase 5 — import CLIs → postgres client
a0b9f3f Phase 4 — actions + API routes + remaining prod lib → Drizzle
026e7c9 Phase 3 — data loaders → Drizzle + read-parity harness
8956e71 Phase 2 — self-hosted domain DB schema layer (Drizzle)
7a8b76c Phase 0 — planning/spec
```

## 2. What is DONE (see HANDOFF-2 for detail)

- **Phase 2** schema layer: `src/lib/db/{schema,relations,client,columns,rows}.ts`, `drizzle.portal.config.ts`, `drizzle/portal/**`. timestamptz customType + lazy client (HANDOFF-2 §3).
- **Phase 3** all 9 `src/lib/data/*.ts` loaders ported; read-parity harness `scripts/parity/` proves 19/19 byte-identical.
- **Phase 4** all 8 `src/app/actions/*.ts` + 2 API routes + remaining prod lib ported; `writeAudit`/`notifyMatch` dropped their client params; app owns `updated_at` (triggers gone). `browser.ts` deleted; `admin.ts`/`server.ts` KEPT (parity baseline imports them — delete only at Phase 7).
- **Phase 5** all 4 `tools/import/*.mjs` → raw `postgres` client + shared `tools/import/db.mjs`.
- **Phase 1 (code)** `docker-compose.yml` `basket-portal-db` service; `scripts/db/{refresh,backup,restore-test}.sh`; `docs/runbooks/db-selfhost-infra.md`; baseline now creates `pg_trgm` (fresh postgres:17 lacks it — the 3 `matches` trigram indexes need it).
- **Phase 6** `src/lib/db/__tests__/write-paths.integration.test.ts` (8 tests) + `vitest.integration.config.mts` + `src/test/integration/{global-setup,db}.ts` + `scripts/db/with-test-db.sh` (`npm run test:integration`); `docs/runbooks/db-selfhost-smoke-checklist.md`. Default `check` excludes `*.integration.test.ts`.

## 3. What REMAINS (both user-owned — do NOT do unprompted)

**Phase 1 — root/VPS steps — DONE on prod 2026-07-20.**
`basket-portal-db` running (loopback `127.0.0.1:5434`, empty, `--restart unless-stopped`); `PORTAL_DB_*` added to prod `.env.local` (NOT `DATABASE_URL` — that's Phase 7); `/var/backups/basket` + `/var/log/basket-backup.log` created; `scripts/db/*` placed via `git checkout origin/feat/domain-db-selfhost -- scripts/db` (staged on prod `main`, resolves at cutover); both cron lines in **root** crontab. `backup.sh` smoke OK (auth dump real, portal dump empty as expected). `restore-test.sh` fails pre-cutover (`relation "matches" does not exist` — empty DB); expected, passes once cutover loads data. `wences` had no passwordless sudo but IS in the `sudo` group and `SERVER_PASS` is its sudo password (see memory).
Still open under Phase 1: **local dev container** (`docker compose up -d basket-portal-db` + `db:portal:migrate`) on each dev machine — runbook §1, unrelated to prod.

**Cutover prep DONE (2026-07-20):** PR #88 merged to `main` (merge commit, phase series preserved). Pre-cutover rehearsal green: read parity 19/19, write integration 8/8, and the full restore was rehearsed on a local container from a live Supabase dump → **19/19 tables row-count identical**, manual UI + role-matrix smoke all green (profiles relinked to local auth ids). The restore recipe + snags (clean `public` first, explicit `pg_trgm`, disable RLS, then `scripts/db/mark-baseline-applied.sh`) are in the smoke-checklist rehearsal log and PRD §6.2. Baseline hash `324155a3…d96fe5`, `created_at 1784303027915`. Remaining before the window: step 3 (pre-build on server).

**Phase 7 — cutover EXECUTED 2026-07-20 (user-prompted).**
Prod runs on `basket-portal-db` since 2026-07-20 ~21:47 UTC. 19/19 row-counts identical; dump archived at `/var/backups/basket/supabase-final-20260720-2147.sql.gz`; `DATABASE_URL` swapped in prod `.env.local`. Full execution log + the prod-only **pool-leak hotfix (PR #89)** in the smoke-checklist cutover log — read it before touching `src/lib/db/client.ts`.
Still open under Phase 7:
- **Manual smoke checklist × 4 roles against prod** (user-owned, UI work).
- **30-day retirement (from 2026-07-20 → due ~2026-08-19):** freeze Supabase → final dump already archived → delete project → strip `SUPABASE*` env + `@supabase/*` deps + `scripts/parity/` + `src/lib/supabase/{admin,server}.ts` (now safe — parity harness dies with it). Note: read parity can no longer run (source swapped); that's expected.

**Also pending (non-blocking):** open the single PR for Phases 2–6. User asked to decide whether to open now or after the Phase 1 root steps — confirm with them.

## 4. Verification: what's already proven vs what needs the cutover

- **Read parity** (automated): `npx tsx --tsconfig scripts/parity/tsconfig.json scripts/parity/run.ts` → 19/19. Needs `.env.local` DATABASE_URL + SUPABASE* pointing at the Supabase pooler (still the case pre-cutover).
- **Write paths** (automated): `npm run test:integration` → 8/8 (needs docker).
- **Manual smoke** (at cutover): `docs/runbooks/db-selfhost-smoke-checklist.md` — all sections × 4 roles. Run once pre-cutover on a local container loaded with a prod dump, once at cutover on prod.

## 5. Fast orientation commands

```
git log --oneline -7                    # the Phase 2–6 + Phase 1 series above
npm run check                           # full gate (unit only, no docker)
npm run test:integration                # 8 write-path tests vs ephemeral postgres:17 (needs docker)
npx tsx --tsconfig scripts/parity/tsconfig.json scripts/parity/run.ts   # read parity 19/19
grep -rln "@supabase/supabase-js\|from \"@/lib/supabase" src tools      # remaining supabase usage — should be ONLY admin.ts/server.ts + scripts/parity/baseline (kept until Phase 7)
```

## 6. Traps carried forward

- **Do NOT delete `src/lib/supabase/{admin,server}.ts` or `@supabase/*` deps before Phase 7** — `scripts/parity/baseline/*.ts` still import them and are typechecked. They all die together at retirement.
- **New timestamptz columns → use `timestamptz(...)` from `src/lib/db/columns.ts`**, never Drizzle's built-in `timestamp` (ISO-8601 codec, HANDOFF-2 §3).
- **New domain write site → stamp + audit it** (`stampInsert`/`stampUpdate` return snake_case; Drizzle `.values()`/`.set()` take camelCase — map explicitly). `stamping-coverage.test.ts` guards actions; the integration suite exercises the runtime behavior.
- **Ephemeral test containers:** readiness must probe TCP (`pg_isready -h 127.0.0.1`), not the socket (initdb temp server false-positives → ECONNRESET).
- **`audit_log.match_id` FKs `matches`** even post-trigger — audit rows for matches/assignments need a real match row first.
