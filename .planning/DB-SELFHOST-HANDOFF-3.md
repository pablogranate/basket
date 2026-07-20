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

**Phase 1 — root/VPS steps (needs the user; no sudo for `wences`).**
Run `docs/runbooks/db-selfhost-infra.md`: create the prod `basket-portal-db` container (loopback `127.0.0.1:5434`, via `docker run` not compose — see runbook §2), `/var/backups/basket`, install the two root cron lines, smoke `backup.sh` + `restore-test.sh`. Nothing here is code.

**Phase 7 — cutover + retirement (user-scheduled; NEVER run unprompted).**
Runbook: PRD §6 (~2–3 min downtime, no-match weekday morning AR time). Sequence: `pm2 stop` → `pg_dump` Supabase (`--no-owner --no-privileges`, public only) → restore into `basket-portal-db` → create extensions → drop RLS/policies → mark drizzle baseline applied → swap `DATABASE_URL` → `pm2 start` new build → run the smoke checklist → rollback path if any step fails.
Then the 30-day retirement follow-up: freeze Supabase → final dump archived with backups → delete project → strip `SUPABASE*` env + `@supabase/*` deps + `scripts/parity/` + `src/lib/supabase/{admin,server}.ts` (now safe — parity harness dies with it).

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
