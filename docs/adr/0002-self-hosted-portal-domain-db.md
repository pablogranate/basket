# Portal domain data moves to a self-hosted Postgres on the prod server

Portal's domain database (matches, people, teams, grid, reports) leaves Supabase cloud (`aws-sa-east-1`, São Paulo) for a dedicated `postgres:17` container on the prod server (NYC), reachable only from `127.0.0.1`. The app drops supabase-js entirely and talks to the database with Drizzle over the `postgres` driver — the same stack Better Auth already uses.

Measured motivation: the server sits ~125 ms from the Supabase pooler, and a single authed supabase-js query costs 160–450 ms through the Cloudflare/Kong/PostgREST stack. Pages pay 2–3 serial query waves and server actions 3–5 sequential round trips, so users see 0.4–1 s of pure DB wait. Locally that becomes 1–5 ms per query. Supabase contributed nothing else: no Supabase Auth (Better Auth owns identity), no Storage, Realtime, RPC, or Edge Functions, and RLS was a deny-all guard always bypassed by the service-role client.

## Decisions and rejected alternatives

- **Big-bang Drizzle rewrite of all ~118 supabase-js call sites**, one PR, one cutover deploy. Rejected: a PostgREST shim (zero code change, but PostgREST + self-signed JWTs become permanent infra) and an incremental port against Supabase's raw Postgres (safer per-PR, but two migrations and weeks of unchanged latency).
- **Separate container (`basket-portal-db`), not a database inside `basket-auth-db`.** The auth instance already gates login for portal *and* the generator (nginx `auth_request`), with analytics/incidencias slated to join; portal's domain schema churns weekly. High-churn domain data does not share an instance whose uptime is every sibling's login.
- **RLS and all policies dropped at restore.** Authorization lives fully in the app layer (`requireEditor` / `requireUserContext`); with a single trusted owner connection there is no anon path left to guard.
- **Schema source of truth becomes `src/lib/db/schema.ts` + drizzle-kit**, mirroring the auth setup. `supabase/migrations/` is frozen history. Types come from Drizzle inference, replacing the generated `database.types.ts`.
- Extensions carried over: `pgcrypto`, `pg_trgm`, `uuid-ossp`. Nothing else in the DB was app-level — no functions, no triggers.

## Consequences

- Portal is the sole reader/writer of the domain DB (verified: n8n, analytics, incidencias and the other server apps never touch the Supabase project). Cutover freeze is just `pm2 stop`; rollback during the window is zero-data-loss because Supabase stays frozen-current.
- Backups become our problem. Nightly `pg_dump` of both `basket_portal` and `basket_auth` with a weekly restore-test, local-only at first — until the planned offsite (Google Drive via rclone) lands, a dead disk loses DB and backups together.
- Dev machines can no longer reach the prod DB: local dev runs its own container refreshed by `ssh prod pg_dump | psql local`. The develop-against-prod-data habit ends deliberately.
- Verification for the big-bang: read-parity harness (old vs new loaders diffed against the same DB), manual smoke checklist per section, and a permanent vitest integration suite for the data layer (the repo's first test infrastructure).
- `tools/import/*.mjs` get ported from supabase-js to the `postgres` client.
- The Supabase project stays untouched for ~30 days post-cutover as a rollback snapshot, then final dump → archive → project deleted, `SUPABASE*` env vars and `@supabase/*` deps stripped.
