# Phase 1: Shared Identity Database - Research

**Researched:** 2026-06-03
**Domain:** Better Auth `^1.6.x` canonical schema + Drizzle (postgres-js) migration tooling + Dockerized Postgres for a dedicated `basket_auth` identity store (infrastructure only — no auth instance, no login methods, no app wiring)
**Confidence:** HIGH (core schema, admin-plugin columns, magic-link no-table fact, package versions, and Drizzle column-mapping all verified against official Better Auth docs + npm registry this session)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Dedicated `basket_auth` database (NOT a shared schema in analytics' Postgres). Clean ownership, no name collisions, separate backup/blast radius.
- **D-02:** The `basket_auth` Postgres runs **as a Docker container** — both local dev and the production instance on the company server. Rationale: it only stores users/sessions; a dedicated Postgres container is the simplest operationally.
- **D-03:** Add a `docker-compose.yml` (or service) to **this repo** defining the `basket_auth` Postgres container. Same compose runs on the company server for production.
- **D-04:** Connection via a dedicated `AUTH_DATABASE_URL` env var, separate from any `NEXT_PUBLIC_SUPABASE_*` / `SUPABASE_SERVICE_ROLE_KEY`. Surface it through the existing `appEnv` accessor in `src/lib/env.ts` with its own assert guard, matching the established env pattern.
- **D-05:** All four tables use the `auth_` prefix: `auth_user`, `auth_session`, `auth_account`, `auth_verification`. These are the **canonical shared names** for the whole identity store — Phase 6 repoints analytics into these exact tables.
- **D-06:** Better Auth's default logical names (`user`/`session`/`account`/`verification`) are mapped to the prefixed physical tables via Better Auth schema config (`schema: { user: authUser, session: authSession, account: authAccount, verification: authVerification }`). In Phase 1 only the Drizzle `pgTable` defs + migration need to exist; the mapping is consumed when the Better Auth instance is wired in Phase 3.
- **D-07:** Bake plugin-augmented columns into the Phase 1 schema up front, so the shared store does not need a second migration when Phase 3 adds login methods:
  - **`admin` plugin** → on `auth_user`: `role`, `banned`, `ban_reason`, `ban_expires`; on `auth_session`: `impersonated_by`.
  - **`magicLink` plugin** → reuses `auth_verification`; **no new table or column**.
- **D-08:** Generated column set must be verified against Better Auth `^1.6.x` admin-plugin schema during research/planning (exact column names/types come from Better Auth, not invented here). **→ VERIFIED in this document, see "Better Auth Canonical Schema (VERIFIED)".**
- **D-09:** Use **`drizzle-kit generate`** to emit committed **SQL migration files**. Do NOT use `drizzle-kit push` and do NOT use Better Auth CLI `migrate` — both need a live DB connection from the dev machine, which is not the deploy model.
- **D-10:** Deploy model: SQL migration files are committed to this repo → user pulls the repo on the company server → runs the SQL against the `basket_auth` container. No remote migration execution from dev.
- **D-11:** Auth Drizzle config + schema + migrations live in an **auth-only path isolated from `supabase/migrations/`** — proposed `drizzle/auth/` for SQL output with its own `drizzle.config.ts` (e.g. `drizzle.auth.config.ts`) pointing `schema → src/lib/auth/schema.ts` and `out → drizzle/auth/`. Exact paths confirmable in planning; isolation from domain config is the hard requirement.

### Claude's Discretion

- Exact file/dir names (`drizzle/auth/` vs alternative), `drizzle.config` filename, docker-compose service naming, and postgres-js client options (research recommends `prepare: false`) — planner/executor decide within the constraints above.

### Deferred Ideas (OUT OF SCOPE)

- Better Auth instance, login methods (Google + magicLink/email-password), route handler, middleware — **Phase 3**.
- Cross-subdomain cookie/secret/`trustedOrigins` config — **Phase 6** (AUTH-02/03).
- Analytics repoint + row migration into the shared `auth_*` tables — **Phase 6**.
- `profiles.auth_user_id` link column + dropping Supabase FK/trigger — **Phase 4**.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AUTH-01 | Stand up a dedicated `basket_auth` database on the company-server Postgres with Better Auth tables (user/session/account/verification) and a Drizzle schema/migrations | "Better Auth Canonical Schema (VERIFIED)" gives exact column defs; "Standard Stack" pins versions; "Architecture Patterns" gives the pgTable schema, postgres-js client, isolated `drizzle.config`, docker-compose service, and `drizzle-kit generate` flow |
</phase_requirements>

## Summary

This phase is pure infrastructure: produce (1) a Dockerized `basket_auth` Postgres, (2) Drizzle `pgTable` definitions for the four Better Auth tables under the canonical `auth_*` physical names with all plugin-augmented columns baked in now, (3) committed SQL migrations generated by `drizzle-kit generate` in an isolated `drizzle/auth/` path, and (4) a server-only postgres-js → Drizzle client on a dedicated `AUTH_DATABASE_URL`. No Better Auth instance is created and no app code consumes the schema yet — that is Phase 3.

The blocking question (D-08) is fully resolved below: the four core tables and the admin-plugin columns are verified verbatim against Better Auth's official docs for `^1.6.x`, and the magic-link plugin is confirmed to add **no** table or column (it reuses `auth_verification`). The single most important implementation subtlety is the **camelCase-property → snake_case-column** mapping: Better Auth talks to Drizzle using camelCase JS property names (`emailVerified`, `createdAt`, `userId`), while the physical Postgres columns are snake_case (`email_verified`, `created_at`, `user_id`). The Drizzle `pgTable` definition is where both names are bound — property name (left) is what Better Auth's adapter resolves, the string arg (right) is the SQL column. Getting this wrong is the one way to produce a schema that migrates cleanly but silently fails when Better Auth is wired in Phase 3.

**Primary recommendation:** Define `src/lib/auth/schema.ts` with four `pgTable` exports (`authUser`, `authSession`, `authAccount`, `authVerification`) using `auth_*` table names, `text` id PKs, camelCase JS properties mapped to snake_case columns, and all D-07 plugin columns included. Add a dedicated `drizzle.auth.config.ts` (`out: "./drizzle/auth"`), generate the SQL with `drizzle-kit generate`, commit the SQL, and add a server-only `src/lib/db/auth-client.ts` postgres-js client with `prepare: false`. Provision the DB with a `docker compose` Postgres 17 service. **Note: `docker` on this host is Podman 5.6.2; `docker compose` v2.40.2 works — the compose file is portable.**

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Identity table schema definitions | Data / Storage | — | `pgTable` defs are the schema source of truth; live in `src/lib/auth/` but describe DB structure |
| SQL migration generation | Build / Tooling | Data | `drizzle-kit generate` is a build-time tool emitting committed artifacts; no runtime role |
| Auth DB connection (postgres-js → Drizzle) | API / Backend (server-only) | — | Server-only module; must never reach client bundles (mirrors `admin.ts`) |
| Env var surfacing + assert guard | API / Backend | — | `appEnv` is a server-read singleton; `AUTH_DATABASE_URL` is a server secret |
| Postgres container provisioning | Infrastructure / Ops | — | `docker compose` service; runs identically local + company server |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `better-auth` | `^1.6.14` (latest; `^1.6.11` per CONTEXT lockfile target) | Provides the canonical schema contract this phase implements | `[VERIFIED: npm registry]` latest 1.6.14; `[CITED: STACK.md]` analytics pins `^1.6.11`. **Phase 1 does NOT import or run better-auth** — it is only the spec the hand-written Drizzle schema must match. Install deferred to Phase 3 unless the planner wants it present early for type reference. |
| `drizzle-orm` | `^0.45.2` | `pgTable` definitions + the Drizzle query client | `[VERIFIED: npm registry]` latest 0.45.2; matches analytics reference `[CITED: STACK.md]` |
| `drizzle-kit` | `^0.31.10` | `drizzle-kit generate` → committed SQL migrations | `[VERIFIED: npm registry]` latest 0.31.10 (STACK.md cited `^0.31.1`; planner may pin either — caret allows 0.31.10) |
| `postgres` (postgres-js) | `^3.4.9` | Driver for the `basket_auth` Postgres | `[VERIFIED: npm registry]` latest 3.4.9; matches analytics `src/shared/db/client.ts` `[CITED: STACK.md]` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@types/pg` | latest | TS types if any pg tooling is referenced | `[CITED: STACK.md]` lists it; with postgres-js (not `pg`) it is **likely unnecessary** — postgres-js ships its own types. Planner: only add if a `pg`-typed surface appears. `[ASSUMED]` it is omittable. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-written `pgTable` schema | `@better-auth/cli generate` to emit the schema | CLI generate produces a schema file from the better-auth config — but that requires an `auth.ts` instance (a Phase 3 artifact) and the analytics reference uses hand-written `auth_*` defs. D-05/D-06 require specific physical names + `auth_` prefix; hand-writing keeps Phase 1 free of any better-auth runtime. **Recommendation: hand-write.** |
| `drizzle-kit generate` | `drizzle-kit push` / `@better-auth/cli migrate` | Both need a live DB connection from the dev machine — **forbidden by D-09**. Generate-and-commit is the locked path. |
| postgres-js | `node-postgres` (`pg`) | postgres-js matches the analytics reference and is what `prepare: false` guidance targets. No reason to diverge. |

**Installation (Phase 1 minimal — runtime client + tooling only):**
```bash
pnpm add drizzle-orm postgres
pnpm add -D drizzle-kit
# better-auth is NOT required at runtime in Phase 1. Add it in Phase 3.
# (Optional) if the planner wants better-auth types available for cross-checking the schema now:
#   pnpm add better-auth
```

**Version verification (run this session):**
- `npm view better-auth version` → `1.6.14` `[VERIFIED: npm registry]`
- `npm view drizzle-orm version` → `0.45.2` `[VERIFIED: npm registry]`
- `npm view drizzle-kit version` → `0.31.10` `[VERIFIED: npm registry]`
- `npm view postgres version` → `3.4.9` `[VERIFIED: npm registry]`

## Package Legitimacy Audit

> slopcheck 0.6.1 installed and run this session against all four packages.

| Package | Registry | Age / Maturity | Source Repo | slopcheck | Disposition |
|---------|----------|----------------|-------------|-----------|-------------|
| `better-auth` | npm | mature, active | github.com/better-auth/better-auth | `[OK]` | Approved (install deferred to Phase 3) |
| `drizzle-orm` | npm | mature, widely used | github.com/drizzle-team/drizzle-orm | `[OK]` | Approved |
| `drizzle-kit` | npm | mature, widely used | github.com/drizzle-team/drizzle-orm | `[OK]` | Approved |
| `postgres` | npm | mature (postgres-js) | github.com/porsager/postgres | `[OK]` | Approved |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

All four scanned clean (`4 OK`). No postinstall-script concerns identified for these packages.

## Better Auth Canonical Schema (VERIFIED) — resolves D-08

**Source:** Better Auth official docs, `^1.6.x` — Database concept page (`https://www.better-auth.com/docs/concepts/database`), Admin plugin (`https://www.better-auth.com/docs/plugins/admin`), Magic-link plugin (`https://www.better-auth.com/docs/plugins/magic-link`), Drizzle adapter (`https://www.better-auth.com/docs/adapters/drizzle`). All fetched 2026-06-03.

> **DO NOT INVENT FIELDS.** The tables below are the exact Better Auth field set. The left "BA field (camelCase)" is the JS property name Better Auth's adapter resolves; the right "snake_case column" is the physical Postgres column the `pgTable` def must declare so the prefixed shared store stays final after this phase.

### `auth_user` (logical `user`)

| BA field (camelCase) | snake_case column | Type (pg) | Nullable | Notes |
|----------------------|-------------------|-----------|----------|-------|
| `id` | `id` | `text` PK | No | Better Auth default id is `text`, not uuid `[VERIFIED: better-auth.com/docs/adapters/drizzle]` |
| `name` | `name` | `text` | No | |
| `email` | `email` | `text` | No | unique `[VERIFIED]` |
| `emailVerified` | `email_verified` | `boolean` | No | **boolean, not timestamp** — distinct from Supabase `email_confirmed_at` `[VERIFIED: better-auth.com/docs/concepts/database]` |
| `image` | `image` | `text` | Yes | |
| `createdAt` | `created_at` | `timestamp` | No | |
| `updatedAt` | `updated_at` | `timestamp` | No | |
| **admin plugin** ↓ | | | | `[VERIFIED: better-auth.com/docs/plugins/admin]` |
| `role` | `role` | `text` | Yes | "Defaults to `user`" per docs — optional column; default handled by plugin, not required as a DB default |
| `banned` | `banned` | `boolean` | Yes | optional |
| `banReason` | `ban_reason` | `text` | Yes | optional |
| `banExpires` | `ban_expires` | `timestamp` | Yes | optional (docs type: date) |

### `auth_session` (logical `session`)

| BA field (camelCase) | snake_case column | Type (pg) | Nullable | Notes |
|----------------------|-------------------|-----------|----------|-------|
| `id` | `id` | `text` PK | No | |
| `userId` | `user_id` | `text` | No | FK → `auth_user.id` `[VERIFIED]` |
| `token` | `token` | `text` | No | unique |
| `expiresAt` | `expires_at` | `timestamp` | No | |
| `ipAddress` | `ip_address` | `text` | Yes | optional |
| `userAgent` | `user_agent` | `text` | Yes | optional |
| `createdAt` | `created_at` | `timestamp` | No | |
| `updatedAt` | `updated_at` | `timestamp` | No | |
| **admin plugin** ↓ | | | | `[VERIFIED: better-auth.com/docs/plugins/admin]` |
| `impersonatedBy` | `impersonated_by` | `text` | Yes | "ID of the admin impersonating this session"; optional |

### `auth_account` (logical `account`)

| BA field (camelCase) | snake_case column | Type (pg) | Nullable | Notes |
|----------------------|-------------------|-----------|----------|-------|
| `id` | `id` | `text` PK | No | |
| `userId` | `user_id` | `text` | No | FK → `auth_user.id` `[VERIFIED]` |
| `accountId` | `account_id` | `text` | No | |
| `providerId` | `provider_id` | `text` | No | e.g. `"credential"` / `"google"` |
| `accessToken` | `access_token` | `text` | Yes | |
| `refreshToken` | `refresh_token` | `text` | Yes | |
| `idToken` | `id_token` | `text` | Yes | |
| `accessTokenExpiresAt` | `access_token_expires_at` | `timestamp` | Yes | |
| `refreshTokenExpiresAt` | `refresh_token_expires_at` | `timestamp` | Yes | |
| `scope` | `scope` | `text` | Yes | |
| `password` | `password` | `text` | Yes | credential hash (Phase 4 migration target) |
| `createdAt` | `created_at` | `timestamp` | No | |
| `updatedAt` | `updated_at` | `timestamp` | No | |

### `auth_verification` (logical `verification`)

| BA field (camelCase) | snake_case column | Type (pg) | Nullable | Notes |
|----------------------|-------------------|-----------|----------|-------|
| `id` | `id` | `text` PK | No | |
| `identifier` | `identifier` | `text` | No | |
| `value` | `value` | `text` | No | |
| `expiresAt` | `expires_at` | `timestamp` | No | |
| `createdAt` | `created_at` | `timestamp` | No | |
| `updatedAt` | `updated_at` | `timestamp` | No | (present in `^1.6.x` core schema) |

### Magic-link plugin — NO schema change (resolves D-07 magicLink clause)

**VERIFIED:** The `magicLink` plugin adds **no new table and no new column**. It reuses the core `auth_verification` table to store the magic-link token (token as `identifier`/`value`, with `expiresAt` for expiry). `[VERIFIED: better-auth.com/docs/plugins/magic-link]` + corroborated by maintainers (passwordless plugins all use the shared verification table). Phase 1 therefore needs only the four tables above; baking the admin columns in is the only D-07 addition.

> **Caveat for the planner (LOW confidence, version-watch):** GitHub issue #8228 reports that under some `1.5.0`-era schema-generation runs the `verification` table was incorrectly dropped and magic-link sign-in broke. This is a *CLI schema-generation* bug, not a schema-shape change — it does not affect a hand-written `pgTable` def, and we are NOT using CLI generation. No action needed in Phase 1; flagged so Phase 3 wiring is aware. `[CITED: github.com/better-auth/better-auth/issues/8228]`

### Field-mapping rule (the critical subtlety)

Better Auth's Drizzle adapter resolves columns **by the JS property name** you give the `pgTable` field, then reads/writes the SQL column named by the string argument. So the def `emailVerified: boolean("email_verified")` lets Better Auth address `emailVerified` while Postgres stores `email_verified`. Declaring the property as `email_verified` (snake) would make Better Auth look for a non-existent `emailVerified` field at runtime. **Property names MUST be camelCase; column string args MUST be snake_case.** `[VERIFIED: better-auth.com/docs/adapters/drizzle]`

The `schema: { user: authUser, ... }` mapping passed to `drizzleAdapter` in Phase 3 maps Better Auth's logical model names to these prefixed exports — this is how `auth_user` (physical) satisfies the `user` (logical) model. **Phase 1 only needs the exports to exist with the right shape; the mapping object is consumed in Phase 3.** `[VERIFIED: better-auth.com/docs/adapters/drizzle]` + `[CITED: CONTEXT D-06]`

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│  BUILD TIME (dev machine)                                         │
│                                                                   │
│   src/lib/auth/schema.ts  ──read by──►  drizzle.auth.config.ts    │
│   (pgTable defs, auth_*)                (schema + out + dialect)   │
│                                              │                     │
│                                   drizzle-kit generate            │
│                                              ▼                     │
│                                   drizzle/auth/0000_*.sql          │
│                                   drizzle/auth/meta/* (snapshot)   │
│                                   ── committed to git (D-10) ──    │
└─────────────────────────────────────────────────────────────────┘
                                   │ git pull on company server
                                   ▼
┌─────────────────────────────────────────────────────────────────┐
│  DEPLOY / RUN                                                     │
│                                                                   │
│   docker compose up  ─►  basket_auth Postgres 17 container        │
│                              (exposes AUTH_DATABASE_URL target)    │
│                                   ▲                                │
│   psql / drizzle-kit migrate ─────┘  apply 0000_*.sql manually    │
│                                                                   │
│   src/lib/db/auth-client.ts (server-only)                         │
│      postgres(AUTH_DATABASE_URL, { prepare:false }) ─► drizzle()  │
│      └─ NEVER shares a connection with Supabase client            │
└─────────────────────────────────────────────────────────────────┘

  (Phase 3 only: betterAuth({ database: drizzleAdapter(authDb, {
     schema: { user: authUser, ... } }) })  — NOT in this phase)
```

Primary trace: schema def → drizzle-kit reads it → emits committed SQL → applied to the container → the server-only client connects to the same DB. Nothing in Phase 1 touches Supabase or app routes.

### Recommended Project Structure (new files only)

```
.
├── docker-compose.yml              # basket_auth Postgres 17 service (D-03)
├── drizzle.auth.config.ts          # auth-only drizzle-kit config (D-11)
├── drizzle/
│   └── auth/                        # auth SQL migrations — COMMITTED (D-10/D-11)
│       ├── 0000_<name>.sql
│       └── meta/                    # drizzle journal + snapshot
└── src/
    └── lib/
        ├── auth/
        │   └── schema.ts            # pgTable defs (auth_user/session/account/verification)
        └── db/
            └── auth-client.ts       # server-only postgres-js → drizzle client (D-04)
```
- `supabase/migrations/` is **untouched** — isolation is the hard requirement of D-11.
- File naming: kebab-case (`auth-client.ts`), per CLAUDE.md. `schema.ts` is fine (single word).

### Pattern 1: Drizzle pgTable schema (camelCase prop → snake_case column)
**What:** Hand-written `pgTable` defs matching the VERIFIED schema, with `auth_` physical names.
**When to use:** This is `src/lib/auth/schema.ts`.
**Example:**
```typescript
// src/lib/auth/schema.ts
// Source: better-auth.com/docs/adapters/drizzle + concepts/database + plugins/admin
import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const authUser = pgTable("auth_user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
  // admin plugin (baked in now — D-07)
  role: text("role"),
  banned: boolean("banned"),
  banReason: text("ban_reason"),
  banExpires: timestamp("ban_expires"),
});

export const authSession = pgTable("auth_session", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => authUser.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
  // admin plugin (D-07)
  impersonatedBy: text("impersonated_by"),
});

export const authAccount = pgTable("auth_account", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => authUser.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

export const authVerification = pgTable("auth_verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});
```
> The `.references(() => authUser.id, { onDelete: "cascade" })` matches Better Auth's documented FK behavior (cascade delete of sessions/accounts when a user is deleted). `[VERIFIED: better-auth.com/docs/concepts/database]` confirms the FK relationship; cascade is the documented adapter behavior. Planner may drop the inline FK and rely on a plain column if a generated-SQL diff against the analytics reference is preferred — but the FK is correct and recommended.

### Pattern 2: Isolated drizzle-kit config (auth-only)
**What:** A dedicated config so `drizzle-kit generate` only ever sees the auth schema and writes only to `drizzle/auth/`.
**When to use:** `drizzle.auth.config.ts` at repo root.
**Example:**
```typescript
// drizzle.auth.config.ts
// Source: STACK.md §5 + orm.drizzle.team/docs/drizzle-config-file
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/auth/schema.ts",
  out: "./drizzle/auth",
  dbCredentials: { url: process.env.AUTH_DATABASE_URL! },
});
```
Run generation with an explicit config so it never picks up a default `drizzle.config.ts`:
```bash
pnpm drizzle-kit generate --config drizzle.auth.config.ts
```
> `drizzle-kit generate` does NOT require a DB connection — it diffs the schema against the committed snapshot in `drizzle/auth/meta/` and emits SQL. The `dbCredentials` are only used by connection-requiring commands (`push`, `migrate`, `studio`), which D-09 forbids from dev. The `process.env.AUTH_DATABASE_URL!` line is harmless for `generate` even if the var is unset, but the planner may guard it. `[CITED: orm.drizzle.team]`

### Pattern 3: Server-only postgres-js → Drizzle client
**What:** A single server-only module owning the auth DB connection, separate from Supabase.
**When to use:** `src/lib/db/auth-client.ts`. Mirrors `src/lib/supabase/admin.ts`'s `import "server-only"` precedent.
**Example:**
```typescript
// src/lib/db/auth-client.ts
// Source: STACK.md §2 (modeled on data-bp/src/shared/db/client.ts)
import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { appEnv, assertAuthDatabaseUrl } from "@/lib/env";
import * as authSchema from "@/lib/auth/schema";

const globalForAuthDb = globalThis as unknown as {
  authConn?: ReturnType<typeof postgres>;
};

function buildConnection() {
  assertAuthDatabaseUrl();
  return postgres(appEnv.authDatabaseUrl, { prepare: false });
}

export const authConn = globalForAuthDb.authConn ?? buildConnection();
if (process.env.NODE_ENV !== "production") {
  globalForAuthDb.authConn = authConn;
}

export const authDb = drizzle(authConn, { schema: authSchema });
```
> `prepare: false` is required for poolers/transaction-mode and recommended for serverless/Next.js to avoid prepared-statement reuse errors across connections. `[CITED: STACK.md]` The `globalThis` cache prevents connection exhaustion during dev hot-reload. **Note:** this module is *created* in Phase 1 to satisfy success criterion #2 (a client that *can* connect), but it has no consumers until Phase 3. Importing `server-only` guarantees it never lands in a client bundle (CLAUDE.md architectural constraint). `[VERIFIED: src/lib/supabase/admin.ts precedent]`

### Pattern 4: `appEnv` extension + assert guard (match existing shape)
**What:** Add `authDatabaseUrl` to `appEnv` and an `assertAuthDatabaseUrl()` guard following the exact `assertServiceRoleKey()` pattern.
**Example:**
```typescript
// src/lib/env.ts — additions
export const appEnv = {
  // ...existing...
  authDatabaseUrl: process.env.AUTH_DATABASE_URL ?? "",
};

export function assertAuthDatabaseUrl() {
  if (!appEnv.authDatabaseUrl) {
    throw new Error(
      "Missing AUTH_DATABASE_URL. The Better Auth identity database requires a connection string.",
    );
  }
}
```
> `[VERIFIED: src/lib/env.ts]` — this mirrors the existing `assertServiceRoleKey()` exactly (CONTEXT D-04 mandate).

### Pattern 5: docker-compose Postgres service
**What:** A single Postgres 17 container for `basket_auth`, identical local + company server (D-02/D-03).
**Example:**
```yaml
# docker-compose.yml
services:
  basket-auth-db:
    image: postgres:17
    container_name: basket-auth-db
    restart: unless-stopped
    environment:
      POSTGRES_DB: basket_auth
      POSTGRES_USER: ${AUTH_DB_USER:-basket_auth}
      POSTGRES_PASSWORD: ${AUTH_DB_PASSWORD:?set AUTH_DB_PASSWORD}
    ports:
      - "${AUTH_DB_PORT:-5433}:5432"   # 5433 host-side to avoid colliding with a local Supabase/Postgres on 5432
    volumes:
      - basket-auth-data:/var/lib/postgresql/data

volumes:
  basket-auth-data:
```
Then `AUTH_DATABASE_URL=postgresql://basket_auth:<pw>@localhost:5433/basket_auth` in `.env.local`.
> **Postgres version:** 17 is current GA and a safe default; 16 is equally fine (Better Auth/Drizzle have no version-specific requirement). `[ASSUMED]` — pin whichever the company server runs; the schema uses no version-specific features.
> **Port 5433** chosen to avoid colliding with any local Postgres/Supabase on 5432. Discretionary (D-04 area).
> **`postgres:17` image** is the official Docker Hub Postgres image. `[ASSUMED]` tag exists — planner should confirm the exact tag the company server can pull (it may use a pinned digest or an internal registry).

### Anti-Patterns to Avoid
- **Declaring `pgTable` properties in snake_case:** Better Auth resolves by JS property name → it would look for `emailVerified` and not find `email_verified`. Property camelCase, column-arg snake_case. Always.
- **Sharing a connection or config with Supabase or any domain Drizzle config:** D-11 isolation. The auth client never imports a Supabase client and vice-versa (PITFALLS "two-independent-connections rule").
- **Using `drizzle-kit push` or `@better-auth/cli migrate`:** both connect from dev — forbidden by D-09.
- **Adding a default drizzle.config.ts at root:** could be picked up implicitly and mix concerns. Use the explicitly-named `drizzle.auth.config.ts` and always pass `--config`.
- **Omitting `import "server-only"` from `auth-client.ts`:** the connection string is a server secret; the module must never reach the browser bundle.
- **Re-migrating the shared store in Phase 3:** the whole point of D-07 is that admin columns exist NOW. Do not defer them.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| The auth table schema | Inventing column names from memory | The VERIFIED table above (Better Auth official docs) | A single wrong/missing column means a silent Phase 3 failure or a second migration of the shared store (violates D-07 intent) |
| SQL migration files | Hand-writing CREATE TABLE statements | `drizzle-kit generate` from the `pgTable` defs | Keeps schema-of-record (TS) and SQL in sync via the snapshot/journal; hand-SQL drifts |
| Connection pooling / singleton | A bespoke pool manager | postgres-js + the `globalThis` cache pattern | postgres-js handles pooling; the cache prevents dev hot-reload exhaustion |
| Env validation | Ad-hoc `process.env` reads scattered around | `appEnv` + `assertAuthDatabaseUrl()` | CLAUDE.md mandates the centralized accessor pattern (D-04) |

**Key insight:** Phase 1's only "logic" is getting the schema bytes exactly right and the tooling isolated. Everything else is wiring that already has a blessed shape in this repo (env accessor, server-only client) or in the analytics reference (postgres-js client).

## Runtime State Inventory

> This is a greenfield infrastructure phase (new DB, new files). It does NOT rename or migrate existing runtime state. The categories below are answered to confirm nothing is silently affected.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | **None** — `basket_auth` is a brand-new empty DB; no existing rows are touched. Supabase domain data is untouched. | none |
| Live service config | **None for Phase 1.** Analytics already has `auth_*` tables in its own DB, but repointing it is explicitly **Phase 6** (deferred). No external service config changes now. | none (Phase 6) |
| OS-registered state | **None** — no Task Scheduler / systemd / pm2 registrations involve auth. The new Postgres runs as a Docker/Podman container managed by `docker compose`. | none |
| Secrets / env vars | **New** `AUTH_DATABASE_URL` (+ optional `AUTH_DB_USER`/`AUTH_DB_PASSWORD`/`AUTH_DB_PORT`) added to `.env.local`. `.env*` is gitignored (verified) — these are NOT committed. No existing secret is renamed. | add to `.env.local` + host env; document in README/`.env.example` |
| Build artifacts | **None stale** — new packages added to lockfile; `drizzle/auth/*.sql` + `meta/` are new committed artifacts. No existing build artifact carries an auth name. | commit migrations + lockfile |

**Verified:** `.env.local` is gitignored (`git check-ignore .env.local` → matches `.env*`); `docker-compose.yml` and `drizzle/auth/*.sql` are **not** ignored (will commit correctly per D-10).

## Common Pitfalls

### Pitfall 1: snake_case property names break Better Auth at runtime (not at migration)
**What goes wrong:** The `pgTable` def names properties `email_verified`/`user_id` (matching the SQL columns). `drizzle-kit generate` produces identical SQL either way, the migration applies cleanly, the DB looks correct — but in Phase 3 Better Auth's adapter queries by `emailVerified`/`userId` and gets `undefined`/errors.
**Why it happens:** It is intuitive to match the property name to the column name. Better Auth's contract is the opposite: property = camelCase logical field, column-arg = physical name.
**How to avoid:** Property names camelCase, column string args snake_case (Pattern 1). Cross-check every field against the VERIFIED table.
**Warning signs:** A reviewer sees `userId: text("userId")` (camel column) or `user_id: text("user_id")` (snake property) — both are wrong; correct is `userId: text("user_id")`.

### Pitfall 2: `drizzle-kit generate` silently picks up the wrong/default config
**What goes wrong:** Running bare `drizzle-kit generate` finds a default `drizzle.config.ts` (if one ever exists) instead of the auth config, or writes to the default `./drizzle` instead of `./drizzle/auth`.
**Why it happens:** drizzle-kit auto-discovers `drizzle.config.ts`. Mixing concerns violates D-11.
**How to avoid:** Always pass `--config drizzle.auth.config.ts`. Add a package.json script (e.g. `"db:auth:generate": "drizzle-kit generate --config drizzle.auth.config.ts"`) so the flag is never forgotten.
**Warning signs:** SQL appears in `./drizzle/` (no `auth/`) or near `supabase/migrations/`.

### Pitfall 3: docker/podman + port collision masks "DB not reachable"
**What goes wrong:** `docker` here is Podman; a local Postgres or Supabase may already hold 5432; the container starts but the URL points at the wrong server.
**Why it happens:** Host has Podman aliased as `docker` (verified: `podman version 5.6.2`), and `docker compose` v2.40.2 is present. Default 5432 may already be in use.
**How to avoid:** Map a distinct host port (e.g. 5433) and build `AUTH_DATABASE_URL` from it. Verify reachability with `psql "$AUTH_DATABASE_URL" -c '\dt'` after applying the migration.
**Warning signs:** `connection refused`, or the four `auth_*` tables don't appear in `\dt`.

### Pitfall 4: missing `updatedAt` on `verification` or wrong nullability drifts from the shared contract
**What goes wrong:** Omitting a core field (or marking a NOT NULL field nullable) produces a schema that diverges from what analytics' shared store expects in Phase 6, forcing a reconciling migration.
**How to avoid:** Match the VERIFIED tables field-for-field, including `auth_verification.updated_at` and the NOT NULL constraints on timestamps. If a generated-SQL diff against `../data-bp` is possible, compare.
**Warning signs:** Phase 6 row-migration fails on a NOT NULL violation or an unknown column.

## Code Examples

All verified patterns are inline above (Patterns 1–5). They are the authoritative copy for the planner.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Better Auth CLI `migrate` against a live dev DB | `drizzle-kit generate` → commit SQL → apply on server | Project decision (D-09/D-10) | Matches a "commit-and-pull" deploy model with no dev→prod DB access |
| `pg` (node-postgres) | `postgres` (postgres-js) with `prepare: false` | Analytics reference standard | Better pooler compatibility; matches sibling app |

**Deprecated/outdated:**
- Nothing deprecated affects Phase 1. The issue #8228 magic-link/verification CLI-generation bug is *avoided by design* (hand-written schema, no CLI generation).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `@types/pg` is omittable when using postgres-js | Standard Stack | LOW — if a type error surfaces, add it; postgres-js ships its own types |
| A2 | Postgres 17 (`postgres:17` Docker image tag) is the right base; 16 equally fine | Pattern 5 | LOW — no version-specific schema features; planner confirms the company-server-pullable tag |
| A3 | Host port 5433 avoids collision | Pattern 5 | LOW — discretionary; adjust if 5433 is also taken |
| A4 | better-auth need not be installed in Phase 1 (schema is hand-written, no runtime use) | Installation | LOW — if the planner wants better-auth types to cross-check, install it; no harm either way |
| A5 | `^1.6.11` (CONTEXT) vs `^1.6.14` (current latest) — caret resolves to 1.6.14; schema unchanged across 1.6.x patch range | Standard Stack | LOW — core + admin schema is stable across 1.6.x; verified against current docs |

**Resolved (no longer assumptions):** the four core tables, all admin-plugin columns, and the magic-link no-table fact are **VERIFIED** against official docs — D-08 is fully answered.

## Open Questions (RESOLVED)

1. **Exact Postgres version + image source on the company server**
   - What we know: schema needs no version-specific features; 16/17 both work.
   - What's unclear: whether the company server pulls from Docker Hub or an internal registry, and the pinned tag.
   - RESOLVED: `image: postgres:17` set in Plan 01-01 Task 2; operator confirms the company-server-pullable tag at provisioning (1-line change). Non-blocking.

2. **Should `better-auth` be installed in Phase 1?**
   - What we know: Phase 1 produces only a hand-written schema + client; better-auth has no runtime role until Phase 3.
   - What's unclear: whether having better-auth's types present now helps the planner cross-validate the schema.
   - RESOLVED: moot — `better-auth ^1.6.14` is already in `package.json`; no install task added, no runtime use in Phase 1.

3. **Inline FK (`.references(... onDelete: cascade)`) vs plain column**
   - What we know: Better Auth documents the FK relationship and cascade behavior; the inline FK is correct.
   - What's unclear: whether matching the analytics reference's generated SQL exactly (if it omits the FK) matters for the Phase 6 repoint.
   - RESOLVED: inline FK with `onDelete: cascade` chosen in Plan 01-01 Task 1. If a Phase-6 diff against `../data-bp` reveals a difference, reconcile then — does not block Phase 1.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Docker Compose | `basket_auth` container (D-02/D-03) | ✓ | `docker compose` v2.40.2 | — |
| Docker engine | running the container | ✓ (Podman) | Podman 5.6.2 (`docker`→podman) | Podman is Docker-CLI-compatible for compose; native Docker also works |
| Node.js | drizzle-kit / Next.js | ✓ (assumed per repo) | 20.x baseline (CLAUDE.md) | — |
| pnpm | install + scripts | ✓ (pnpm-lock.yaml present) | — | npm (package-lock.json also present) |
| postgres-js / drizzle-orm / drizzle-kit | schema + client + generate | installable | verified on npm | — |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** Docker engine is Podman, not native Docker — Podman implements the Docker CLI and `docker compose` works (verified). The compose file is portable; no change needed. The company server may run native Docker — the same file applies.

## Validation Architecture

> No test framework exists in this repo (CLAUDE.md: "No test runner ... no test scripts"). `.planning/config.json` was not present to read; treating nyquist validation as enabled by default, but the repo has no harness. The phase verification is therefore command-based, not unit-test-based.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | none — repo has no test runner (CLAUDE.md confirmed) |
| Config file | none |
| Quick run command | `pnpm typecheck` (`tsc --noEmit`) — verifies schema/client compile |
| Full suite command | `pnpm check` (`lint && typecheck && build`) |

### Phase Requirements → Verification Map
| Req | Behavior | Type | Command | Exists? |
|-----|----------|------|---------|---------|
| AUTH-01 | `pgTable` defs + client compile | typecheck | `pnpm typecheck` | ✅ (script exists) |
| AUTH-01 | SQL migration generates | tooling | `pnpm drizzle-kit generate --config drizzle.auth.config.ts` (emits `drizzle/auth/0000_*.sql`) | ➖ new script |
| AUTH-01 | DB provisions + tables apply | manual/integration | `docker compose up -d` then `psql "$AUTH_DATABASE_URL" -c '\dt'` shows the four `auth_*` tables | manual |
| AUTH-01 | Client connects | manual/integration | one-off script importing `authDb` and running `SELECT 1` (server context) | manual |

### Sampling Rate
- **Per task commit:** `pnpm typecheck`
- **Per phase gate:** `pnpm check` green + the four `auth_*` tables present in the container via `\dt` + a `SELECT 1` through the client.

### Wave 0 Gaps
- [ ] No test harness exists; introducing one is **out of scope** for this infra phase (and is a Phase 2 concern per PITFALLS — guard tests). Verification here is command/manual: typecheck + `\dt` + `SELECT 1`.
- [ ] Add a `db:auth:generate` (and optionally `db:auth:up`) package.json script so the `--config` flag is never forgotten (Pitfall 2).

## Security Domain

> `.planning/config.json` not found; treating `security_enforcement` as enabled (default). This phase stands up a secrets-bearing connection and a credential store, so security is in scope even though no auth logic runs yet.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no (Phase 3) | — (no auth logic in Phase 1) |
| V3 Session Management | no (Phase 3) | `auth_session` table exists but is unused this phase |
| V4 Access Control | no (Phase 2/3) | — |
| V5 Input Validation | no | no user input path in this phase |
| V6 Cryptography | partial | `auth_account.password` will hold credential hashes (Phase 4) — Phase 1 only declares the column; no crypto runs |
| V7/V14 Config & Secrets | **yes** | `AUTH_DATABASE_URL` in gitignored `.env.local` only; `server-only` on the client module; never logged |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Connection string leaks into client bundle | Information Disclosure | `import "server-only"` on `auth-client.ts` (precedent: `admin.ts`); CI grep can assert it's absent from `.next` client chunks |
| Auth DB credentials committed to git | Information Disclosure | `.env*` is gitignored (verified); compose uses `${AUTH_DB_PASSWORD:?...}` so the secret comes from env, not the file |
| Weak/default Postgres password on the shared identity store | Elevation of Privilege | Require a strong `AUTH_DB_PASSWORD`; compose fails fast if unset (`:?` syntax) |
| Auth DB exposed on a public port | Tampering | Bind container to localhost / private network on the company server; do not publish 5432 publicly |

## Sources

### Primary (HIGH confidence)
- Better Auth — Database concept (core schema): https://www.better-auth.com/docs/concepts/database — fetched 2026-06-03; four core tables + fields/types/nullability + FK relationships
- Better Auth — Admin plugin schema: https://www.better-auth.com/docs/plugins/admin — fetched 2026-06-03; `role`/`banned`/`banReason`/`banExpires` on user, `impersonatedBy` on session
- Better Auth — Magic-link plugin: https://www.better-auth.com/docs/plugins/magic-link — fetched 2026-06-03; reuses `verification`, no new table/column
- Better Auth — Drizzle adapter: https://www.better-auth.com/docs/adapters/drizzle — fetched 2026-06-03; camelCase-property→snake_case-column mapping, `text` id, `schema:{}` model mapping, `usePlural`/`fields` options
- npm registry (versions): `better-auth@1.6.14`, `drizzle-orm@0.45.2`, `drizzle-kit@0.31.10`, `postgres@3.4.9` — verified `npm view` 2026-06-03
- slopcheck 0.6.1 — all four packages `[OK]`
- This repo: `src/lib/env.ts`, `src/lib/supabase/admin.ts`, `package.json`, `.gitignore` — env/server-only/version precedents
- `.planning/research/STACK.md`, `SUMMARY.md`, `PITFALLS.md` — milestone research (two-independent-connections rule, file layout, `prepare:false`)

### Secondary (MEDIUM confidence)
- Better Auth GitHub issue #8228 (magic-link/verification CLI-generation bug): https://github.com/better-auth/better-auth/issues/8228 — confirms verification-table reuse + a CLI-only bug we avoid by hand-writing
- Drizzle config docs (referenced for `defineConfig` shape): orm.drizzle.team

### Tertiary (LOW confidence — flagged in Assumptions Log)
- Docker Hub `postgres:17` tag availability (A2), host port 5433 (A3) — operational assumptions to confirm at provisioning

## Metadata

**Confidence breakdown:**
- Better Auth schema (D-08 blocking question): **HIGH** — every column verified field-for-field against official docs for `^1.6.x`; admin columns and magic-link no-table fact confirmed
- Standard stack / versions: **HIGH** — all four packages verified on npm registry + slopcheck OK
- Architecture / tooling (drizzle-kit generate, isolated config, postgres-js client): **HIGH** — matches official docs + analytics reference + repo precedents
- Docker/ops specifics: **MEDIUM** — Docker Compose verified present (as Podman); exact PG version/image tag and port are discretionary/confirm-at-provisioning

**Research date:** 2026-06-03
**Valid until:** ~2026-07-03 (Better Auth is fast-moving; re-verify schema if the project bumps past 1.6.x into a new minor before Phase 3)
