---
phase: 03-portal-better-auth-wiring
plan: 01
type: execute
wave: 1
depends_on: ["01-*", "02-*"]
autonomous: false
requirements: [PAUTH-01, PAUTH-02, PAUTH-03, PAUTH-04, PAUTH-05, MIG-01, MIG-02, MIG-03, CUT-01]
files_modified:
  - package.json
  - src/lib/env.ts
  - supabase/migrations/0011_profiles_auth_link_and_drop_supabase_auth.sql
  - src/lib/email/mailer.ts
  - src/lib/auth/server.ts
  - src/lib/auth/client.ts
  - src/app/api/auth/[...all]/route.ts
  - src/lib/auth.ts
  - src/lib/constants.ts
  - middleware.ts
  - src/lib/supabase/middleware.ts
  - src/app/(auth)/login/page.tsx
  - src/app/(auth)/login/login-form-client.tsx
  - src/app/(auth)/no-access/page.tsx
  - src/app/actions/auth.ts
  - src/app/actions/people.ts
  - src/lib/data/platform-access.ts
user_setup:
  - "Google Cloud OAuth client (Web): authorized redirect URI {APP_URL}/api/auth/callback/google; provide GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET"
  - "Workspace sender mailbox + 2FA + app password; provide SMTP_USER, SMTP_PASS, MAIL_FROM"
  - "Generate BETTER_AUTH_SECRET (openssl rand -base64 32); set BETTER_AUTH_URL/NEXT_PUBLIC_APP_URL"

must_haves:
  truths:
    - "Better Auth is the SOLE auth provider; no Supabase Auth (getUser/signIn/GoTrue) remains in app code (D-01/D-02)"
    - "Staff Google login rejected server-side unless email domain is basquetpass.tv (D-07)"
    - "External login is magic-link only via Google Workspace SMTP; no email/password path exists (D-08/D-14)"
    - "profiles resolves from a Better Auth session by auth_user_id; first login auto-links by email and stamps auth_user_id; profiles.id is unchanged (D-04/D-05/D-06)"
    - "An authenticated user with no profiles row lands on /no-access (not auto-provisioned, not globally blocked) (D-11/D-13)"
    - "Guest mi-jornada still works unauthenticated; its AI routes stay reachable + rate-limited (PAUTH-05)"
    - "Both existing admins re-login and retain admin; a post-cutover write still records non-NULL audit_log.changed_by (CUT-01)"
  artifacts:
    - path: "src/lib/auth/server.ts"
      provides: "betterAuth instance (Drizzle adapter on authDb, google+magicLink+admin+nextCookies)"
    - path: "supabase/migrations/0011_profiles_auth_link_and_drop_supabase_auth.sql"
      provides: "profiles.email + profiles.auth_user_id + backfill; drop profiles->auth.users FK, on_auth_user_created, handle_new_user"
---

<objective>
Swap portal from Supabase Auth to Better Auth as the SOLE auth provider, in one phase (absorbs old Phases 4 & 5). Staff log in with Google (Workspace-restricted), externals via magic link (Workspace SMTP). Access is authorized by the email-linked `profiles` table; `getUserContext()` becomes the single Better-Auth-session chokepoint so all existing guards keep working. Supabase Postgres stays for domain data; Supabase Auth is fully removed.

Read `03-CONTEXT.md` (decisions D-01..D-14) and `01-CONTEXT.md` (auth schema mapping D-05/D-06) before starting.
</objective>

<artifacts_this_phase_produces>
NEW: `src/lib/auth/server.ts` (`auth` instance), `src/lib/auth/client.ts` (`authClient`), `src/app/api/auth/[...all]/route.ts`, `src/lib/email/mailer.ts` (`sendMagicLinkEmail`, `sendCollaboratorInviteEmail`), `src/app/(auth)/login/login-form-client.tsx`, `src/app/(auth)/no-access/page.tsx`, `supabase/migrations/0011_*.sql`.
NEW env (in `appEnv`): `betterAuthSecret`, `betterAuthUrl`, `googleClientId`, `googleClientSecret`, `staffEmailDomain`, `smtpHost`, `smtpPort`, `smtpUser`, `smtpPass`, `mailFrom`; asserts `assertBetterAuthEnv()`, `assertSmtpEnv()`.
NEW columns: `profiles.email`, `profiles.auth_user_id`.
REMOVED: `(auth)/forgot-password`, `(auth)/reset-password`, `src/app/auth/confirm/route.ts`, Supabase password/reset auth actions, Supabase session middleware.
</artifacts_this_phase_produces>

<tasks>

<task id="T1" type="auto">
  <name>T1: Dependencies + env wiring</name>
  <read_first>
    - package.json (pnpm primary)
    - src/lib/env.ts (appEnv object + assert* pattern)
  </read_first>
  <action>
    Add `nodemailer` + `@types/nodemailer` (pnpm). Confirm `better-auth ^1.6.14` is present (it is).
    Extend `appEnv` in `src/lib/env.ts` with: `betterAuthSecret` (`BETTER_AUTH_SECRET`), `betterAuthUrl` (`BETTER_AUTH_URL` ?? appUrl), `googleClientId`/`googleClientSecret` (`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`), `staffEmailDomain` (`STAFF_EMAIL_DOMAIN` ?? "basquetpass.tv"), `smtpHost` (`SMTP_HOST` ?? "smtp.gmail.com"), `smtpPort` (`SMTP_PORT` ?? "587"), `smtpUser`, `smtpPass`, `mailFrom` (`MAIL_FROM` ?? smtpUser). Add `assertBetterAuthEnv()` (secret + google creds) and `assertSmtpEnv()` (host/user/pass) following the existing `assertAuthDatabaseUrl()` style. Update `.env.local` (not committed) with placeholders.
  </action>
  <acceptance_criteria>
    - `package.json` lists `nodemailer` + `@types/nodemailer`.
    - `src/lib/env.ts` exposes all new keys; `assertBetterAuthEnv`/`assertSmtpEnv` throw on missing required vars.
    - `npm run typecheck` clean.
  </acceptance_criteria>
</task>

<task id="T2" type="auto">
  <name>T2: DB migration 0011 — profiles link columns + drop Supabase-Auth coupling</name>
  <read_first>
    - supabase/migrations/0001_initial.sql (profiles FK to auth.users, handle_new_user, on_auth_user_created)
    - supabase/migrations/0010_drop_rls_and_auth_uid_triggers.sql (style, what was kept)
    - 03-CONTEXT.md D-04/D-05/D-06
  </read_first>
  <action>
    Create `supabase/migrations/0011_profiles_auth_link_and_drop_supabase_auth.sql` (lowercase, public.-qualified, if-exists guards) doing, IN ORDER:
    1. `alter table public.profiles add column if not exists email text;`
    2. Backfill: `update public.profiles p set email = u.email from auth.users u where u.id = p.id and p.email is null;` (MUST run while auth.users still holds emails).
    3. `alter table public.profiles add column if not exists auth_user_id text;`
    4. Pre-link the 2 existing rows so first login is a no-op match is unnecessary — leave `auth_user_id` NULL (auto-link stamps it). Add unique indexes: `create unique index if not exists profiles_email_lower_key on public.profiles (lower(email));` and `create unique index if not exists profiles_auth_user_id_key on public.profiles (auth_user_id);`
    5. After backfill, enforce presence: `alter table public.profiles alter column email set not null;`
    6. Drop the Supabase-Auth coupling kept in Phase 2: drop the `profiles.id -> auth.users(id)` FK (verify exact constraint name via `\d public.profiles`, likely `profiles_id_fkey`); `drop trigger if exists on_auth_user_created on auth.users;`; `drop function if exists public.handle_new_user();`.
    DO NOT change `profiles.id` (uuid PK, FK target for audit_log/matches/etc.). DO NOT touch the `app_role` enum (already has `collaborator`).
    Apply via psql to the live DB (pooler aws-1-sa-east-1) as in Phase 2 — this is a [BLOCKING] human-confirmed step; backfill verification is the gate.
  </action>
  <acceptance_criteria>
    - Migration file exists; backfill precedes the not-null + FK/trigger drops.
    - After apply: `select email, auth_user_id from profiles` shows both admin emails non-null, auth_user_id null.
    - `profiles_id_fkey` gone; `on_auth_user_created`/`handle_new_user` gone; `profiles.id` unchanged.
  </acceptance_criteria>
</task>

<task id="T3" type="auto">
  <name>T3: Workspace SMTP mailer</name>
  <read_first>
    - src/lib/env.ts (SMTP vars from T1)
    - src/app/actions/people.ts:43 (current sendCollaboratorSetupEmail to replace)
  </read_first>
  <action>
    Create `src/lib/email/mailer.ts` (`import "server-only"`). Build a singleton `nodemailer` transport: `host: appEnv.smtpHost, port: Number(appEnv.smtpPort), secure: false` (STARTTLS on 587), `auth: { user: smtpUser, pass: smtpPass }`. Call `assertSmtpEnv()` lazily. Export `sendMagicLinkEmail({ to, url })` and `sendCollaboratorInviteEmail({ to, loginUrl })`, both `from: appEnv.mailFrom`, simple HTML + text. Log failures with `[mailer]` prefix and rethrow.
  </action>
  <acceptance_criteria>
    - `src/lib/email/mailer.ts` is server-only, exports both senders.
    - `npm run typecheck` clean.
  </acceptance_criteria>
</task>

<task id="T4" type="auto">
  <name>T4: Better Auth instance + route handler + client</name>
  <read_first>
    - src/lib/auth/schema.ts (authUser/authSession/authAccount/authVerification — Phase 1)
    - src/lib/db/auth-client.ts (authDb Drizzle client)
    - 01-CONTEXT.md D-05/D-06 (schema mapping), D-07 (admin + magicLink columns baked)
    - better-auth-best-practices skill
  </read_first>
  <action>
    Create `src/lib/auth/server.ts` exporting `auth = betterAuth({...})`:
    - `database: drizzleAdapter(authDb, { provider: "pg", schema: { user: authUser, session: authSession, account: authAccount, verification: authVerification } })` (D-06 mapping).
    - `secret: appEnv.betterAuthSecret`, `baseURL: appEnv.betterAuthUrl`.
    - `socialProviders.google: { clientId, clientSecret }`.
    - `session: { expiresIn: 60*60*24*60 (60d), updateAge: 60*60*24 }` (long sliding, D-09).
    - `account: { accountLinking: { enabled: true } }` — rely on verified email; NO `trustedProviders` (D-10).
    - `plugins: [ admin(), magicLink({ sendMagicLink: async ({ email, url }) => sendMagicLinkEmail({ to: email, url }) }), nextCookies() ]` — `nextCookies()` MUST be last.
    - Google domain restriction (D-07): in `databaseHooks.user.create.before` (and a sign-in before-hook), if the inbound account provider is google and the email does not end with `@${appEnv.staffEmailDomain}`, throw/deny. (The Google `hd` hint alone is insufficient — verify the email domain server-side.)
    Create `src/app/api/auth/[...all]/route.ts`: `export const runtime = "nodejs"; export const { GET, POST } = toNextJsHandler(auth);`.
    Create `src/lib/auth/client.ts`: `authClient = createAuthClient({ plugins: [ magicLinkClient(), adminClient() ] })` for the login UI.
  </action>
  <acceptance_criteria>
    - `grep "nextCookies" src/lib/auth/server.ts` shows it as the LAST plugin.
    - Route handler sets `runtime = "nodejs"`.
    - Google before-hook references `appEnv.staffEmailDomain`.
    - `npm run typecheck` clean.
  </acceptance_criteria>
</task>

<task id="T5" type="auto">
  <name>T5: Rewrite getUserContext to read the Better Auth session (the chokepoint)</name>
  <read_first>
    - src/lib/auth.ts (current Supabase-based getUserContext/requireUserContext/requireEditor)
    - src/lib/constants.ts:122 (resolveDashboardAccessRole — drops app_metadata path)
    - src/lib/supabase/admin.ts (admin client for profiles read/link)
    - src/lib/api/with-auth.ts (consumes UserContext — keep signature stable)
  </read_first>
  <action>
    Rewrite `src/lib/auth.ts` `getUserContext()`:
    - `const session = await auth.api.getSession({ headers: await headers() })` (from `next/headers`).
    - No session → unauthenticated ctx `{ userId: null, email: null, profile: null, role: "viewer", canEdit: false }` (preserves guest paths).
    - Session present → resolve profile via the Supabase ADMIN client (server-only; RLS already gone): `select * from profiles where auth_user_id = session.user.id`. If none, AUTO-LINK: `update profiles set auth_user_id = session.user.id where lower(email) = lower(session.user.email) and auth_user_id is null returning *`. If still none → authenticated-but-no-profile: return `{ userId: session.user.id, email, profile: null, role: "viewer", canEdit: false, hasAccess: false }`.
    - Role now derives SOLELY from `profiles.role` (app_metadata is gone). Update the `resolveDashboardAccessRole` call to pass `appMetadata: null` (or simplify the helper to `profileRole ?? "viewer"`); collaborator now lives in `profiles.role` directly.
    - `canEdit` per existing role rules. Keep `requireUserContext`/`requireEditor` semantics; add a `requireAccess()` that redirects to `/no-access` when authenticated-but-no-profile.
    Keep `UserContext` shape backward-compatible (add `hasAccess` boolean). All guards (`with-auth.ts`, layout, actions) keep working unchanged because they consume `getUserContext`.
  </action>
  <acceptance_criteria>
    - `src/lib/auth.ts` imports `auth` from `@/lib/auth/server` and `next/headers`; no `@/lib/supabase/auth-session` import remains.
    - Profile resolved by `auth_user_id`; auto-link-by-email path present.
    - Authenticated-but-no-profile yields `hasAccess: false` (not a thrown crash).
    - `npm run typecheck` clean; Phase 2 guard tests still pass.
  </acceptance_criteria>
</task>

<task id="T6" type="auto">
  <name>T6: Middleware swap + /no-access gating</name>
  <read_first>
    - middleware.ts, src/lib/supabase/middleware.ts (current Supabase session refresh + route gating)
    - src/lib/constants.ts (isDashboardPathAllowedForRole, getDefaultDashboardHrefForRole)
  </read_first>
  <action>
    Replace Supabase `updateSession` with Better Auth cookie-presence gating. In `middleware.ts` (or a new `src/lib/auth/middleware.ts`): use Better Auth's `getSessionCookie(request)` (optimistic, no DB) to decide: unauthenticated request to a protected path → redirect to `/login`; keep public paths (`/login`, `/api/auth/*`, guest `mi-jornada` + its allowed AI routes per existing guest rules, static assets) open. Do NOT do role/DB checks in middleware — that stays in `getUserContext`/layout. Keep the existing matcher. Remove `src/lib/supabase/middleware.ts` usage.
    Create `src/app/(auth)/no-access/page.tsx`: server component; reads `getUserContext()`; if `hasAccess` is true redirect to default dashboard; else render a dead-end card showing `context.email` + a logout control (client button calling `authClient.signOut()` then redirect to `/login`). The dashboard layout/guards redirect authenticated-but-no-profile users here.
  </action>
  <acceptance_criteria>
    - `middleware.ts` no longer imports `@/lib/supabase/middleware`.
    - Unauthenticated protected request → 307 to `/login`; guest mi-jornada path still reachable.
    - `/no-access` shows the logged-in email + logout; profile-less users are routed here, not into the dashboard.
  </acceptance_criteria>
</task>

<task id="T7" type="auto">
  <name>T7: Login UI — Google + magic link (remove password flows)</name>
  <read_first>
    - src/app/(auth)/login/page.tsx (current Supabase password form)
    - src/app/actions/auth.ts (loginAction, requestPasswordResetAction, updatePasswordAction)
    - src/lib/auth/client.ts (T4)
  </read_first>
  <action>
    Rewrite `(auth)/login/page.tsx` to render a new client component `login-form-client.tsx`: a "Sign in with Google" button → `authClient.signIn.social({ provider: "google", callbackURL: "/grid" })`; an email input + "Email me a magic link" → `authClient.signIn.magicLink({ email, callbackURL: "/grid" })` then show a "check your inbox" confirmation state. Surface domain-reject + send errors inline. Keep the existing visual shell/branding.
    DELETE `(auth)/forgot-password/`, `(auth)/reset-password/`, `src/app/auth/confirm/route.ts`. Strip `loginAction`/`requestPasswordResetAction`/`updatePasswordAction` and all Supabase-auth imports from `src/app/actions/auth.ts` (delete the file if nothing authenticated remains; update importers).
  </action>
  <acceptance_criteria>
    - Login page offers exactly Google + magic-link; no password field anywhere.
    - forgot-password, reset-password, auth/confirm removed; no dangling imports (`npm run typecheck` clean).
    - `grep -rn "signInWithPassword\|resetPasswordForEmail" src/` returns nothing.
  </acceptance_criteria>
</task>

<task id="T8" type="auto">
  <name>T8: Provisioning + revoke rewrite (People page) + platform-access</name>
  <read_first>
    - src/app/actions/people.ts:240-315 (grant access: createUser + temp password + profile insert)
    - src/lib/data/platform-access.ts (personHasPlatformAccess via supabase admin listUsers)
    - src/app/actions/people.ts revokeCollaboratorAccessByEmail
  </read_first>
  <action>
    Replace the Supabase `auth.admin.createUser`/`updateUserById` + temp-password + `sendCollaboratorSetupEmail` path with: upsert a `profiles` row keyed by a NEW uuid (gen) with `{ email, role: <chosen role incl. "collaborator">, auth_user_id: null }` (role written DIRECTLY into `profiles.role` — no more `bp_access_role` metadata). Send `sendCollaboratorInviteEmail({ to: email, loginUrl: ${appUrl}/login })`. No password, no auth user created — first login auto-links (T5).
    Rewrite `personHasPlatformAccess(email)` to read `profiles` by `lower(email)` and return whether the row's role is `collaborator` (or whatever access predicate the page needs) — drop the supabase admin `listUsers` scan.
    Rewrite revoke: delete the `profiles` row by email (and optionally revoke active Better Auth sessions for that user via the admin plugin). Update the guard `requireAdminAccessManager` usage as needed (unchanged signature).
  </action>
  <acceptance_criteria>
    - Granting access creates an email+role `profiles` row, no auth user, no temp password; an invite email is sent via the Workspace mailer.
    - `grep -rn "bp_access_role\|auth.admin.createUser\|temporaryPassword" src/` returns nothing.
    - `personHasPlatformAccess` reads profiles directly; revoke removes the profiles row.
    - `npm run typecheck` clean.
  </acceptance_criteria>
</task>

<task id="T9" type="auto">
  <name>T9: Remove residual Supabase Auth surface (cutover) + role-resolution cleanup</name>
  <read_first>
    - src/lib/supabase/auth-session.ts (getSupabaseUserSafely), src/lib/supabase/server.ts, src/lib/supabase/middleware.ts
    - grep for remaining auth.getUser / auth.signOut / supabase.auth usage
    - src/lib/constants.ts (getRoleFromAppMetadata / resolveDashboardAccessRole)
  </read_first>
  <action>
    Sweep and remove every remaining Supabase *Auth* call (`supabase.auth.getUser`, `getSession`, `signOut`, `auth.admin.*` for identity) from app code; keep `@supabase/supabase-js` server/admin clients ONLY for domain-table reads/writes. Delete `src/lib/supabase/auth-session.ts` and `src/lib/supabase/middleware.ts` if now unused. Simplify `resolveDashboardAccessRole`/`getRoleFromAppMetadata` to drop the `app_metadata` path (role = `profiles.role`). Wire logout everywhere to `authClient.signOut()` (or the server `auth.api.signOut`). `@supabase/ssr` stays only if still used for domain data; otherwise remove.
  </action>
  <acceptance_criteria>
    - `grep -rn "supabase.auth\.\|getSupabaseUserSafely\|app_metadata" src/` returns nothing (domain DB clients remain).
    - Logout uses Better Auth.
    - `npm run check` (lint + typecheck + test + build) green.
  </acceptance_criteria>
</task>

<task id="T10" type="checkpoint:human-action" gate="blocking-human">
  <name>T10: Apply migration 0011 + end-to-end verification</name>
  <read_first>
    - supabase/migrations/0011_*.sql
    - 03-CONTEXT.md (success criteria)
  </read_first>
  <how-to-verify>
    1. Apply 0011 to the live DB (psql, pooler aws-1-sa-east-1). Confirm both admin emails backfilled, `auth_user_id` null, FK/trigger dropped.
    2. Set env (Google creds, SMTP app password, BETTER_AUTH_SECRET). `npm run dev`.
    3. Staff Google login (wences/pablo @basquetpass.tv) → auto-links to existing admin profile by email, lands on /grid as admin. Confirm `profiles.auth_user_id` now stamped.
    4. Non-domain Google account → rejected (domain hook).
    5. Magic-link login for a NEW external email with no profile → email arrives via Workspace SMTP, click → authenticated → /no-access dead-end (shows email + logout).
    6. Admin grants that email access on People page (role collaborator) → external re-logs (session may persist) → now has collaborator access; mi-jornada reachable.
    7. Guest (no session) → mi-jornada still works; a guarded AI route 401s without session; guest AI route rate-limits.
    8. Perform a domain write (edit a match) → `audit_log.changed_by` non-NULL (app stamping holds; CUT-01).
    9. Logout → session cleared, back to /login.
  </how-to-verify>
  <acceptance_criteria>
    - All 9 checks pass. Both admins retain admin via auto-link; externals gated by profiles; guest mode intact; non-NULL actor on writes.
  </acceptance_criteria>
  <resume-signal>Type "verified" or describe failures.</resume-signal>
</task>

</tasks>

<threat_model>
| Threat | Disposition | Mitigation |
|--------|-------------|------------|
| Email-spoofed auto-link to an admin profile | mitigate | Both login methods yield a VERIFIED email (Google domain-verified; magic link requires inbox control). No email/password path exists (D-08). |
| Non-staff Google account reaching staff surface | mitigate | Server-side domain check in the create/sign-in before-hook (D-07); `profiles` still gates (no domain auto-provision, D-11). |
| Profile-less authenticated user reaching the dashboard | mitigate | `hasAccess:false` → forced /no-access; layout/guards redirect (D-13). |
| SMTP app-password leak | accept/operator | Stored as env only; dedicated low-priv sender mailbox; rotate if leaked. |
| Authenticated PostgREST window (carried from Phase 2 / D-01) | accept | Closes at Phase 6 cutover of Supabase JWTs; internal tool, time-bounded. |
</threat_model>

<verification>
- `npm run check` green (lint + typecheck + Phase 2 guard/stamping tests + build).
- `grep -rn "supabase.auth\.\|signInWithPassword\|bp_access_role\|app_metadata" src/` → empty.
- `nextCookies()` is the last Better Auth plugin; route handler is Node runtime.
- T10 operator sign-off (9 checks).
</verification>

<success_criteria>
- Better Auth is portal's only auth; Supabase Auth fully removed; Supabase Postgres retained for domain data.
- Staff Google (domain-restricted) + external magic link (Workspace SMTP); no passwords.
- profiles authorizes by email→auth_user_id; auto-link on first login; profiles.id stable; no-access dead-end for the unprovisioned.
- Roles/section gating enforced by existing app-layer guards via the rewritten getUserContext.
- Guest mi-jornada intact; post-cutover writes record non-NULL actor.
</success_criteria>

<output>
Single commit at phase end (one-commit-per-phase). Write `03-SUMMARY.md` when T10 is signed off; then update ROADMAP/STATE (Phase 3 complete) and proceed to Phase 6.
</output>
