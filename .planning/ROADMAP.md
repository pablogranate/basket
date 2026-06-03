# Roadmap: Basket-App Unified Auth

## Overview

This milestone moves `portal.basket-app.com` off Supabase Auth onto a shared Better Auth identity store and makes portal + analytics share one login across `*.basket-app.com`. The journey starts by standing up the central identity DB, then does the load-bearing safety work — replacing Supabase RLS (portal's *real* authorization layer today) with app-layer guards before any auth is touched — then wires portal's Better Auth (Google + a non-Google path), migrates existing users without lockout, cuts over (gated on verified logins), and finally repoints analytics so SSO works end-to-end. RLS removal and the guard audit deliberately precede cutover: dropping RLS while Supabase Auth is still live keeps a working app to verify against, and cutover only happens once guards are proven and a real login of each type succeeds.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Shared Identity Database** - Stand up the central `basket_auth` Postgres with Better Auth tables and a Drizzle connection (completed 2026-06-03)
- [ ] **Phase 2: RLS Removal & Guard Coverage Audit** - Move all authorization into app-layer guards and actor stamping into the app, so no data path is left open when RLS goes
- [ ] **Phase 3: Portal Better Auth Wiring** - Run Better Auth in portal with Google + a non-Google path, gated by a linked `profiles` access table preserving existing roles
- [ ] **Phase 4: User Migration** - Carry existing Supabase users into Better Auth with no lockout, linking (not re-keying) `profiles`, verified on a DB copy
- [ ] **Phase 5: Cutover** - Remove Supabase Auth from portal, gated on verified logins for one migrated password user and one Google staff user
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

- [ ] 02-01-PLAN.md — Wave 0 test infra (Vitest + config + CI), `withAuth` HOF + rate limiter, exported `UserContext` type, admin-gated `secret_value` read (D-08)

**Wave 2** *(blocked on 02-01)*

- [ ] 02-02-PLAN.md — wrap every `api/ai/*` route in `withAuth` + guest rate limiting (D-04/D-05); machine-auth for `matches/intake` (Open Q1)
- [ ] 02-03-PLAN.md — pure loaders + typed `ctx` (D-06); `(dashboard)/people` drops the admin client + server-only platform-access helper (D-09)
- [ ] 02-04-PLAN.md — app-side stamping `src/lib/audit.ts` + wire `stampInsert`/`stampUpdate`/`writeAudit` into every write path (AUTHZ-03)

**Wave 3** *(blocked on 02-02, 02-03, 02-04)*

- [ ] 02-05-PLAN.md — structural guard-coverage test (D-07) + full-suite/check gate + manual verification (D-02 step 3)

**Wave 4** *(blocked on 02-05 — destructive migration LAST per D-02)*

- [ ] 02-06-PLAN.md — `0010` teardown migration (drop RLS policies + `auth.uid()` triggers, D-01/D-03) + `supabase db push` [BLOCKING] + post-push stamping verification

### Phase 3: Portal Better Auth Wiring

**Goal**: Portal runs Better Auth against the shared auth DB with both staff (Google) and external (non-Google) login paths, gates access through its own `profiles` table preserving all existing roles, and keeps guest `mi-jornada` working.
**Depends on**: Phase 1, Phase 2
**Requirements**: PAUTH-01, PAUTH-02, PAUTH-03, PAUTH-04, PAUTH-05
**Success Criteria** (what must be TRUE):

  1. Portal serves Better Auth at `/api/auth/[...all]` (Node runtime, `nextCookies()` last) with a Drizzle connection to the shared auth DB, alongside the unchanged Supabase domain client.
  2. A staff user can log in with Google and an external collaborator can log in via a non-Google path (email/password and/or magic link) in the same instance.
  3. Portal access is gated by its own `profiles` access table (resolved via `auth_user_id`), not a domain allowlist, and a user without a portal access row is denied portal access without being blocked globally.
  4. A logged-in user's role (admin/editor/viewer/collaborator) and per-section access are correctly enforced by the app-layer guards, and account linking attaches a Google login to an existing same-email account rather than creating a duplicate (no `trustedProviders` shortcut).
  5. Guest `mi-jornada` mode still works for unauthenticated users after the auth swap, and its allowed AI routes remain reachable but rate-limited.

**Plans**: TBD
**UI hint**: yes

### Phase 4: User Migration

**Goal**: Existing Supabase Auth users exist in Better Auth with no lockout, `profiles` is linked to Better Auth users by `auth_user_id` (PK and domain FKs untouched), and the whole migration is proven on a database copy before any cutover.
**Depends on**: Phase 1, Phase 3
**Requirements**: MIG-01, MIG-02, MIG-03
**Success Criteria** (what must be TRUE):

  1. The migrate-vs-reset approach is decided from a live inspection of the production password-hash format and email/password-vs-OAuth user counts, and every existing user retains a working path in (bcrypt-verify reuse, magic-link/reset onboard, or Google).
  2. `profiles.id` is kept stable with a new `auth_user_id text` link to Better Auth `user.id`; the `profiles.id → auth.users(id)` FK and `on_auth_user_created` trigger are dropped, and Supabase `user.id` is reused as the Better Auth id so links align.
  3. The migration runs against a restored DB copy and referential integrity is asserted — no orphaned `created_by`/`reporter_profile_id`, audit history intact — before it is run against production.

**Plans**: TBD

### Phase 5: Cutover

**Goal**: Supabase Auth is removed from portal, with removal gated on real verified logins so no class of user is stranded.
**Depends on**: Phase 2, Phase 3, Phase 4
**Requirements**: CUT-01
**Success Criteria** (what must be TRUE):

  1. Before Supabase Auth is removed, at least one migrated email/password user AND one Google staff user have each completed a verified login through Better Auth on portal.
  2. Supabase Auth (sign-in/reset/OTP via GoTrue) is removed from portal; the Supabase client remains only as a plain domain-data DB client with no authorization flowing through `auth.uid()`.
  3. After removal, logout works and post-cutover writes still record a non-NULL actor, confirming the app-layer authz and stamping from Phase 2 hold without RLS.

**Plans**: TBD

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
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Shared Identity Database | 2/2 | Complete   | 2026-06-03 |
| 2. RLS Removal & Guard Coverage Audit | 0/6 | Planned | - |
| 3. Portal Better Auth Wiring | 0/TBD | Not started | - |
| 4. User Migration | 0/TBD | Not started | - |
| 5. Cutover | 0/TBD | Not started | - |
| 6. Cross-Subdomain SSO & Analytics Repoint | 0/TBD | Not started | - |
