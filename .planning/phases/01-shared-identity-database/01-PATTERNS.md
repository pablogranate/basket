# Phase 1: Shared Identity Database - Pattern Map

**Mapped:** 2026-06-03
**Files analyzed:** 6 (5 new, 1 modified)
**Analogs found:** 4 with repo analogs / 6 total (2 use RESEARCH.md-only patterns)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/lib/env.ts` | config | request-response | *(self — MODIFY)* | exact (extend in place) |
| `src/lib/db/auth-client.ts` | service (server-only DB client) | request-response | `src/lib/supabase/admin.ts` | role-match (server-only client module) |
| `src/lib/auth/schema.ts` | model (schema defs) | transform (schema-of-record) | `supabase/migrations/*.sql` + `src/lib/database.types.ts` | partial (no Drizzle pgTable precedent) |
| `drizzle/auth/0000_*.sql` | migration | transform (DDL) | `supabase/migrations/0009_add_contacts.sql` | role-match (committed SQL, ISOLATED path) |
| `drizzle.auth.config.ts` | config | batch (build tooling) | *(none — no drizzle config exists)* | no analog (RESEARCH Pattern 2) |
| `docker-compose.yml` | config | event-driven (container provisioning) | *(none — no compose file exists)* | no analog (RESEARCH Pattern 5) |

**Key fact:** `better-auth ^1.6.14`, `drizzle-orm ^0.45.2`, `drizzle-kit ^0.31.10`, `postgres ^3.4.9` are ALREADY in `package.json` dependencies — no install step needed. `src/lib/db/` does NOT yet exist (new directory).

## Pattern Assignments

### `src/lib/env.ts` (config — MODIFY in place)

**Analog:** itself — extend the existing `appEnv` object and add a guard that copies `assertServiceRoleKey` exactly.

**Existing shape to extend** (`src/lib/env.ts:1-30`, full file):
```typescript
export const appEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  // ...existing fields unchanged...
  portalGeminiModel: process.env.PORTAL_GEMINI_MODEL ?? "gemini-2.5-flash",
};
```

**Guard pattern to copy** (`src/lib/env.ts:24-30` — `assertServiceRoleKey` is the exact template):
```typescript
export function assertServiceRoleKey() {
  if (!appEnv.supabaseServiceRoleKey) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY. The CSV importer requires a service role key.",
    );
  }
}
```

**Concrete additions** (per CONTEXT D-04, RESEARCH Pattern 4):
- Add `authDatabaseUrl: process.env.AUTH_DATABASE_URL ?? ""` as a new field in the `appEnv` object literal (default `""` matches every other field; do NOT make it required-throwing at module load).
- Add `assertAuthDatabaseUrl()` mirroring `assertServiceRoleKey` shape exactly (guard clause → `throw new Error("Missing AUTH_DATABASE_URL. ...")`). Message in same style: names the env var + says what needs it.
- Keep double quotes, trailing commas, `??` defaulting. No `import type` needed (no types added). Named `export function`.

---

### `src/lib/db/auth-client.ts` (service — server-only DB client, NEW)

**Analog:** `src/lib/supabase/admin.ts` — the established server-only client-module shape.

**Server-only isolation pattern to copy** (`src/lib/supabase/admin.ts:1-9`):
```typescript
import "server-only";

import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import { appEnv, assertServiceRoleKey, assertSupabaseEnv } from "@/lib/env";

export function createSupabaseAdminClient() {
  assertSupabaseEnv();
  assertServiceRoleKey();
  // ...
```

**Patterns to carry over from `admin.ts`:**
1. `import "server-only";` as the FIRST line (bare side-effect import, blank line after). This is the architectural constraint from CLAUDE.md ("`src/lib/supabase/admin.ts` is marked `import "server-only"` and must never be reachable from client bundles") — the auth client MUST do the same (connection string is a server secret).
2. Import ordering: bare `server-only` first → third-party (`drizzle-orm/postgres-js`, `postgres`) → blank line → `@/` internal (`@/lib/env`, `@/lib/auth/schema`). Matches `admin.ts` import grouping.
3. Call the assert guard before building the connection: `admin.ts` calls `assertServiceRoleKey()`/`assertSupabaseEnv()` first; auth client calls `assertAuthDatabaseUrl()` before `postgres(...)`.
4. `@/*` alias for internal imports; `import type` only for types.

**Divergence from `admin.ts` (RESEARCH Pattern 3):** `admin.ts` exports a *factory function* that builds a fresh client per call. The auth client instead exports a cached singleton (`globalThis` cache) because postgres-js holds a real connection pool — re-creating per call would exhaust connections on dev hot-reload. Use `postgres(appEnv.authDatabaseUrl, { prepare: false })` then `drizzle(authConn, { schema: authSchema })`. The exact module body is in RESEARCH.md Pattern 3 (lines 348-374) — copy it verbatim; it is the authoritative version. Note it imports `assertAuthDatabaseUrl` from `@/lib/env` (the guard added in the env.ts task).

---

### `src/lib/auth/schema.ts` (model — Drizzle pgTable defs, NEW)

**Analog:** No Drizzle `pgTable` precedent exists in this repo. Two partial analogs inform conventions only:
- `supabase/migrations/0009_add_contacts.sql` — for the column shapes the SQL must end up matching (`text`, `timestamptz`, PK, FK `on delete`, unique constraints).
- `src/lib/database.types.ts` — repo's existing type-of-record-for-DB pattern (camelCase app identifiers vs snake_case DB columns, per CLAUDE.md "Database column names stay `snake_case`... application-facing identifiers are `camelCase`"). The Drizzle camelCase-prop → snake_case-column mapping is the SAME convention, now enforced by the pgTable def.

**Authoritative source:** RESEARCH.md Pattern 1 (lines 258-319) is the verbatim copy — four `pgTable` exports (`authUser`, `authSession`, `authAccount`, `authVerification`) with `auth_*` physical names and all D-07 admin-plugin columns baked in. Field-for-field column set is VERIFIED in RESEARCH.md "Better Auth Canonical Schema" (lines 117-194).

**Critical convention (RESEARCH Pitfall 1, lines 459-463):** property name = camelCase (`emailVerified`, `userId`), column string arg = snake_case (`"email_verified"`, `"user_id"`). This is also the repo's own convention (CLAUDE.md). A reviewer flag: `userId: text("userId")` or `user_id: text("user_id")` are BOTH wrong; correct is `userId: text("user_id")`.

**Repo style to apply:** double quotes, trailing commas, named `export const` per table, single import line `import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";`. `schema.ts` (single word) is acceptable under kebab-case rule. No `index.ts` barrel — `auth-client.ts` imports it by explicit path `@/lib/auth/schema`.

---

### `drizzle/auth/0000_*.sql` (migration — generated, NEW, ISOLATED path)

**Analog:** `supabase/migrations/0009_add_contacts.sql` — the repo's "commit SQL, apply manually" precedent.

**Shared model with the analog (CONTEXT D-09/D-10):** SQL is committed to the repo and applied manually against the DB — exactly how `supabase/migrations/*.sql` work (numbered, committed, no remote runner). The auth SQL follows the same deploy philosophy.

**Hard divergence (CONTEXT D-11 — the isolation requirement):** auth SQL lives in `drizzle/auth/` and is NEVER placed in or near `supabase/migrations/`. It is GENERATED by `drizzle-kit generate` (not hand-written like the Supabase migrations) so the TS schema stays the source of record. The numbered file (`0009_add_contacts.sql`) is the only thing the two share conceptually; mechanically they are different tooling in different trees.

**Generation command** (RESEARCH Pattern 2, line 340):
```bash
pnpm drizzle-kit generate --config drizzle.auth.config.ts
```
Add a package.json script so the `--config` flag is never forgotten (RESEARCH Pitfall 2 / Wave 0 Gap): e.g. `"db:auth:generate": "drizzle-kit generate --config drizzle.auth.config.ts"`. Existing scripts block is `package.json:5-13` — append following the same `"name": "command"` style. Note the output includes `drizzle/auth/meta/` (journal + snapshot) which is also committed.

**Commit verification:** `git check-ignore drizzle/auth/0000_x.sql` returns nothing (NOT ignored) — confirmed it will commit. `.env.local` IS ignored (`.env*` at `.gitignore:35`).

---

### `drizzle.auth.config.ts` (config — build tooling, NEW)

**Analog:** None — no `drizzle.config.ts` exists anywhere in the repo (confirmed: `ls drizzle.config.ts` → not found).

**Authoritative source:** RESEARCH.md Pattern 2 (lines 326-336) — copy verbatim:
```typescript
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/auth/schema.ts",
  out: "./drizzle/auth",
  dbCredentials: { url: process.env.AUTH_DATABASE_URL! },
});
```

**Repo conventions that DO apply:** `export default` is allowed here — CLAUDE.md reserves `export default` for "config objects (`next.config.ts`, `eslint.config.mjs`)", and this is a config object, so `export default defineConfig(...)` is on-pattern. Double quotes, trailing commas. The filename is `drizzle.auth.config.ts` (not kebab — config files in this repo use dotted names like `next.config.ts`, `postcss.config.mjs`, `eslint.config.mjs`, matching that family). `out: "./drizzle/auth"` is the D-11 isolation enforcement — never `./drizzle` or `./supabase`.

---

### `docker-compose.yml` (config — container provisioning, NEW)

**Analog:** None — no compose file, Dockerfile, or `netlify`-adjacent container config exists.

**Authoritative source:** RESEARCH.md Pattern 5 (lines 401-418) — copy verbatim. Postgres 17 service `basket-auth-db`, DB `basket_auth`, host port `5433` (avoids 5432 collision), named volume `basket-auth-data`, password sourced from `${AUTH_DB_PASSWORD:?...}` (fails fast if unset — never hard-codes the secret).

**Repo conventions:** `.editorconfig` covers `*.yml`/`*.yaml` (CLAUDE.md "Applies to `*.{...,yml,yaml,...}`") — follow its indentation. Confirmed NOT gitignored (will commit per D-03/D-10). Host runs Podman 5.6.2 (`docker`→podman) with `docker compose` v2.40.2 — the file is portable, no change needed (RESEARCH Environment Availability + Pitfall 3).

## Shared Patterns

### Server-only isolation
**Source:** `src/lib/supabase/admin.ts:1` (`import "server-only";` as first line)
**Apply to:** `src/lib/db/auth-client.ts`
**Rationale:** CLAUDE.md architectural constraint — service-role/secret-bearing modules must never reach client bundles. The `AUTH_DATABASE_URL` connection string is a server secret; the bare `import "server-only";` first-line side-effect import is the repo's enforced precedent.
```typescript
import "server-only";
```

### Centralized env accessor + assert guard
**Source:** `src/lib/env.ts:1-30` (`appEnv` object literal + `assertServiceRoleKey()` guard at lines 24-30)
**Apply to:** `src/lib/env.ts` (add `authDatabaseUrl` + `assertAuthDatabaseUrl`), consumed by `src/lib/db/auth-client.ts` and `drizzle.auth.config.ts`
**Rationale:** CLAUDE.md mandates `appEnv` as the single env accessor; no scattered `process.env` reads. New var follows the `?? ""` default + named assert-guard-that-throws pattern.
```typescript
export function assertServiceRoleKey() {
  if (!appEnv.supabaseServiceRoleKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY. ...");
  }
}
```

### Committed-SQL, applied-manually migrations
**Source:** `supabase/migrations/*.sql` (e.g. `0009_add_contacts.sql`) — numbered, committed, no remote runner
**Apply to:** `drizzle/auth/0000_*.sql`
**Rationale:** CONTEXT D-09/D-10 deploy model = commit SQL, pull on server, apply manually. Same philosophy as the existing Supabase migrations, BUT in the isolated `drizzle/auth/` tree (D-11) and machine-generated by `drizzle-kit generate` rather than hand-written.

### camelCase property ↔ snake_case column binding
**Source:** CLAUDE.md convention ("Database column names stay `snake_case`... application-facing identifiers are `camelCase`"), reflected in `src/lib/database.types.ts`
**Apply to:** `src/lib/auth/schema.ts` (every `pgTable` field)
**Rationale:** Better Auth's Drizzle adapter resolves by JS property name, reads/writes the snake_case SQL column. This coincides with the repo's pre-existing naming split. `emailVerified: boolean("email_verified")`.

## No Analog Found

Files with no close repo match — use RESEARCH.md patterns directly (all are VERIFIED/authoritative copy in 01-RESEARCH.md):

| File | Role | Data Flow | Reason | Source to use |
|------|------|-----------|--------|---------------|
| `src/lib/auth/schema.ts` | model | transform | No Drizzle `pgTable` defs exist in repo (first Drizzle artifact) | RESEARCH Pattern 1 (lines 258-319) + VERIFIED schema (lines 117-194) |
| `drizzle.auth.config.ts` | config | batch | No `drizzle.config.ts` exists anywhere | RESEARCH Pattern 2 (lines 326-336) |
| `docker-compose.yml` | config | event-driven | No compose/Docker file exists | RESEARCH Pattern 5 (lines 401-418) |

## Metadata

**Analog search scope:** `src/lib/env.ts`, `src/lib/supabase/*`, `src/lib/db/` (absent), `supabase/migrations/*`, repo root config files, `package.json`, `.gitignore`
**Files scanned:** 5 read in full + directory listings of migrations/clients/root configs
**Dependencies confirmed present:** `better-auth@^1.6.14`, `drizzle-orm@^0.45.2`, `drizzle-kit@^0.31.10`, `postgres@^3.4.9` (already in `package.json` — no install task)
**Pattern extraction date:** 2026-06-03
