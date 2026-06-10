# Phase 03: Portal Better Auth Wiring - Context

**Gathered:** 2026-06-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Portal swaps its authentication from Supabase Auth to **Better Auth as the sole auth provider**, running against the shared `basket_auth` DB built in Phase 1. Staff log in with Google (Workspace-restricted); external collaborators log in via magic link. Access is authorized by portal's own `profiles` table (linked by email), preserving all existing roles. Supabase Postgres remains the **domain** database (matches, people, profiles, audit) — only Supabase *Auth* is removed.

**SCOPE EXPANSION (decided this discussion):** Phase 3 **fully owns the cutover**. By end of phase, Supabase Auth is entirely gone — there is no dual-run window. This pulls the old Phase 5 ("remove Supabase Auth") forward and collapses the old Phase 4 ("user migration") into "the 2 existing admins re-login via Google and auto-link." See **D-01** and the roadmap-impact note in `<deferred>`.

</domain>

<decisions>
## Implementation Decisions

### Session Ownership & Cutover Scope
- **D-01:** Better Auth is the **sole** auth provider as of Phase 3. No dual-run, no parallel Supabase-Auth fallback. `getUserContext()` is rewritten to read the Better Auth session only. Justification: only **2 real users** exist (both `@basquetpass.tv` admins), so a migration/cutover bridge is pure ceremony.
- **D-02:** Phase 3 performs the **full cutover**. Remove all Supabase *Auth* surface: the `@supabase/ssr` cookie-auth client usage for sessions, middleware Supabase session refresh (`src/lib/supabase/middleware.ts`), `src/app/auth/confirm/route.ts`, and the `(auth)/forgot-password` + `(auth)/reset-password` pages. **Supabase Postgres stays** for all domain data (the `@supabase/supabase-js` admin/server clients for tables remain).
- **D-03:** Old Phases 4 (User Migration) and 5 (Cutover) are **collapsed** — their substance is absorbed here. ROADMAP.md needs editing to reflect this (see `<deferred>`).

### Identity ↔ Profile Linking
- **D-04:** Link key is **email**. Add two columns to `profiles`: `email` (the durable human identifier) and `auth_user_id` (the Better Auth user id, nullable until first login). `profiles.id` **stays unchanged** — it is an FK target for `audit_log.changed_by`, `matches.created_by`, etc. (STATE.md lock: link, do not re-key).
- **D-05:** **Backfill the 2 existing emails now** (`pablo.granate@basquetpass.tv`, `wences.capolo@basquetpass.tv`) into `profiles.email` from `auth.users` while Supabase Auth still holds them — this must happen before Supabase Auth is removed.
- **D-06:** **Auto-link on first login** — when a Better Auth session's `auth_user.email` matches a `profiles.email` row with null `auth_user_id`, stamp `auth_user_id`. Works identically for Google and magic-link logins. Safe because both methods yield a **verified** email.

### Login Methods
- **D-07:** **Staff → Google**, restricted to the `basquetpass.tv` Workspace domain. Enforce server-side (verify the email domain in the sign-in/account hook — the Google `hd` hint alone is spoofable, not sufficient).
- **D-08:** **External collaborators → magic link only.** **No email/password anywhere** in the system. (Reuses Phase 1's `magicLink` plugin support — no new table; `auth_verification` already present.)
- **D-09:** **Sessions are long-lived** (~60-day sliding/refresh-on-use) so magic-link is a once-per-device-occasionally action, not per-visit. This is the answer to repeat-login friction — the system, not any admin, sends the link automatically on request.
- **D-10:** Account linking: a same-email Google + magic-link identity links to one `auth_user` (no duplicate). **No `trustedProviders` shortcut** (roadmap-locked) — linking relies on verified email, which both methods guarantee.

### Authorization & Provisioning
- **D-11:** **No auto-provisioning by domain.** `profiles` strictly authorizes; Google/magic-link only authenticate. A `@basquetpass.tv` Google login with no `profiles` row gets **no access** (criterion 3: gated by the access table, *not* a domain allowlist).
- **D-12:** **Admin pre-provisions every user** (staff and collaborators) on the People page: create a `profiles` row with `email` + `role`, no password, no pre-created auth user. This adapts the existing grant-access flow (`src/app/actions/people.ts`) — replace the Supabase `auth.admin.createUser` + temp-password path with an email+role profile row; the user self-serves their first magic-link/Google login and auto-links (D-06). No self-signup.
- **D-13:** **Denied-access UX:** an authenticated user with no matching `profiles` row lands on a **"No access — ask an administrator" dead-end page** showing the email they logged in with (so they can tell the admin which to add) plus a Logout button. Session is kept; the page is a hard stop.

### Email Delivery
- **D-14:** **Google Workspace SMTP** sends ALL transactional email (magic links + collaborator invites). Implementation: `nodemailer` over `smtp.gmail.com:587` (STARTTLS), authenticated with an **app password** on a dedicated Workspace sender mailbox (e.g. `noreply@basquetpass.tv`). One mailer module is shared by Better Auth's `magicLink.sendMagicLink` and the collaborator-invite flow. NOTE: the app currently has **no** email sender — today's "email" is borrowed from Supabase Auth's `resetPasswordForEmail` (`people.ts:45`), which disappears at cutover, so this mailer must be wired before/with magic link.
  - **App-password SMTP auth, NOT Workspace SMTP-relay** — relay restricts by sender IP and Netlify egress IPs are dynamic; username+app-password auth works from any IP. Requires 2-Step Verification on the sender mailbox to mint the app password. Volume is well under Gmail's ~2,000 msg/day cap.
  - **Setup prerequisite (operator):** create/choose the sender mailbox, enable 2FA, generate the app password; provide sender address + app password as env at execution.
  - **Env:** `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER` (sender mailbox), `SMTP_PASS` (app password), `MAIL_FROM` — surfaced through `appEnv` with an assert guard, matching the established env pattern.

### Claude's Discretion
- Cross-subdomain SSO groundwork (`.basket-app.com` cookie domain, identical `BETTER_AUTH_SECRET`, `trustedOrigins`) is **Phase 6** scope. Phase 3 may lay minimal env-based groundwork (host-only cookie in dev, env-driven domain) to avoid a session-invalidating change later, but full SSO + analytics repoint stays in Phase 6.
- Exact Better Auth config file layout, route-handler path (`/api/auth/[...all]`), middleware rewrite shape, `nextCookies()` ordering, and `getUserContext()` internals — planner/executor decide within roadmap criteria (Node runtime, `nextCookies()` last).
- Refreshing `profiles.full_name` from the Google profile name on first staff login (current values are email local-parts) — optional nicety.
- Revoke-access flow under Better Auth (mirror of D-12: remove the `profiles` row and/or null `auth_user_id`, optionally revoke active sessions) — planner detail.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project decisions & roadmap
- `.planning/PROJECT.md` — milestone goal, unified-auth constraints (shared secret, `.basket-app.com` cookie domain, Better Auth ^1.6.11).
- `.planning/ROADMAP.md` §"Phase 3" — success criteria (Node runtime, `nextCookies()` last, no `trustedProviders`, guest mi-jornada preserved). NOTE: needs editing per D-03.
- `.planning/REQUIREMENTS.md` — PAUTH-01..05.
- `.planning/STATE.md` — lock: link `profiles` via `auth_user_id`, not re-keyed.

### Phase 1 auth foundation (build on, do not re-create)
- `.planning/phases/01-shared-identity-database/01-CONTEXT.md` — D-05/D-06 table mapping (`auth_user`/`auth_session`/`auth_account`/`auth_verification`), D-07 baked plugin columns (admin + magicLink).
- `src/lib/auth/schema.ts` — Drizzle pgTable defs for the auth tables (has `role` on `auth_user`).
- `src/lib/db/auth-client.ts` — `authDb` Drizzle/postgres-js client (`prepare: false`).
- `drizzle/auth/0000_careful_iron_lad.sql` — applied auth schema migration.

### Current auth to replace
- `src/lib/auth.ts` — `getUserContext`/`requireUserContext`/`requireEditor`, role resolution (rewrite to Better Auth session).
- `src/lib/auth-access.ts` — `requireAdminAccessManager`.
- `src/lib/constants.ts` — `resolveDashboardAccessRole`, `isCollaboratorLimitedRole`, role/section gating (must keep working post-swap).
- `src/lib/supabase/middleware.ts`, `middleware.ts` — session refresh + route gating (rewrite to Better Auth).
- `src/app/actions/people.ts` — grant/revoke platform access (adapt per D-12), `sendCollaboratorSetupEmail` (D-14).
- `src/lib/data/platform-access.ts` — `personHasPlatformAccess` (rewrite off Supabase admin listUsers).
- `src/app/(auth)/login`, `(auth)/forgot-password`, `(auth)/reset-password`, `src/app/auth/confirm/route.ts`, `src/app/actions/auth.ts` — login UI + Supabase auth routes (replace/remove).
- `src/lib/api/with-auth.ts` — guard HOF from Phase 2 (must resolve Better Auth ctx).

### Better Auth & email
- Skill: `better-auth-best-practices` (server/client config, adapters, plugins, env).
- Better Auth ^1.6.x docs — admin plugin schema (D-08 Phase 1), magicLink, Google social provider + `hd`/domain verification, account linking, Next.js handler + `nextCookies()`.
- `nodemailer` docs — Gmail SMTP transport with app password (`smtp.gmail.com:587`, STARTTLS).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `authDb` + `src/lib/auth/schema.ts` (Phase 1) — the Better Auth instance plugs straight into these; tables already migrated.
- `with-auth.ts` guard HOF + ctx pattern (Phase 2) — keep the guard surface; only the session source changes.
- `resolveDashboardAccessRole` + role/section constants — role model is unchanged; reuse as-is.
- People-page grant-access action — adapt rather than rewrite (D-12).

### Established Patterns
- `appEnv` accessor in `src/lib/env.ts` with `assert*` guards — add SMTP creds (`SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS`/`MAIL_FROM`), Google OAuth creds, `BETTER_AUTH_SECRET`/`BETTER_AUTH_URL` here.
- `server-only` isolation for privileged clients (`admin.ts`, `auth-client.ts`).
- Phase 2 already moved authorization fully app-side + added guard-coverage tests — Better Auth ctx must satisfy the same guards.

### Integration Points
- `getUserContext()` is the single identity chokepoint — rewrite it to read the Better Auth session and resolve `profiles` by `auth_user_id`; everything downstream (layout, actions, guards) keeps working.
- Root `middleware.ts` — swap Supabase session refresh for a Better Auth session check + route gating.
- `/api/auth/[...all]` — new Better Auth route handler (Node runtime).

</code_context>

<specifics>
## Specific Ideas

- Both existing users are admins on `@basquetpass.tv`; `basquetpass.tv` is a Google Workspace domain (staff Google login is viable and domain-verifiable).
- `profiles.full_name` currently holds email local-parts (`wences.capolo`), not display names.
- `profiles.id == auth.users.id` today and is FK'd across domain tables — must remain stable.

</specifics>

<deferred>
## Deferred Ideas

- **ROADMAP edit (action needed):** collapse Phases 4 & 5 into Phase 3. Phase 3 success criteria should gain the cutover items (Supabase Auth fully removed; both admins verified-login). Recommend running `/gsd-phase` to edit ROADMAP.md before/after planning. Until then, planner should treat PAUTH-01..05 + full cutover as Phase 3 scope.
- **Cross-subdomain SSO** (`.basket-app.com` shared cookie + `trustedOrigins`) and **analytics repoint** — stay in Phase 6.
- **Guest `mi-jornada`** (criterion 5 / PAUTH-05): unauthenticated guest mode + its rate-limited AI routes must keep working after the swap. Not a decision — a preserved constraint the planner must verify.

</deferred>

---

*Phase: 03-portal-better-auth-wiring*
*Context gathered: 2026-06-10*
