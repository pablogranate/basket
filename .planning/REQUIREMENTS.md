# Requirements: Basket-App Unified Auth

**Defined:** 2026-06-03
**Core Value:** A single sign-on across `*.basket-app.com` where identity is shared but each app authorizes its own users independently — without breaking portal's existing role-based access.

## v1 Requirements

### Shared Identity & SSO

- [ ] **AUTH-01**: Stand up a dedicated `basket_auth` database on the company-server Postgres with Better Auth tables (user/session/account/verification) and a Drizzle schema/migrations
- [ ] **AUTH-02**: Configure cross-subdomain SSO — identical `BETTER_AUTH_SECRET`, `crossSubDomainCookies` with domain `.basket-app.com`, and explicit `trustedOrigins` across portal + analytics
- [ ] **AUTH-03**: A session created on any subdomain is recognized on the others, and logout propagates across subdomains

### Portal Auth

- [ ] **PAUTH-01**: Portal runs Better Auth via `/api/auth/[...all]` with a Drizzle/postgres connection to the shared auth DB, alongside the unchanged Supabase domain client
- [ ] **PAUTH-02**: Staff log in with Google; external collaborators log in via a non-Google path (email/password and/or magic link)
- [ ] **PAUTH-03**: Portal access is gated by its own access table (`profiles`, linked via `auth_user_id`), not a domain allowlist
- [ ] **PAUTH-04**: Portal preserves existing roles (admin/editor/viewer/collaborator) + per-section access through app-layer guards
- [ ] **PAUTH-05**: Guest `mi-jornada` mode still works after the auth swap

### Authorization / RLS Removal

- [ ] **AUTHZ-01**: Every data path (server actions, API route handlers incl. `ai/*` and `matches/intake`, and data loaders) enforces access via app-layer guards
- [ ] **AUTHZ-02**: Supabase RLS reliance is removed; Supabase is used as a plain Postgres for domain data
- [ ] **AUTHZ-03**: Actor stamping (`created_by`/`changed_by`/audit) is moved to the app layer (no longer `auth.uid()`)

### User Migration

- [ ] **MIG-01**: Existing Supabase Auth users retain access with no lockout (migrate-vs-reset approach chosen after inspecting prod password-hash format + user counts)
- [ ] **MIG-02**: `profiles` linked to Better Auth users via `auth_user_id` (`profiles.id` kept stable; the `profiles.id → auth.users(id)` FK and `on_auth_user_created` trigger dropped)
- [ ] **MIG-03**: Migration verified on a database copy before cutover

### Cutover & Analytics

- [ ] **CUT-01**: Supabase Auth removed from portal, gated on a verified login for one migrated password user AND one Google staff user
- [ ] **CUT-02**: Analytics repointed to the shared auth DB; end-to-end SSO validated across portal + analytics

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Incidencias

- **INC-01**: `incidencias.basket-app.com` joins the shared identity with its own per-app access gate

### Hardening

- **HARD-01**: Optional RLS-as-defense-in-depth via per-request GUC (`app.current_user_id`) instead of pure app-layer authz

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Incidencias integration | Deferred to a later milestone (auth design accommodates it, no work now) |
| Merging the three apps' domain databases | Each app keeps its own data store; only identity is shared |
| Migrating portal domain data off Supabase | Supabase stays as portal's Postgres |
| Unifying the role model across apps | Analytics keeps admin/viewer, portal keeps its richer set; only identity is shared |
| RLS-via-GUC defense-in-depth | Fallback only; v1 is app-layer authz (tracked as HARD-01) |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 | Phase 1 | Pending |
| AUTH-02 | Phase 6 | Pending |
| AUTH-03 | Phase 6 | Pending |
| PAUTH-01 | Phase 3 | Pending |
| PAUTH-02 | Phase 3 | Pending |
| PAUTH-03 | Phase 3 | Pending |
| PAUTH-04 | Phase 3 | Pending |
| PAUTH-05 | Phase 3 | Pending |
| AUTHZ-01 | Phase 2 | Pending |
| AUTHZ-02 | Phase 2 | Pending |
| AUTHZ-03 | Phase 2 | Pending |
| MIG-01 | Phase 4 | Pending |
| MIG-02 | Phase 4 | Pending |
| MIG-03 | Phase 4 | Pending |
| CUT-01 | Phase 5 | Pending |
| CUT-02 | Phase 6 | Pending |

**Coverage:**
- v1 requirements: 16 total
- Mapped to phases: 16 ✓
- Unmapped: 0 ✓

---
*Requirements defined: 2026-06-03*
*Last updated: 2026-06-03 after roadmap creation*
