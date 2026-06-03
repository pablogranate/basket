# Phase 1: Shared Identity Database - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-03
**Phase:** 1-shared-identity-database
**Areas discussed:** DB placement, Table naming, Schema scope, Migration tooling

---

## DB Placement

| Option | Description | Selected |
|--------|-------------|----------|
| Dedicated `basket_auth` DB | New DB on the company-server Postgres; own `AUTH_DATABASE_URL` | ✓ |
| Dedicated `auth` schema | Schema inside analytics' existing Postgres (fallback) | |

**User's choice:** Dedicated `basket_auth` DB — "Yes I can [provision]. Do it using docker inside this basket repo."
**Notes:** DB runs **as a Docker container on the company server** (not just a dev convenience), defined by a `docker-compose.yml` in this repo. Rationale: it only stores users/sessions, so a dedicated Postgres container is the simplest operationally.

---

## Table Naming

| Option | Description | Selected |
|--------|-------------|----------|
| Better Auth defaults | `user`/`session`/`account`/`verification` | |
| `auth_*` prefix (match analytics) | `auth_user`/`auth_session`/`auth_account`/`auth_verification` as the shared canonical names | ✓ |

**User's choice:** `auth_*` for all four.
**Notes:** Canonical shared names for the whole identity store; Phase 6 repoints analytics into these exact tables so the repoint is a row migration, not a rename. Better Auth maps its default logical names → prefixed physical tables via schema config (analytics pattern).

---

## Schema Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Base 4 tables only | Minimal Better Auth schema; re-migrate later for plugins | |
| Include plugin columns now | Bake `admin` + `magicLink` columns up front | ✓ |

**User's choice:** Include `magicLink` and `admin` columns now.
**Notes:** Avoids a second migration on the shared identity store when Phase 3 adds login methods. `admin` adds `role`/`banned`/`ban_reason`/`ban_expires` on `auth_user` + `impersonated_by` on `auth_session`; `magicLink` reuses `auth_verification` (no new column). Exact columns verified against Better Auth ^1.6.x in planning.

---

## Migration Tooling

| Option | Description | Selected |
|--------|-------------|----------|
| `drizzle-kit generate` (SQL files) | Emit committed SQL; pull on server, run manually | ✓ |
| `drizzle-kit push` | Push schema directly from dev to live DB | |
| Better Auth CLI `migrate` | CLI applies schema over a live connection | |

**User's choice:** SQL migration script committed to the repo; pulled on the server and run there.
**Notes:** Rules out `push` and BA CLI `migrate` (both need a live dev→DB connection). Auth migrations isolated from `supabase/migrations/` in an auth-only path (proposed `drizzle/auth/` + dedicated `drizzle.config`).

## Claude's Discretion

- Exact file/dir names (`drizzle/auth/`, drizzle config filename), docker-compose service naming, postgres-js client options (`prepare: false` per research).

## Deferred Ideas

- Better Auth instance + login methods + route handler + middleware → Phase 3.
- Cross-subdomain cookie/secret/`trustedOrigins` → Phase 6.
- Analytics repoint + row migration into shared `auth_*` tables → Phase 6.
- `profiles.auth_user_id` link + drop Supabase FK/trigger → Phase 4.
