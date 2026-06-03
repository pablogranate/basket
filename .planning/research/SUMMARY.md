# Research Summary: Basket-App Unified Auth

**Synthesized:** 2026-06-03 · **Confidence:** HIGH (user-count + live hash format MEDIUM until prod DB inspected)
**Sources:** Better Auth official docs (https://better-auth.com/llms.txt), analytics reference impl (`../data-bp`), this repo's code + migrations.

See `STACK.md` (how to build it) and `PITFALLS.md` (what breaks) for detail.

## The Shape (confirmed feasible)

One shared Better Auth identity DB on the company-server Postgres. Each app runs its own `/api/auth/[...all]` config against the **same** `user/session/account/verification` tables, with **identical `BETTER_AUTH_SECRET`**, `advanced.crossSubDomainCookies = { enabled: true, domain: ".basket-app.com" }`, and explicit `trustedOrigins`. Sessions are DB-backed → any subdomain validates the cookie token against the shared `session` table. **No separate auth server needed.**

## Recommended Stack (portal)

- **Better Auth ^1.6.x** + `drizzleAdapter` (provider `pg`) over **postgres-js**, new `AUTH_DATABASE_URL` → company-server Postgres. Coexists with the unchanged Supabase JS client (domain data).
- Route handler with `runtime = "nodejs"`; `nextCookies()` plugin **last**; `magicLink` plugin for external collaborators; `admin` plugin optional; **no** `organization` plugin (roles stay per-app).
- Login methods in one instance: **Google** (staff) + **email/password and/or magic link** (externals). Per-app access gating lives in each app's `require*` layer — **never** in shared identity `databaseHooks` (analytics' domain-lock would otherwise block portal externals).
- Middleware = optimistic `getSessionCookie` redirect only (docs: "NOT SECURE"); real authz in RSC/server-action guards.
- Auth DB placement: dedicated **`basket_auth` database** (fallback: dedicated schema) on the existing instance.

## Watch Out For (top risks)

1. **RLS is the *real* authz layer today, not redundant.** Verified open-on-RLS-drop paths: all `api/ai/*` routes (no guard), `api/matches/intake` (no auth/secret at all), and `(dashboard)/people` already reads via the service-role admin client. Dropping RLS opens these simultaneously → **guard-coverage audit + tests must land before Supabase Auth is removed.**
2. **Don't re-key `profiles`.** `profiles.id` (uuid) is an FK target across many domain tables and `audit_log.changed_by`. Better Auth ids are `text`/new. **Add `auth_user_id text` link column; keep `profiles.id` stable.** Drop the `profiles.id → auth.users(id)` FK and `on_auth_user_created` trigger (the `auth` schema disappears).
3. **DB triggers stamp `auth.uid()`** into `created_by`/`changed_by` → silently NULL after swap, blanking audit. **Move actor stamping to the app layer.**
4. **Password hashes don't transfer as-is.** Supabase GoTrue = **bcrypt**; Better Auth default = **scrypt**. Reuse requires overriding `emailAndPassword.password.verify` with `bcrypt.compare` (else `Invalid password hash`). Cleaner for externals: **magic-link re-onboard.** Decision needs live user count + activity.
5. **Migration field map** (official Supabase guide): `encrypted_password → account.password` (`providerId:"credential"`), `email_confirmed_at → emailVerified`, Google identity → `account` (`providerId:"google"`, `accountId: identity_data.sub`). Reuse Supabase `user.id` as Better Auth `user.id` so the `profiles.auth_user_id` link aligns.
6. **Analytics must be updated, not just copied** — its current config sets none of the cross-subdomain pieces (secret/domain/trustedOrigins). Account linking: avoid `trustedProviders:["google"]` (takeover risk); carry `emailVerified`.

## Suggested Phase Ordering (for roadmap)

1. **Stand up shared `basket_auth` DB** — schema, migrations, Drizzle connection.
2. **RLS removal + guard-coverage audit** (the gate) — guard every data path, move actor stamping app-side, tests; must complete before Supabase Auth is removed.
3. **Portal Better Auth wiring** — server/client/route/middleware, Google + non-Google, per-app access gate against `profiles` (linked, not re-keyed).
4. **User migration** (highest risk — flag for deeper research) — inspect prod hash format + counts, bcrypt-verify-override OR magic-link reset, verify on a DB copy.
5. **Cutover** — remove Supabase Auth, gated on a verified login for one migrated password user + one Google staff user.
6. **Analytics repoint + end-to-end SSO validation** across portal + analytics.

## Open Questions (resolve in phase research)

- Exact prod count of email/password vs OAuth-only Supabase users + live hash format → drives migrate-vs-reset.
- `trustedOrigins` wildcard support undocumented → list origins explicitly.
- Optional: retain RLS as defense-in-depth via per-request GUC (`app.current_user_id`) instead of pure app-layer — fallback, adds plumbing.
- Final placement of portal's access table (Supabase domain DB vs auth DB).
