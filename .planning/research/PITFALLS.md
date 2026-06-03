# Pitfalls Research

**Domain:** Migrating `portal.basket-app.com` off Supabase Auth onto a shared Better Auth identity DB, dropping Postgres RLS in favor of app-layer guards, with cross-subdomain SSO across `*.basket-app.com`.
**Researched:** 2026-06-03
**Confidence:** HIGH (claims grounded in this repo's code + Better Auth official docs; user-count/hash-format items are MEDIUM pending live inspection)

> Scope note: This is specific to THIS migration. The single most dangerous fact about this codebase is that **RLS is currently the real backstop** — middleware only redirects, it does not authorize by role; some routes have *no* in-handler guard at all and lean entirely on RLS (`CONCERNS.md` confirms this for the AI routes). When `auth.uid()` disappears and you switch to the service-role-style trusted connection, **every one of those RLS backstops silently evaporates at once.** The guard-coverage audit below is the load-bearing work of this milestone.

---

## Critical Pitfalls

### Pitfall 1: Dropping RLS turns every unguarded read into a data leak (the backstop disappears silently)

**What goes wrong:**
Today Postgres RLS is the *actual* authorization layer. `middleware.ts` → `updateSession` only redirects unauthenticated users and bounces logged-in users off `/login`; it does **not** restrict dashboard routes by role (`CONCERNS.md` "MEDIUM — Authorization is enforced only in middleware + server actions, not centrally per route by role"). Reads are gated by `can_read()` = `auth.role() = 'authenticated'` and writes by `can_edit()` / `current_app_role()` in the DB. Once you (a) remove Supabase Auth, `auth.uid()`/`auth.role()` return NULL/`anon`, so **either every RLS policy denies everything (app breaks) or you connect with a trusted role that bypasses RLS (every unguarded query now returns/writes everything).** The realistic outcome is the latter: portal connects to Supabase Postgres with a service-role/privileged connection and RLS becomes a no-op. Any code path that didn't already call a `require*` guard is now an open door.

**Why it happens:**
The team assumes "the guards already exist" because actions like `matches.ts`/`people.ts`/`roles.ts` call `requireEditor()`. But several paths never did, because RLS covered them:
- **All four AI routes** (`api/ai/metric-capture|section|people|speedtest`) call no guard in-handler (verified: `grep` returns NONE). Two are explicitly guest-whitelisted in middleware.
- `api/matches/intake/route.ts` has **no auth check and no shared-secret token at all** (verified: no `getUserContext`/token/secret in the file) — it relied on... nothing, plus whatever RLS the service path used.
- **Read data loaders** (`src/lib/data/dashboard.ts`, `announcements.ts`, `collaborators.ts`) use `createSupabaseServerClient()` and lean on `can_read()` RLS for row protection, not explicit role checks.
- `app_settings` SELECT is gated only by `can_read()`, which is why **any authenticated user can read the Gemini secret today** (`CONCERNS.md` CRITICAL). Drop RLS without app-layer replacement and that secret is readable by *anyone who can reach the query*, not just authenticated users.

**How to avoid:**
1. **Build a guard-coverage inventory before touching auth.** Enumerate every DB entry point and assign a required role. Concrete audit method:
   - Every file matching `createSupabaseServerClient|createSupabaseAdminClient` (current set: `actions/{auth,matches,people,roles,settings}.ts`, `api/collaborator-reports`, `(auth)/reset-password/page.tsx`, `lib/auth.ts`, `lib/data/{announcements,collaborators,dashboard}.ts`, `lib/settings.ts`, `(dashboard)/people/page.tsx`) must, for each query, be traceable to a `require*` call that runs *before* the query.
   - Every `route.ts` under `src/app/api/*` must start with an explicit session+role check. Today the audit shows `grid/calendar` only calls `getUserContext` (no role enforcement), AI routes call nothing, `matches/intake` calls nothing.
2. **Make the safe path the default.** Introduce a `withAuth(role, handler)` wrapper for API routes (recommended in `CONCERNS.md`) and a `requireViewer()`/`requireRole()` for read loaders so that a forgotten guard *fails closed*, not open.
3. **Do NOT drop the RLS policies in the same change that swaps auth.** Keep RLS DDL in place (harmless once `auth.uid()` is gone if you connect as a role RLS still applies to — but you won't) OR, better, **keep RLS as defense-in-depth by giving the portal a dedicated Postgres role and writing a session GUC** (see Pitfall 4 alternative). Decoupling lets you roll back auth without re-enabling DB policies.
4. **Add automated guard tests** (the repo has zero tests — `CONCERNS.md`). At minimum: a test asserting each API route returns 401/403 without a session and 403 for under-privileged roles; a test asserting a non-admin cannot read `app_settings.secret_value`.

**Warning signs:**
- A new `route.ts` or data loader compiles and works in dev (where you're logged in as admin) but was never tested with a viewer/collaborator/anonymous caller.
- `grep` for `createSupabase*` returns a file that does not also contain a `require*` call above the query.
- The phrase "RLS will catch it" appears in review.

**Phase to address:** **Phase: RLS removal + guard audit** (this is the gating phase — it must complete and be test-covered before Supabase Auth is removed in production).

---

### Pitfall 2: The service-role/anon key becomes a master key once RLS is off — and it can leak into client bundles

**What goes wrong:**
Today `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS but is narrowly used (`admin.ts`, CSV importer, and — notably — `(dashboard)/people/page.tsx` and `actions/people.ts`). The anon key is "safe" precisely *because* RLS constrains it. After dropping RLS:
- The **anon key is no longer safe** — if portal queries Supabase with a connection that ignores RLS, the anon key (which is `NEXT_PUBLIC_*` and therefore shipped to the browser) could read/write everything if a client component ever instantiated a privileged client.
- The **service-role key is now used for ordinary reads** in at least `(dashboard)/people/page.tsx` (verified: imports `createSupabaseAdminClient` for a page render). That page already bypasses RLS — an anti-pattern called out in `ARCHITECTURE.md`. Post-migration, *more* code will reach for the admin client because the user-scoped client no longer self-limits, multiplying the blast radius of a single missing guard.

**Why it happens:**
"RLS is gone, so I need the service client to read anything" is the natural but wrong conclusion. Developers replace `createSupabaseServerClient()` with `createSupabaseAdminClient()` wholesale to make queries work again, converting every read into an unauthenticated superuser read.

**How to avoid:**
1. **Keep exactly one privileged DB access module, `server-only`.** `admin.ts` already has `import "server-only"` — preserve that and add it to any new module. Verify the production client bundle never contains the service-role key: add a CI grep over `.next` output / a build-time assertion that `SUPABASE_SERVICE_ROLE_KEY` never appears in client chunks.
2. **Refactor `(dashboard)/people/page.tsx` off the admin client during this milestone.** It is the clearest existing RLS-bypass read; with RLS gone it must instead go through an app-layer-guarded loader. Treat it as the canary for the new pattern.
3. **Decide the post-RLS Supabase connection model explicitly** (Pitfall 4). If you keep the anon key + RLS-with-GUC, the anon key stays meaningfully scoped. If you go pure-service-role, document that the service key is now equivalent to root and must never be referenced outside `server-only` modules.
4. **Rotate keys after the migration** and after fixing the `app_settings` secret-read bug — old keys may have been logged or shared while RLS was the safety net.

**Warning signs:**
- New imports of `createSupabaseAdminClient` outside `actions/` and `server-only` jobs.
- Any client component (`"use client"`) importing a Supabase client that isn't the browser anon client.
- The diff replaces `createSupabaseServerClient` with `createSupabaseAdminClient` to "fix" a broken query.

**Phase to address:** **Phase: RLS removal + guard audit** (same phase — key/connection model is part of the RLS decision).

---

### Pitfall 3: Cross-subdomain session cookie not recognized across `portal.` / `analytics.`

**What goes wrong:**
A user logs into analytics, navigates to portal, and is treated as logged out (or vice-versa). Or login works in production but never in local dev. SSO across `*.basket-app.com` requires *all* of these to line up, and missing any one silently breaks recognition:
- `advanced.crossSubDomainCookies.enabled: true` and `advanced.crossSubDomainCookies.domain: "basket-app.com"` (root domain, no leading dot needed by Better Auth's config; it emits `Domain=.basket-app.com`). The analytics reference `server.ts` does **not** set this today (it only sets `useSecureCookies` and a single `trustedOrigins` entry) — so analytics must be updated as part of the "repoint analytics" work, not just portal.
- **Identical `BETTER_AUTH_SECRET`** across every app. Different secrets → each app issues cookies the other can't verify → session silently unrecognized. Analytics reads `process.env.BETTER_AUTH_SECRET`; portal must use the *same value*, not just the same variable name.
- **Shared session table.** SSO here is DB-backed (Better Auth default is a DB session, not a stateless JWT). All apps must point their Drizzle adapter at the *same* `session`/`user`/`account`/`verification` tables on the company-server Postgres. If portal creates its own copies, sessions won't resolve cross-app.
- **`trustedOrigins`** must list all three subdomains (`https://portal.basket-app.com`, `https://analytics.basket-app.com`, and incidencias for forward-compat) in every app, or CSRF/origin checks reject cross-origin auth calls.
- **Secure cookie attribute.** Better Auth makes cookies `Secure` in production; on `http://localhost` a `Secure` cookie is dropped. Conversely you cannot share a cookie across true subdomains on localhost (you'd need `*.localhost` or `/etc/hosts` aliases like `portal.basket-app.local`).

**Why it happens:**
Each app is configured independently and the four requirements (secret, table, cookie-domain, trustedOrigins) are set in four different places. The analytics reference predates SSO and is missing the cross-subdomain config, so copying it verbatim produces a non-SSO setup that "works" single-app and fails cross-app — the failure only shows when you actually hop subdomains.

**How to avoid:**
1. Centralize the SSO-critical config in a shared module both apps import (secret, cookie domain, trustedOrigins list, DB client) so they cannot drift.
2. Set `advanced.crossSubDomainCookies = { enabled: true, domain: "basket-app.com" }` in **both** portal and analytics; update analytics' `server.ts` in this milestone.
3. Verify SSO with an explicit cross-subdomain test: log in on analytics, hit a portal page, confirm `auth.api.getSession` resolves — in a staging environment that actually uses real subdomains, not localhost.
4. For local dev, set up subdomain aliases (`portal.basket-app.local`, `analytics.basket-app.local` in `/etc/hosts`) and `useSecureCookies: false` in dev so the shared-cookie path is exercised before prod.

**Warning signs:**
- `getSession` returns null on one app while the cookie is visibly present in DevTools (secret mismatch or table mismatch).
- Cookie `Domain` attribute shows the full subdomain (`portal.basket-app.com`) instead of `.basket-app.com`.
- It works in prod but never locally, or vice-versa (Secure attribute / localhost subdomain issue).

**Phase to address:** **Phase: SSO cookie/session config** (shared secret + cookie domain + trustedOrigins + analytics repoint).

---

### Pitfall 4: One shared user table, but each app's gate must NOT lock out the other app's users

**What goes wrong:**
Analytics' `server.ts` enforces a hard domain lock in **two** database hooks: `user.create.before` throws if the email isn't `@basquetpass.tv` *and* on the `auth_allowed_emails` list, and `session.create.before` throws for any user not on that allowlist. With a **shared user table**, these hooks run against the *same rows* portal creates. The failure modes:
- A portal external collaborator (e.g. `freelancer@gmail.com`) signs up via portal → exists in the shared `user` table → tries to use analytics, or analytics' `session.create.before` fires for them on some shared flow → **analytics throws "not on allowlist," but if the hook is evaluated app-agnostically it can block the portal user entirely.**
- Worse: if portal naively copies analytics' `user.create.before` domain-lock, **portal can never onboard a non-Google external collaborator** — the very requirement that forced a non-Google path.
- The `databaseHooks` in Better Auth are configured **per Better Auth instance**, but they execute against the **shared DB**. If analytics' instance handles a sign-in for a user, *its* hooks apply; the danger is shared/generic hooks or a shared instance.

**Why it happens:**
"We share one user table" gets mentally extended to "we share one auth config." Authorization gating (allowlist, domain lock) is identity-adjacent and easy to put in the wrong layer (the shared user-creation hook) instead of the per-app authorization layer (portal's `profiles`, analytics' `auth_allowed_emails`).

**How to avoid:**
1. **Keep identity creation permissive; keep authorization per-app.** The shared `user.create.before` hook should do the minimum (or nothing that rejects). Each app gates access in *its own* table at request time:
   - Portal: gate via rekeyed `profiles` (does this user have a portal role row?) inside `requireUserContext()`.
   - Analytics: keep `auth_allowed_emails` check, but move the *hard reject* out of a shared `session.create.before` and into analytics' own `requireSession`/`requireRole` (it already has `rbac.ts` with `requireSession`) so it only blocks the analytics app, not the user globally.
2. If you must keep gating in `databaseHooks`, ensure each app runs its **own** Better Auth instance with **app-specific** hooks, and that no hook performs a *global* reject that another app's users will hit. Specifically, analytics' `session.create.before` domain-lock must not fire for portal-only users — scope it so a missing allowlist entry only denies analytics access, not session creation.
3. Decide where the Google `hd` domain hint vs. real enforcement lives per app. Portal's Google sign-in (for staff) should still be allowed to create users for external-but-invited emails through a different path (magic link / email+password), so portal must NOT use analytics' domain-locked `user.create.before`.

**Optional defense-in-depth (RLS retention):** If you want to keep RLS alive across the swap, give portal a dedicated Postgres role and set a per-request GUC (`SET LOCAL app.current_user_id = '<betterauth user id>'`) at the start of each transaction, then rewrite policies to read `current_setting('app.current_user_id')` instead of `auth.uid()`. This preserves the backstop and avoids the all-or-nothing service-role model — at the cost of threading the GUC through the Supabase client (non-trivial with `@supabase/supabase-js`; may require `postgres.js`/Drizzle for guarded queries). Evaluate in the audit phase; the app-layer-only path is the chosen default but this is the safest fallback.

**Warning signs:**
- A portal external user can log into portal but is mysteriously logged out or rejected with an "allowlist" message.
- Analytics' `isEmailAllowed` / `session.create.before` appears in portal's config.
- A single Better Auth instance shared between apps.

**Phase to address:** **Phase: SSO cookie/session config** + **Phase: portal auth config & gates** (per-app gate separation).

---

### Pitfall 5: User migration — Supabase GoTrue password hashes are not Better Auth hashes

**What goes wrong:**
Existing portal users authenticate today via `supabase.auth.signInWithPassword` (`actions/auth.ts`). Supabase GoTrue stores password hashes as **bcrypt** in `auth.users.encrypted_password`. Better Auth's default email/password hashing is **scrypt** (its own format), stored in `account.password`. If you copy users into the Better Auth `user` table and leave `account.password` empty (or copy the bcrypt string raw), **every existing email/password user is locked out** — exactly the "no lockout" constraint being violated.

**Why it happens:**
The migration script copies `auth.users` → Better Auth `user`/`account` and assumes the password column is portable. It isn't: different algorithms and different serialization formats.

**How to avoid:**
1. **First, count and classify users.** (Decision is explicitly deferred to research in `PROJECT.md`.) Query Supabase `auth.users`: how many have `encrypted_password` (email/password) vs. only an OAuth identity? `PROJECT.md` notes user overlap is low and user count is small — if it's a handful of staff, the simplest safe path is **forced password reset / migrate-to-Google**, not hash porting.
2. If hash porting is required, use Better Auth's **custom password hashing** (`emailAndPassword.password.{hash, verify}`) to verify against bcrypt on first login, then optionally rehash to scrypt. This keeps existing passwords working. Confirm the exact GoTrue hash format from a live `auth.users` row before committing to this — bcrypt cost factor and prefix (`$2a$`/`$2b$`) matter.
3. For Google/staff users, **don't migrate passwords at all** — they re-authenticate via Google SSO; just ensure the `user.email` matches so account linking resolves (Pitfall 7).
4. Provide a **"forgot password" bridge**: even if porting fails for some users, the email/magic-link reset path must be live *before* Supabase Auth is removed, so no one is stranded.

**Warning signs:**
- Migration script copies `encrypted_password` into `account.password` verbatim.
- No live inspection of the actual GoTrue hash format before choosing an approach.
- Email/password login tested only with newly-created Better Auth users, never with a migrated one.

**Phase to address:** **Phase: user migration** (must inspect hash format + user count first; gate Supabase-Auth removal on a verified login for at least one migrated user of each type).

---

### Pitfall 6: Re-keying `profiles` from Supabase `auth.users.id` to Better Auth user id orphans all domain data

**What goes wrong:**
`profiles.id` is `uuid` and is a **PK that FKs from every domain table's `created_by`/`updated_by`/`owner_id`/`reporter_profile_id`** (verified across `0001`, `0007`, `0009`: `people.created_by → profiles.id`, `matches.owner_id → people.id`, `collaborator_reports.reporter_profile_id → profiles.id`, `audit_log.changed_by → profiles.id`, etc.). Better Auth's `user.id` is a **`text`** id (analytics schema: `id: text('id').primaryKey()`), not a uuid, and is generated by Better Auth — it will **not** equal the old Supabase uuid. If you create fresh Better Auth users and point `profiles` at the new ids without remapping, every `created_by`/`reporter_profile_id` reference breaks: audit history detaches, "my reports" by reporter id return nothing, collaborator report ownership is lost.

**Why it happens:**
Two id systems (Supabase uuid vs. Better Auth text id) and a `profiles` table that is both the authorization record *and* the FK target for authored-by/owned-by columns across the whole schema. The audit trigger also stamps `auth.uid()` into `changed_by` — that function is gone post-migration, so the trigger itself must change too (see Pitfall 8).

**How to avoid:**
1. **Preserve a stable mapping.** Build a `supabase_uid → betterauth_user_id` map during migration and keep it (a temp column on `profiles` like `legacy_supabase_id`). Then **rewrite all FK references** in domain tables from old uuid to new id in a single transaction, OR keep `profiles.id` = the old uuid and store the Better Auth id separately (`profiles.auth_user_id`), so domain FKs never move.
2. **Strongly prefer the second approach** (keep `profiles.id` stable; add `auth_user_id text` linking to Better Auth `user.id`). It means *zero* changes to the dozens of domain FKs and audit rows. `requireUserContext` then resolves Better Auth session → `user.id` → `profiles` row via `auth_user_id`. This is far lower risk than re-keying.
3. Note `profiles.id references auth.users(id) on delete cascade` and the `on_auth_user_created`/`handle_new_user` trigger on `auth.users` — both reference Supabase's `auth` schema, which won't exist for the new auth. **Drop the FK to `auth.users` and the trigger**; replace auto-provisioning with the app-layer `getUserContext` insert that already exists (`auth.ts` lines 68–86) keyed by `auth_user_id`.
4. Run the migration against a **restored copy** of the Supabase DB first and assert referential integrity (no orphaned `reporter_profile_id`, audit history intact) before doing it live.

**Warning signs:**
- Migration plan changes `profiles.id` values.
- After cutover, "my reports" / audit "changed by" show blanks or wrong users.
- `profiles.id references auth.users(id)` FK still present (will error — `auth.users` no longer maintained).

**Phase to address:** **Phase: user migration** (schema rekey/link design + integrity verification on a DB copy).

---

### Pitfall 7: Account linking — same email via Google AND password causes takeover or duplicate accounts

**What goes wrong:**
A staff member exists from Supabase migration as an email/password user (`maria@basquetpass.tv`), then signs in with Google using the same email. Two outcomes, both bad if mishandled:
- **Duplicate user rows** for the same human (Google account not linked to the password account) → two `profiles`, split history, "why do I have no permissions" tickets.
- **Account takeover**: Better Auth's `accountLinking.trustedProviders` auto-links a provider *without* email-verification confirmation. If portal lists Google as trusted *and* a password account was created from an unverified/imported email, an attacker controlling a Google account for that address could link into the existing account.

**Why it happens:**
`accountLinking.enabled` defaults to `true`. Teams either (a) add `trustedProviders: ["google"]` for UX (skip verification) and inadvertently weaken takeover protection, or (b) set `allowDifferentEmails`/misconfigure so linking doesn't happen and duplicates pile up. Migrated password accounts may have `emailVerified: false`, interacting badly with linking rules.

**How to avoid:**
1. **Rely on the default verified-email linking, not `trustedProviders`.** Better Auth's default only auto-links when the provider confirms the email as verified (Google does). Avoid `trustedProviders: ["google"]` unless you accept the documented takeover risk.
2. **Set migrated email/password users' `emailVerified` correctly.** Supabase tracks `email_confirmed_at`; carry that into Better Auth `user.emailVerified` so Google-linking-to-verified works as intended and unverified imported accounts aren't auto-claimed.
3. Keep `allowDifferentEmails: false` (default) so linking is keyed on matching email.
4. Decide deliberately whether portal staff should use *both* methods or be steered to Google only (external users get email/password / magic link). Fewer methods per user = fewer linking edge cases.

**Warning signs:**
- Two `user` rows with the same email after a Google login.
- `trustedProviders: ["google"]` in portal config without a security sign-off.
- Migrated users have `emailVerified: false` across the board.

**Phase to address:** **Phase: portal auth config & gates** (accountLinking config) + **Phase: user migration** (carry `emailVerified`).

---

### Pitfall 8: Audit/metadata triggers call `auth.uid()` — they break or write NULL after the swap

**What goes wrong:**
`set_row_metadata()` sets `created_by/updated_by = auth.uid()` and `log_audit_event()` writes `changed_by = auth.uid()` (both in `0001`, applied to people/roles/matches/assignments/collaborator_reports/club_contacts/app_settings). After Supabase Auth is gone, `auth.uid()` returns NULL (or errors if the `auth` schema/function is removed). Result: **all new audit entries and metadata stamps record NULL author** — the audit trail (a real feature surfaced in `src/lib/audit.ts`) silently goes blank, and you won't notice because writes still succeed.

**Why it happens:**
The auth swap focuses on the app layer; the DB triggers are out of sight and still reference the old auth context that no longer exists.

**How to avoid:**
1. Stop relying on `auth.uid()` in triggers. Two options: (a) **pass the actor id from the app layer** — have actions/loaders set the `created_by`/`changed_by` columns explicitly (the app already knows the user via `requireUserContext`), and simplify triggers to not call `auth.uid()`; or (b) set a per-request GUC (`app.current_user_id`) and change triggers to `current_setting('app.current_user_id', true)::uuid`.
2. Since `profiles` is being re-linked (Pitfall 6), make the actor id the **`profiles.id`** the app resolves, written explicitly on insert/update.
3. Add a post-cutover check: query `audit_log` for `changed_by IS NULL` on recent rows — should be empty.

**Warning signs:**
- Audit UI shows "—" / blank for the user on all post-migration changes.
- `changed_by IS NULL` rows appear after cutover.
- Trigger DDL still contains `auth.uid()`.

**Phase to address:** **Phase: RLS removal + guard audit** (triggers are part of the same DB-auth-decoupling change).

---

### Pitfall 9: Logout doesn't propagate across subdomains; guest `mi-jornada` mode breaks under the new gate

**What goes wrong:**
- **Logout:** `signOutAction` today calls `supabase.auth.signOut()`. With a shared DB session and a `.basket-app.com` cookie, signing out of portal must invalidate the **shared session row** so analytics also logs out (and the cookie, scoped to the parent domain, must be cleared with the same domain attribute). If portal only clears its local cookie or deletes a per-app session, the user stays logged into analytics — a security surprise for shared/staff machines.
- **Guest mode:** `ALLOW_GUEST_MI_JORNADA` whitelists `/mi-jornada`, `/api/ai/metric-capture`, `/api/ai/section` for *unauthenticated* users in `middleware.ts`. The new middleware (Better Auth `getSession`) must preserve this anonymous path, and the AI routes (which have no in-handler auth) must keep working for guests **without** becoming an open Gemini-cost faucet (already a CONCERNS.md HIGH/cost issue).

**Why it happens:**
Logout is treated as a local cookie clear; the cross-subdomain + DB-session model means there are now two things to invalidate (DB row + parent-domain cookie). Guest mode is an existing special case easy to forget when rewriting middleware around a new session API.

**How to avoid:**
1. Use Better Auth's sign-out (`auth.api.signOut`) which deletes the DB session row; ensure the session cookie is cleared with `Domain=.basket-app.com` so it's gone for all subdomains. Test: log into both apps, log out of portal, confirm analytics is also logged out.
2. Re-implement the guest allowlist in the new middleware explicitly, and **carry over the security caveats**: the AI guest endpoints need rate limiting / abuse protection (CONCERNS.md) — this milestone is the moment to add at least basic guarding since you're rewriting the middleware anyway.
3. Confirm the `app_settings` Gemini-secret-read bug is fixed *before* the guest path can reach AI routes without RLS protecting that secret.

**Warning signs:**
- Logging out of one subdomain leaves the other authenticated.
- After migration, guest `/mi-jornada` redirects to login (allowlist lost) or, conversely, guests can hit arbitrary API routes.

**Phase to address:** **Phase: SSO cookie/session config** (logout propagation) + **Phase: RLS removal + guard audit** (guest route guarding + secret fix).

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Replace `createSupabaseServerClient` with `createSupabaseAdminClient` everywhere to "make queries work" after RLS drop | Fast green build | Every read/write is now superuser; one missing guard = full data breach | Never |
| Copy analytics' domain-locked `user.create.before` into portal | Reuse working code | Permanently blocks external collaborators (violates core requirement) | Never |
| Skip the legacy uid→new-id mapping, create fresh users | Simpler migration script | Orphans all `created_by`/`reporter_profile_id`/audit history | Never |
| Port bcrypt hashes raw into `account.password` | Avoid forced resets | Every existing email/password user locked out | Never |
| Keep guest AI routes unguarded (as today) | No rewrite | Open Gemini-cost endpoint with no RLS backstop | Never (must add rate limit this milestone) |
| Ship without guard tests | Faster milestone | Privilege escalation / open routes ship undetected (repo has zero tests) | Only if a manual guard-coverage matrix is reviewed and signed off |
| Use a single shared Better Auth instance for both apps | Less config | Per-app gates collide; one app's allowlist blocks the other's users | Never — one instance per app against the shared DB |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Better Auth cross-subdomain | Setting `crossSubDomainCookies.domain` on portal only | Set it (and identical secret + shared session table + trustedOrigins) on portal AND analytics; update analytics' existing config |
| Better Auth secret | Same env var name, different value per app | Same literal `BETTER_AUTH_SECRET` value everywhere; centralize in shared config |
| Supabase as plain Postgres | Assuming anon key is still "safe" | Anon key is only safe under RLS; once RLS is off, treat all DB access as privileged and keep it `server-only` |
| Supabase `auth.users` FK/trigger | Leaving `profiles.id references auth.users(id)` and `on_auth_user_created` | Drop the cross-schema FK + trigger; provision profiles in app layer keyed by Better Auth id |
| Google OAuth | Relying on `hd` hint for domain enforcement | `hd` is only a UI hint; enforce in app-layer gate (analytics already documents this in `server.ts`) |
| Gemini key in `app_settings` | Reading via RLS-only `can_read()` | Fix to admin-only read BEFORE dropping RLS, else any reachable query exposes it; pass key via `x-goog-api-key` header |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Per-request `getSession` + role lookup on every page/middleware hit | Extra DB round-trips per request to company-server Postgres | Cache session in the request; Better Auth supports cookie session data / `secondaryStorage` (Redis) if needed | Noticeable cross-region latency since auth DB is separate from portal's Supabase |
| Two Postgres connections per request (Supabase domain DB + company-server auth DB) | Connection pool exhaustion under load | Pool both; keep auth lookups minimal (one session resolve + one profile read) | Higher concurrency / serverless cold pools |
| Unguarded guest AI routes | Gemini quota/cost spikes | Add rate limiting (already a CONCERNS.md gap) during the middleware rewrite | Any guest abuse or leaked endpoint |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Removing RLS without app-layer guard on every path | Full read/write data exposure (the backstop is gone) | Guard-coverage audit + fail-closed `withAuth` wrapper + tests |
| Service-role key reachable from client bundle | Master key leak → total DB compromise | Keep `server-only`; CI assertion key not in `.next` client chunks; rotate after migration |
| `app_settings.secret_value` readable by any session (existing bug) | Gemini API key exfiltration; worse once RLS gone | Restrict read to admin in app layer; move secret out of client-reachable read; rotate key |
| `trustedProviders: ["google"]` for account linking | Account takeover via Google for imported/unverified emails | Use default verified-email linking; set migrated `emailVerified` correctly |
| Cross-app gate in shared `session.create.before` | One app's allowlist locks the other app's legitimate users out globally | Per-app gate in each app's `requireSession`/`requireUserContext`, not in shared identity hooks |
| Logout clears only local cookie | Shared-machine user stays logged into sibling app | Delete shared DB session + clear `.basket-app.com` cookie |
| API routes relying on middleware only | Any new/forgotten route is unprotected (AI routes prove this) | Mandatory in-handler `require*`/`withAuth`; don't trust middleware for authorization |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Forced password reset with no warning at cutover | Staff confused, support tickets | Communicate; provide Google SSO as the primary staff path so most never hit a reset |
| External collaborator hits a Google-only login | Can't get in at all | Ensure non-Google path (email/password or magic link) is live and discoverable before removing Supabase Auth |
| Guest `mi-jornada` silently requires login post-migration | Field collaborators blocked mid-event | Preserve the guest allowlist explicitly in new middleware; test it |
| Logged out of analytics unexpectedly when leaving portal | Surprise/annoyance | Document SSO logout behavior; make it intentional and consistent |

## "Looks Done But Isn't" Checklist

- [ ] **RLS removal:** Often missing a guard on read loaders (`lib/data/*`) and API routes — verify every `createSupabase*` call site has a `require*` above it AND a test for 401/403.
- [ ] **Service-role isolation:** Often missing client-bundle check — verify `SUPABASE_SERVICE_ROLE_KEY` never appears in `.next` client chunks and `(dashboard)/people/page.tsx` no longer uses the admin client.
- [ ] **Cross-subdomain SSO:** Often missing on analytics side — verify `crossSubDomainCookies` + identical secret + shared session table on BOTH apps, tested by hopping subdomains on real (not localhost) domains.
- [ ] **User migration:** Often missing a verified login for a *migrated* user — verify at least one migrated email/password user AND one Google staff user can log in before Supabase Auth is removed.
- [ ] **Profile re-link:** Often missing FK integrity check — verify no orphaned `created_by`/`reporter_profile_id`, audit history intact, on a restored DB copy.
- [ ] **Audit triggers:** Often missing — verify `audit_log.changed_by` is populated (not NULL) on post-cutover writes; trigger DDL no longer references `auth.uid()`.
- [ ] **Account linking:** Often missing `emailVerified` carry-over — verify Google sign-in links to the migrated account instead of creating a duplicate.
- [ ] **Logout:** Often missing cross-app invalidation — verify logout on portal also logs out analytics.
- [ ] **`app_settings` secret:** Often left as the existing RLS-only read — verify non-admin cannot read `secret_value` via app layer after RLS is gone; key rotated.
- [ ] **Guest AI routes:** Often missing rate limiting — verify guest endpoints can't be abused for Gemini cost.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Unguarded path discovered post-cutover (data leak) | HIGH | Rotate keys immediately; add the guard; audit access logs; the absence of structured logging (CONCERNS.md) makes forensics hard — add logging first |
| Existing users locked out (hash mismatch) | MEDIUM | Trigger bulk password-reset emails / enable Google SSO; keep Supabase Auth running in parallel until verified (don't hard-cut) |
| Orphaned domain data (bad id rekey) | HIGH | Restore from the pre-migration backup; re-run migration with the `auth_user_id`-link approach instead of rekeying PKs |
| SSO cookie not recognized | LOW | Align secret + cookie domain + session table; redeploy both apps |
| Cross-app gate blocking legitimate user | LOW | Move the reject from shared identity hook into the app-specific guard |
| Audit author NULL | MEDIUM | Fix triggers/app-layer stamping going forward (historical NULLs are unrecoverable — accept gap, document cutover timestamp) |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1. RLS drop → unguarded paths open | RLS removal + guard audit | Guard-coverage matrix complete; 401/403 tests pass for every route/loader |
| 2. Service-role/anon key as master key | RLS removal + guard audit | Key absent from client bundle; admin client confined to `server-only`; people page refactored |
| 3. Cross-subdomain cookie not recognized | SSO cookie/session config | Login on analytics resolves session on portal (real subdomains) |
| 4. Shared user table, colliding per-app gates | SSO config + portal auth config & gates | Portal external user works on portal; not blocked by analytics allowlist |
| 5. Password hash incompatibility | User migration | A migrated email/password user logs in successfully |
| 6. Profile rekey orphans data | User migration | No orphaned FKs / audit intact on restored DB copy |
| 7. Account linking takeover/duplicates | Portal auth config & gates + user migration | Google sign-in links to existing account; no duplicate user rows; no `trustedProviders` without sign-off |
| 8. Triggers using `auth.uid()` | RLS removal + guard audit | `audit_log.changed_by` populated post-cutover; no `auth.uid()` in DDL |
| 9. Logout/guest mode breakage | SSO config + RLS removal + guard audit | Cross-app logout works; guest `mi-jornada` works; guest AI routes rate-limited |

## Sources

- This repo (HIGH): `supabase/migrations/0001_initial.sql` (RLS policies, `auth.uid()` triggers, `can_read/can_edit`), `0007`/`0008`/`0009` (FK targets, `app_settings` secret read), `src/lib/auth.ts`, `src/lib/auth-access.ts`, `src/lib/supabase/{server,admin,middleware,auth-session}.ts`, `middleware.ts`, `src/app/actions/auth.ts`, `src/app/api/**/route.ts`; `.planning/codebase/{ARCHITECTURE,CONCERNS,INTEGRATIONS}.md`; `.planning/PROJECT.md`.
- Analytics reference (HIGH): `../data-bp/src/lib/auth/{server,schema,rbac,getSessionUser}.ts` (Better Auth + Drizzle, domain-lock hooks, `text` user id, `auth_allowed_emails`).
- Better Auth official docs (HIGH): Cookies — `advanced.crossSubDomainCookies.{enabled,domain}`, `useSecureCookies`, `trustedOrigins`, prod-only Secure cookies (https://www.better-auth.com/docs/concepts/cookies). Users & Accounts — `account.accountLinking.{enabled(default true),trustedProviders,allowDifferentEmails,allowUnlinkingAll}`, verified-email default linking and takeover caveat (https://www.better-auth.com/docs/concepts/users-accounts).
- Better Auth concepts referenced (MEDIUM, TOC-level via https://better-auth.com/llms.txt): `databaseHooks` (user.create.before / session.create.before), `emailAndPassword.password.{hash,verify}` for custom hashing, custom ID / migration, session storage.
- Supabase GoTrue password hashing = bcrypt in `auth.users.encrypted_password` (MEDIUM, training data — verify against a live row before relying on it for the hash-port path).

---
*Pitfalls research for: Supabase→Better-Auth migration with RLS drop + cross-subdomain SSO (basket-app portal)*
*Researched: 2026-06-03*
