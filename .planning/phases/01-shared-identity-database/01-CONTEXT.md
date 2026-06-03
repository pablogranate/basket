# Phase 1: Shared Identity Database - Context

**Gathered:** 2026-06-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Stand up the central `basket_auth` Postgres identity store and a working Drizzle/postgres-js connection that portal (and later analytics) can target. Deliverables:

1. A dedicated `basket_auth` PostgreSQL database, run as a Docker container, with Better Auth tables (`auth_user`/`auth_session`/`auth_account`/`auth_verification`) created via Drizzle-generated SQL migrations.
2. A Drizzle/postgres-js client connecting via a dedicated `AUTH_DATABASE_URL`, fully separate from any Supabase connection.
3. The auth schema + migrations live in a path isolated from any domain-table Drizzle config, so auth migrations never touch domain data.

**This phase is infrastructure only.** No Better Auth `auth.ts` instance, no login methods, no route handler, no app wiring — that is Phase 3. This phase produces the schema, the DB, and the connection.

</domain>

<decisions>
## Implementation Decisions

### DB Placement & Hosting
- **D-01:** Dedicated `basket_auth` database (NOT a shared schema in analytics' Postgres). Clean ownership, no name collisions, separate backup/blast radius.
- **D-02:** The `basket_auth` Postgres runs **as a Docker container** — both local dev and the production instance on the company server. Rationale (user): it only stores users/sessions; a dedicated Postgres container is the simplest operationally.
- **D-03:** Add a `docker-compose.yml` (or service) to **this repo** defining the `basket_auth` Postgres container. Same compose runs on the company server for production; the container there is the real shared auth DB.
- **D-04:** Connection is via a dedicated `AUTH_DATABASE_URL` env var, separate from any `NEXT_PUBLIC_SUPABASE_*` / `SUPABASE_SERVICE_ROLE_KEY`. Surface it through the existing `appEnv` accessor in `src/lib/env.ts` with its own assert guard, matching the established env pattern.

### Table Naming (shared canonical names)
- **D-05:** All four tables use the `auth_` prefix: `auth_user`, `auth_session`, `auth_account`, `auth_verification`. These are the **canonical shared names** for the whole identity store — Phase 6 repoints analytics into these exact tables.
- **D-06:** Better Auth's default logical names (`user`/`session`/`account`/`verification`) are mapped to the prefixed physical tables via Better Auth schema config (`schema: { user: authUser, session: authSession, account: authAccount, verification: authVerification }`) — the analytics pattern. In Phase 1 only the Drizzle `pgTable` defs + migration need to exist; the mapping is consumed when the Better Auth instance is wired in Phase 3.

### Schema Scope (avoid re-migrating the shared store)
- **D-07:** Bake plugin-augmented columns into the Phase 1 schema up front, so the shared store does not need a second migration when Phase 3 adds login methods:
  - **`admin` plugin** → on `auth_user`: `role`, `banned`, `ban_reason`, `ban_expires`; on `auth_session`: `impersonated_by`.
  - **`magicLink` plugin** → reuses `auth_verification`; **no new table or column**.
- **D-08:** Generated column set must be verified against Better Auth `^1.6.x` admin-plugin schema during research/planning (exact column names/types come from Better Auth, not invented here).

### Migration Tooling & Isolation
- **D-09:** Use **`drizzle-kit generate`** to emit committed **SQL migration files**. Do NOT use `drizzle-kit push` and do NOT use Better Auth CLI `migrate` — both need a live DB connection from the dev machine, which is not the deploy model.
- **D-10:** Deploy model: SQL migration files are committed to this repo → user pulls the repo on the company server → runs the SQL against the `basket_auth` container. No remote migration execution from dev.
- **D-11:** Auth Drizzle config + schema + migrations live in an **auth-only path isolated from `supabase/migrations/`** — proposed `drizzle/auth/` for SQL output with its own `drizzle.config.ts` (e.g. `drizzle.auth.config.ts`) pointing `schema → src/lib/auth/schema.ts` and `out → drizzle/auth/`. Exact paths confirmable in planning; isolation from domain config is the hard requirement.

### Claude's Discretion
- Exact file/dir names (`drizzle/auth/` vs alternative), `drizzle.config` filename, docker-compose service naming, and postgres-js client options (research recommends `prepare: false`) — planner/executor decide within the constraints above.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Auth milestone research (read first — HIGH confidence)
- `.planning/research/SUMMARY.md` — overall shape; "Auth DB placement" + open questions; confirms dedicated `basket_auth` DB recommendation.
- `.planning/research/STACK.md` — concrete build guidance: file layout (`src/lib/auth/schema.ts`, `src/lib/db/auth-client.ts`, auth-only `drizzle.config.ts`), dependency versions (`better-auth ^1.6.11`, `drizzle-kit ^0.31.1`, `postgres ^3.4.5`), DB-placement comparison table, postgres-js `prepare: false`.
- `.planning/research/PITFALLS.md` — what breaks; relevant here: two-independent-connections rule (auth client never shares with Supabase).

### Roadmap & requirements
- `.planning/ROADMAP.md` § "Phase 1: Shared Identity Database" — goal + 3 success criteria.
- `.planning/REQUIREMENTS.md` — AUTH-01 (the requirement this phase satisfies).
- `.planning/PROJECT.md` § Constraints + Key Decisions — auth DB on company-server Postgres, identity-global/authz-per-app.

### Reference implementation (external repo)
- `../data-bp` (analytics app) — Better Auth + Drizzle reference: table naming (`auth_*`), `src/shared/db/client.ts` connection pattern. May not be accessible from this repo's working tree; research already distilled the relevant patterns into STACK.md.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/env.ts` (`appEnv` object + `assertSupabaseEnv()`/`assertServiceRoleKey()` pattern): extend with `AUTH_DATABASE_URL` + an assert guard following the same shape.
- Naming/style conventions: kebab-case files, `type` over `interface`, `import type`, `@/*` alias, double quotes — apply to new `src/lib/auth/schema.ts` and `src/lib/db/auth-client.ts`.

### Established Patterns
- Per-context client modules under `src/lib/supabase/*` (server/browser/admin/middleware). New auth DB client mirrors this: a dedicated module (`src/lib/db/auth-client.ts`) for the postgres-js/Drizzle connection, kept fully separate.
- Service-role isolation precedent: `src/lib/supabase/admin.ts` uses `import "server-only"`. The auth DB client is server-only too — must never reach client bundles.
- Migrations precedent: `supabase/migrations/*.sql` are hand/managed SQL applied manually. Auth SQL migrations follow a similar "commit SQL, apply manually" model but in an isolated `drizzle/auth/` path — never mixed with `supabase/migrations/`.

### Integration Points
- New: `docker-compose.yml` (basket_auth Postgres container).
- New: `AUTH_DATABASE_URL` in `.env.local` / host env + `src/lib/env.ts`.
- New: `src/lib/auth/schema.ts` (Drizzle pgTable defs), `src/lib/db/auth-client.ts` (postgres-js → Drizzle), auth-only `drizzle.config.ts`, `drizzle/auth/` SQL output.
- No change to Supabase clients or domain code this phase.

</code_context>

<specifics>
## Specific Ideas

- "It only stores users — a Postgres Docker container is the simplest." → keep the auth store deliberately minimal and self-contained; don't over-engineer hosting.
- Naming must match analytics (`auth_*`) so Phase 6 repoint is a row migration, not a rename.
- Schema should be "final" for the shared store after this phase — plugin columns included now precisely to avoid touching the shared identity tables again in Phase 3.

</specifics>

<deferred>
## Deferred Ideas

- Better Auth instance, login methods (Google + magicLink/email-password), route handler, middleware — **Phase 3**.
- Cross-subdomain cookie/secret/`trustedOrigins` config — **Phase 6** (AUTH-02/03).
- Analytics repoint + row migration into the shared `auth_*` tables — **Phase 6**.
- `profiles.auth_user_id` link column + dropping Supabase FK/trigger — **Phase 4**.

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 1-shared-identity-database*
*Context gathered: 2026-06-03*
