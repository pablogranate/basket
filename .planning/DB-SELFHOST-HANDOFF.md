# Handoff — Domain DB migration: Supabase → self-hosted Postgres

**Audience:** the agent implementing this migration
**Status when written (2026-07-17):** fully decided and specced, zero implementation started. All decisions were grilled with the user and are LOCKED — do not re-litigate them, execute them.

**Read in this order:**
1. This file (gotchas + facts you can't rediscover cheaply)
2. `.planning/DB-SELFHOST-PRD.md` — the spec: locked decisions, scope, phases, runbook
3. `docs/adr/0002-self-hosted-portal-domain-db.md` — why, and what was rejected
4. GitHub issues #78 (epic) → #79–#85 (phases), #86/#87 (side-tasks, not yours unless asked)

---

## 0. Environment gotchas (these bit previous agents)

- **Skip GSD.** `CLAUDE.md` pushes a GSD workflow; the user's standing preference is to work planning files directly and NOT invoke `gsd-*` skills.
- **A hook silently reverts some edits.** After every Edit/Write, verify the change stuck (quick `grep`) before moving on. If reverted, re-apply.
- **One commit per phase** (user preference). Stage files explicitly — an auto-commit hook tends to bundle the whole tree.
- **Quality gate:** `npm run check` (lint + typecheck + build) and `npm test` (vitest, 14 suites exist).
- **Live WhatsApp test sends go ONLY to Wenceslao Cápolo.** Never to anyone else.
- **Caveman mode** may be active in the session — cosmetic, ignore.

## 1. Server facts (verified live, don't re-derive)

- Prod access: `SERVER` + `SERVER_PASS` vars in `.env.local` (never commit their values). Use `sshpass -e ssh`. The `eguia` host in `~/.ssh/config` is NOT this server and its keys are dead.
- Server runs **docker** (not podman, despite what an older memory says). `wences` has **no sudo**; pm2 runs as root — anything needing root (nginx, pm2, crontab -e as root) must be coordinated with the user.
- Portal lives at `/opt/basket-app`, pm2-managed, port 3000. There is a `.env.local.bak-20260616-222111` beside its env — scrub that too at retirement.
- Existing containers: `basket-auth-db` (postgres:17, :5433 — shared identity, DO NOT TOUCH), `data-bp-postgres-1` (postgres:16-alpine, :5432 — analytics, not ours), `n8n` (:5678).
- Both existing PG containers are exposed on `0.0.0.0` — known issue, tracked as #86, out of scope here. The new container must be `127.0.0.1:5434` from day one.
- nginx: per-subdomain vhosts in `/etc/nginx/sites-enabled/`; generator uses `auth_request /__gate` against the portal — auth-db downtime = generator login outage. Another reason the new DB is a separate container.

## 2. Source DB facts (verified via psql against the pooler)

- Connection string: `DATABASE_URL` in `.env.local` (Supabase pooler, sa-east-1). Works with plain `psql` today — use it for introspection and the dump.
- PG **17.6**, database 17 MB, 779 matches / 273 people. Dump/restore is seconds.
- Extensions to recreate: `pgcrypto`, `pg_trgm`, `uuid-ossp`. Everything else in `pg_extension` is Supabase-internal — skip.
- **Zero app-level functions or triggers** in the public schema (the ones mentioned in old migration files were dropped long ago — do not port them).
- RLS enabled on 19 tables as a bypassed deny-all → dropped at restore, per ADR. Auth is app-layer only.
- Dump with `--no-owner --no-privileges`, public schema only.

## 3. The rewrite in one paragraph

Replace supabase-js with Drizzle everywhere: ~55 call sites in `src/app/actions/`, ~30 in `src/lib/data/`, ~5 in `src/app/api/`, 4 CLIs in `tools/import/`. The pattern to copy is the auth stack: `src/lib/db/auth-client.ts` (drizzle + postgres driver singleton), `src/lib/auth/schema.ts`, `drizzle.auth.config.ts`, `db:auth:generate`. Build the domain twin of each (`schema.ts` for the domain DB, `drizzle.portal.config.ts`, client module). `database.types.ts` (~33 importers) is replaced by Drizzle-inferred types; view models in `src/lib/types.ts` stay. `src/lib/supabase/browser.ts` is already dead code — delete without ceremony.

## 4. The trap that will produce silent bugs

supabase-js returns `{ data, error }`; Drizzle **throws**. Every call site checks `result.error` or destructures `data` — a mechanical port that keeps those checks will dead-code the error paths and swallow nothing (or worse, treat throws as unhandled). Rewrite each error path deliberately: catch → `rethrowNavigationError(error)` first (Next redirect/notFound throws!), then `ensureErrorMessage`. Also preserve per call site: selected column subsets, `.single()` (throws on 0 rows) vs `.maybeSingle()` (null), ordering, upsert conflict targets, count options, `America/Bogota` date handling via `src/lib/date.ts`.

## 5. Verification is a hard gate, not a suggestion

Three legs, all mandatory (user chose all three explicitly):
1. **Read-parity harness** (temporary, in `scripts/`): every loader run through old and new code against the same DB, deep-diff JSON. Zero diffs before cutover. During the port both clients can point at the current Supabase DB — parity is runnable from day one.
2. **Manual smoke checklist** (write it in Phase 6, run it at cutover): all sections, all four roles.
3. **Permanent vitest integration tests** for the data layer against the local container — extend `src/lib/__tests__/`, priority on write paths and stamp columns (`stamping-coverage.test.ts` is the seed).

## 6. Where to start

Phase 1 (#79) and Phase 2 (#80) are independent — start with Phase 2 if you want pure-code progress without server coordination; Phase 1 needs the user available for root steps. Phases 2–5 go on **one branch, one PR** (big-bang deploy) with one commit per phase. Cutover (#85) is user-scheduled: no-match weekday morning, AR time, runbook in PRD §6 — never run it unprompted.

## 7. Current repo state

- Committed on `main`: this handoff, `.planning/DB-SELFHOST-PRD.md`, `docs/adr/0002-self-hosted-portal-domain-db.md`, CONTEXT.md glossary additions (*Domain DB*, *Auth DB* — use these terms).
- Pre-existing untracked junk not related to this work: `0001registrossynclogs.patch`, `registrossynclogs.diff`, `.planning/GRID-STATS-FILTERS-HANDOFF.md` (a different feature's handoff). Leave them alone.
