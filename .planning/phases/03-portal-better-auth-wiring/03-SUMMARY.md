---
phase: 03-portal-better-auth-wiring
plan: 01
subsystem: auth-cutover
tags: [auth, better-auth, cutover, google-oauth, magic-link, smtp, migration, destructive, d-01..d-14, cut-01]
requires:
  - "01-* Better Auth identity DB (basket-auth-db postgres:17 @ localhost:5433, auth_* tables, Drizzle authDb)"
  - "02-* RLS dropped; app-layer-only authz + actor stamping (audit.ts stampInsert/stampUpdate/writeAudit)"
provides:
  - "Better Auth is portal's SOLE auth provider; Supabase Auth fully removed from app code"
  - "Staff Google login (Workspace-domain-restricted, D-07); external magic-link via Workspace SMTP (D-08/D-14)"
  - "getUserContext() reads the Better Auth session and resolves profiles by auth_user_id with email auto-link (D-04/D-05/D-06)"
  - "Authenticated-but-unprovisioned users dead-end at /no-access (D-13)"
  - "UserContext.profileId (profiles.id uuid) is the domain actor id, distinct from userId (Better Auth text id)"
  - "supabase/migrations/0015 applied to live DB: profiles.email + profiles.auth_user_id + backfill; FK/trigger/handle_new_user dropped"
affects:
  - "Phase 6 (Cross-subdomain SSO): shared-cookie + analytics repoint builds on this Better Auth instance"
tech-stack:
  added: ["nodemailer", "@types/nodemailer"]
  patterns:
    - "betterAuth({ drizzleAdapter(authDb), google + magicLink + admin, nextCookies() LAST })"
    - "Domain Supabase clients (server/browser) set auth.persistSession=false/autoRefreshToken=false — domain-data only, never touch GoTrue"
    - "Actor stamping uses ctx.profileId (uuid), NOT ctx.userId (Better Auth text id)"
    - "Reset-on-prop React state via setState-during-render (prev-prop compare), not useEffect"
key-files:
  created:
    - "src/lib/auth/server.ts (auth instance)"
    - "src/lib/auth/client.ts (authClient)"
    - "src/lib/auth/middleware.ts (cookie-presence gating)"
    - "src/app/api/auth/[...all]/route.ts (Node runtime handler)"
    - "src/lib/email/mailer.ts (sendMagicLinkEmail, sendCollaboratorInviteEmail)"
    - "src/app/(auth)/login/login-form-client.tsx"
    - "src/app/(auth)/no-access/ (page + logout-button-client)"
    - "supabase/migrations/0015_profiles_auth_link_and_drop_supabase_auth.sql"
  modified:
    - "src/lib/auth.ts (getUserContext chokepoint; added profileId + requireAccess)"
    - "src/lib/audit.ts (stamp actor = ctx.profileId)"
    - "src/app/actions/people.ts (profiles-keyed provisioning/revoke; profileId)"
    - "src/app/api/collaborator-reports/route.ts (reporter_profile_id = ctx.profileId)"
    - "src/app/(dashboard)/layout.tsx (hasAccess -> /no-access gate)"
    - "src/lib/supabase/server.ts + browser.ts (disable session handling)"
    - "src/lib/constants.ts (dropped app_metadata role path)"
    - "src/lib/data/platform-access.ts (reads profiles directly)"
    - "src/lib/env.ts (Better Auth + Google + SMTP env + asserts)"
    - "middleware.ts (Better Auth cookie gating)"
  deleted:
    - "src/app/(auth)/forgot-password/, reset-password/, src/app/auth/confirm/route.ts"
    - "src/lib/supabase/auth-session.ts, src/lib/supabase/middleware.ts"
decisions:
  - "Migration numbered 0015 (not plan's 0011) — 0011-0014 already existed in the repo. Applied to Supabase via DATABASE_URL (pooler aws-1-sa-east-1), single transaction, UPDATE 2 backfill."
  - "Cutover actor-id bug: ctx.userId is now a Better Auth TEXT id, but created_by/changed_by/reporter_profile_id are uuid FKs to profiles.id. Added UserContext.profileId (= profiles.id) and switched all domain-actor stamps to it. Pre-cutover the two were equal (Supabase uid = profiles.id)."
  - "Domain Supabase clients had no auth options, so @supabase/ssr resolved a stale pre-cutover sb-*-auth-token cookie and tried to refresh -> refresh_token_not_found. Disabled session handling on server.ts + browser.ts (RLS gone, anon is fine)."
  - "D-13 /no-access gate was missing from the dashboard layout (T6 specified it but it wasn't wired). Added `if (user?.userId && !user.hasAccess) redirect('/no-access')`."
  - "Pre-existing react-hooks lint errors (4 domain UI files, unrelated to auth) fixed to green `npm run check`: reset-on-prop effects -> setState-during-render; portal mount gate kept with targeted eslint-disable; incidents memoization bail -> dropped manual useMemo (React Compiler auto-memoizes)."
requirements: [PAUTH-01, PAUTH-02, PAUTH-03, PAUTH-04, PAUTH-05, MIG-01, MIG-02, MIG-03, CUT-01]
metrics:
  completed: "2026-06-11"
  tasks: 10
  files: "~30 (8 created, deletions, migration applied)"
---

# Phase 3: Portal Better Auth Wiring + Full Cutover Summary

Swapped portal from Supabase Auth to Better Auth as the **sole** auth provider in one phase (absorbed old Phases 4 & 5). Staff log in with domain-restricted Google; externals via magic link over Workspace SMTP. Authorization is the email-linked `profiles` table, resolved through a rewritten `getUserContext()` chokepoint so every existing guard keeps working. Supabase Postgres stays for domain data; Supabase Auth is gone.

## What Was Built

- **Better Auth core (T1–T4):** `auth` instance (Drizzle adapter on the Phase-1 `authDb`, google + magicLink + admin plugins, `nextCookies()` last), Node-runtime catch-all route handler, `authClient`, Workspace SMTP mailer, and full env wiring with `assertBetterAuthEnv`/`assertSmtpEnv`. Google sign-in is rejected server-side unless the email domain is `basquetpass.tv` (D-07).
- **Chokepoint (T5):** `getUserContext()` reads the Better Auth session, resolves `profiles` by `auth_user_id`, and auto-links by email on first login (stamping `auth_user_id`; `profiles.id` unchanged). Authenticated-but-unprovisioned → `hasAccess:false`.
- **Gating (T6, T7):** Better Auth cookie-presence middleware; `/no-access` dead-end; login UI reduced to Google + magic link (all password/reset flows deleted).
- **Provisioning (T8):** People-page grant writes a `profiles` row (role direct, `auth_user_id` null) + invite email — no auth user, no temp password. Revoke deletes the row.
- **Cutover sweep (T9):** removed all residual Supabase Auth surface; role resolves solely from `profiles.role`.
- **Migration 0015 (T2/T10):** `profiles.email` + `auth_user_id` + backfill, then dropped `profiles_id_fkey`, `on_auth_user_created`, `handle_new_user()`. Applied to live Supabase DB.

## Deviations / Fixes Beyond Plan

Three real bugs surfaced during T10 live verification and were fixed:
1. **Actor-id type mismatch** — domain writes wrote the Better Auth text id into uuid actor columns. Introduced `UserContext.profileId` and repointed all stamps. (Unblocks CUT-01.)
2. **Stale Supabase cookie refresh noise** — disabled session handling on the domain Supabase clients.
3. **Missing `/no-access` gate** — added to the dashboard layout.

Also fixed pre-existing (non-auth) react-hooks lint errors to keep `npm run check` green.

## Verification (T10, operator-signed-off 2026-06-11)

- ✅ Staff Google → auto-link to existing admin profile, `auth_user_id` stamped, admin retained.
- ✅ Non-domain Google rejected.
- ✅ Magic-link external (no profile) → `/no-access`.
- ✅ Admin grant → external re-login → collaborator, mi-jornada reachable, `auth_user_id` stamped.
- ✅ Guest mi-jornada works (ships ON via `ALLOW_GUEST_MI_JORNADA=true`).
- ✅ Domain write → `audit_log.changed_by` non-NULL `profiles.id` (CUT-01).
- ✅ Logout → `/login`.
- `npm run check` green (lint + typecheck + 52 tests + build).

## Notes for Next Phase / Ops

- **Deploy env:** host must set `ALLOW_GUEST_MI_JORNADA=true` (guest ships on), real `GOOGLE_CLIENT_ID/SECRET`, `SMTP_USER/PASS`, and the **shared** `BETTER_AUTH_SECRET` (identical across sibling apps for Phase 6 SSO).
- **Local dev:** the `basket-auth-db` Podman container must be running (`podman start basket-auth-db`) or auth queries hit `ECONNREFUSED` on `localhost:5433`.
- **GCP:** OAuth client (Web) authorized redirect URI `{APP_URL}/api/auth/callback/google`; consent screen Internal (Workspace).
- Phase 6 (cross-subdomain SSO) builds directly on this Better Auth instance + shared cookie.
