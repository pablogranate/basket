# Roadmap: Basket-App Unified Auth

## Overview

This milestone moves `portal.basket-app.com` off Supabase Auth onto a shared Better Auth identity store and makes portal + analytics share one login across `*.basket-app.com`. The journey starts by standing up the central identity DB, then does the load-bearing safety work — replacing Supabase RLS (portal's *real* authorization layer today) with app-layer guards before any auth is touched — then wires portal's Better Auth (Google + a non-Google path), migrates existing users without lockout, cuts over (gated on verified logins), and finally repoints analytics so SSO works end-to-end. RLS removal and the guard audit deliberately precede cutover: dropping RLS while Supabase Auth is still live keeps a working app to verify against, and cutover only happens once guards are proven and a real login of each type succeeds.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Shared Identity Database** - Stand up the central `basket_auth` Postgres with Better Auth tables and a Drizzle connection (completed 2026-06-03)
- [x] **Phase 2: RLS Removal & Guard Coverage Audit** - Move all authorization into app-layer guards and actor stamping into the app, so no data path is left open when RLS goes (completed 2026-06-05)
- [ ] **Phase 3: Portal Better Auth Wiring + Full Cutover** - Run Better Auth in portal (Google for staff, magic link for externals) gated by a linked `profiles` access table, AND fully remove Supabase Auth — absorbs the old Phases 4 (migration) & 5 (cutover)
- [x] ~~**Phase 4: User Migration**~~ — **FOLDED into Phase 3** (2026-06-10): only 2 admin users exist; "migration" is them re-logging in via Google + auto-link by email. No hash migration / DB-copy rehearsal needed.
- [x] ~~**Phase 5: Cutover**~~ — **FOLDED into Phase 3** (2026-06-10): no dual-run window, so Supabase Auth removal happens within Phase 3, not a separate phase.
- [ ] **Phase 6: Cross-Subdomain SSO & Analytics Repoint** - Configure shared-cookie SSO and repoint analytics so login/logout propagate across portal + analytics

## Phase Details

### Phase 1: Shared Identity Database

**Goal**: A dedicated `basket_auth` Postgres database exists on the company server with Better Auth's tables and a working Drizzle/postgres connection portal and analytics can both target.
**Depends on**: Nothing (first phase)
**Requirements**: AUTH-01
**Success Criteria** (what must be TRUE):

  1. A dedicated `basket_auth` database (or dedicated schema, if a separate DB is infeasible) exists on the company-server Postgres with Better Auth `user`/`session`/`account`/`verification` tables created via Drizzle migrations.
  2. A Drizzle/postgres-js client can connect to the auth DB using a dedicated `AUTH_DATABASE_URL`, separate from any Supabase connection.
  3. The auth schema and migrations live in a path isolated from any domain-table Drizzle config, so auth migrations never touch domain data.

**Plans**: 2 plans
Plans:
**Wave 1**

- [x] 01-01-PLAN.md — auth_* Drizzle schema, isolated drizzle-kit config, docker-compose basket_auth service, AUTH_DATABASE_URL env wiring, and generated/committed SQL migration

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 01-02-PLAN.md — server-only postgres-js/Drizzle auth client + provision/apply/verify the basket_auth container

### Phase 2: RLS Removal & Guard Coverage Audit

**Goal**: Portal authorization is enforced entirely in the app layer — every data path runs a guard before any query, actor stamping is app-side, and Supabase is treated as plain Postgres — so removing RLS later opens no doors. This phase runs while Supabase Auth is still live, against the existing app, so guards can be verified end-to-end.
**Depends on**: Phase 1
**Requirements**: AUTHZ-01, AUTHZ-02, AUTHZ-03
**Success Criteria** (what must be TRUE):

  1. Every data path — server actions, all API route handlers (including `api/ai/*` and `api/matches/intake`), and read loaders (`lib/data/*`, `(dashboard)/people`) — enforces access via an app-layer guard that fails closed; no path relies on RLS for authorization.
  2. Automated tests assert each API route returns 401/403 without a session and 403 for an under-privileged role, and that a non-admin cannot read `app_settings.secret_value`.
  3. Supabase RLS is no longer the authorization backstop: Supabase is used as plain Postgres, the privileged/service-role client is confined to `server-only` modules, and the `(dashboard)/people` page no longer reads via the admin client.
  4. Actor stamping (`created_by`/`changed_by`/audit) is written from the app layer; triggers no longer call `auth.uid()`, and post-write `audit_log.changed_by` is populated (never NULL).

**Plans**: 6 plans
Plans:
**Wave 1**

- [x] 02-01-PLAN.md — Wave 0 test infra (Vitest + config + CI), `withAuth` HOF + rate limiter, exported `UserContext` type, admin-gated `secret_value` read (D-08)

**Wave 2** *(blocked on 02-01)*

- [x] 02-02-PLAN.md — wrap every `api/ai/*` route in `withAuth` + guest rate limiting (D-04/D-05); machine-auth for `matches/intake` (Open Q1)
- [x] 02-03-PLAN.md — pure loaders + typed `ctx` (D-06); `(dashboard)/people` drops the admin client + server-only platform-access helper (D-09)
- [x] 02-04-PLAN.md — app-side stamping `src/lib/audit.ts` + wire `stampInsert`/`stampUpdate`/`writeAudit` into every write path (AUTHZ-03)

**Wave 3** *(blocked on 02-02, 02-03, 02-04)*

- [x] 02-05-PLAN.md — structural guard-coverage test (D-07) + full-suite/check gate + manual verification (D-02 step 3)

**Wave 4** *(blocked on 02-05 — destructive migration LAST per D-02)*

- [x] 02-06-PLAN.md — `0010` teardown migration (drop RLS policies + `auth.uid()` triggers, D-01/D-03) + `supabase db push` [BLOCKING] + post-push stamping verification

### Phase 3: Portal Better Auth Wiring + Full Cutover

> **Scope expanded 2026-06-10** (see `phases/03-portal-better-auth-wiring/03-CONTEXT.md`). Better Auth becomes the **sole** auth provider in this phase — no dual-run. The old Phase 4 (User Migration) and Phase 5 (Cutover) are folded in here: with only 2 admin users, "migration" is them re-logging in via Google + auto-link by email, and Supabase Auth is fully removed before this phase closes. Supabase Postgres stays for domain data.

**Goal**: Portal runs Better Auth against the shared auth DB as its only auth — staff log in with Google (restricted to the `basquetpass.tv` Workspace), external collaborators log in via magic link — access is gated by its own email-linked `profiles` table preserving all roles, guest `mi-jornada` keeps working, and Supabase Auth is fully removed.
**Depends on**: Phase 1, Phase 2
**Requirements**: PAUTH-01, PAUTH-02, PAUTH-03, PAUTH-04, PAUTH-05, MIG-01, MIG-02, MIG-03, CUT-01
**Success Criteria** (what must be TRUE):

  1. Portal serves Better Auth at `/api/auth/[...all]` (Node runtime, `nextCookies()` last) with a Drizzle connection to the shared auth DB; the Supabase client remains only as a domain-data DB client.
  2. A staff user logs in with Google (rejected server-side unless the email is `@basquetpass.tv`) and an external collaborator logs in via magic link (delivered via Google Workspace SMTP / nodemailer); there is no email/password path.
  3. Portal access is gated by its own `profiles` access table (linked by `email`, resolving to a stable `profiles.id` via a new `auth_user_id` column), not a domain allowlist; a logged-in user with no `profiles` row hits a "no access" dead-end page (not blocked globally, not auto-provisioned).
  4. A logged-in user's role (admin/editor/viewer/collaborator) and per-section access are correctly enforced by the app-layer guards, and account linking attaches a Google login to an existing same-email account rather than creating a duplicate (no `trustedProviders` shortcut).
  5. Guest `mi-jornada` mode still works for unauthenticated users after the auth swap, and its allowed AI routes remain reachable but rate-limited.
  6. **(absorbed MIG-01/02/03)** Both existing admins retain access by re-logging in via Better Auth and auto-linking to their pre-existing `profiles` row by email; `profiles.id` is unchanged (domain FKs + audit history intact); the `profiles.id → auth.users(id)` FK and `on_auth_user_created` trigger are dropped.
  7. **(absorbed CUT-01)** Supabase Auth (GoTrue sign-in/reset/OTP, `@supabase/ssr` session middleware, `auth/confirm`, forgot/reset-password pages) is removed from portal; after removal, logout works and a post-cutover write still records a non-NULL actor.

**Plans**: TBD
**UI hint**: yes

### ~~Phase 4: User Migration~~ — FOLDED into Phase 3 (2026-06-10)

Collapsed during Phase 3 discussion. Rationale: only **2 users** exist (both `@basquetpass.tv` admins), so there is no hash-migration / migrate-vs-reset problem and no need to rehearse on a DB copy. "Migration" reduces to: both admins re-login via Better Auth (Google) and auto-link to their existing `profiles` row by email. Requirements **MIG-01/02/03** are now satisfied by Phase 3 criteria 3 & 6.

### ~~Phase 5: Cutover~~ — FOLDED into Phase 3 (2026-06-10)

Collapsed during Phase 3 discussion. Rationale: Better Auth is the **sole** auth as of Phase 3 (no dual-run window), so there is nothing to "cut over" later — Supabase Auth is removed within Phase 3. Requirement **CUT-01** is now satisfied by Phase 3 criterion 7.

### Phase 6: Cross-Subdomain SSO & Analytics Repoint

**Goal**: A single session is recognized across portal and analytics and logout propagates, achieved by aligning the SSO-critical config on both apps and repointing analytics to the shared auth DB.
**Depends on**: Phase 5
**Requirements**: AUTH-02, AUTH-03, CUT-02
**Success Criteria** (what must be TRUE):

  1. Both portal and analytics use an identical `BETTER_AUTH_SECRET`, `crossSubDomainCookies` with domain `.basket-app.com`, and an explicit `trustedOrigins` list covering all three subdomains.
  2. Analytics is repointed to the shared auth DB (its existing rows migrated in), with its domain-lock reject moved out of shared identity hooks into its own per-app guard so portal externals are never blocked globally.
  3. A session created on one subdomain is recognized on the other (verified on real subdomains, not localhost), and logging out of one app logs the user out of the other.

**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 6 (Phases 4 & 5 folded into 3)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Shared Identity Database | 2/2 | Complete   | 2026-06-03 |
| 2. RLS Removal & Guard Coverage Audit | 6/6 | Complete | 2026-06-05 |
| 3. Portal Better Auth Wiring + Full Cutover | 0/TBD | Not started | - |
| ~~4. User Migration~~ | — | Folded into Phase 3 | 2026-06-10 |
| ~~5. Cutover~~ | — | Folded into Phase 3 | 2026-06-10 |
| 6. Cross-Subdomain SSO & Analytics Repoint | 0/TBD | Not started | - |
