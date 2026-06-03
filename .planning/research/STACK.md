# Stack Research — Better Auth Integration + Cross-Subdomain SSO

**Domain:** Shared identity (Better Auth) across `*.basket-app.com`; portal migration off Supabase Auth; analytics repoint to shared auth DB
**Researched:** 2026-06-03
**Confidence:** HIGH (config/APIs verified against current Better Auth docs ^1.6.x; password-migration mechanics verified against the official Supabase migration guide; reference impl read from `../data-bp`)

---

## TL;DR (for roadmap)

1. **SSO is cookie + shared-secret + shared-DB.** Set identical `BETTER_AUTH_SECRET`, enable `advanced.crossSubDomainCookies` with `domain: ".basket-app.com"`, list every subdomain in `trustedOrigins`, and point every app's Drizzle adapter at the **same** auth Postgres (same `user/session/account/verification` tables). Sessions are DB-backed; any app validates a session by reading the shared `session` table from the cookie token. No extra "SSO server" needed.
2. **Portal runs Better Auth (Drizzle/postgres → company-server auth DB) ALONGSIDE the existing Supabase JS client (→ Supabase cloud, domain data).** Two separate DB connections, two separate concerns. Mirror analytics' file layout exactly.
3. **Portal enables BOTH `socialProviders.google` (staff) AND `emailAndPassword` and/or `magicLink` (external collaborators)** in one instance. The per-app access gate moves from analytics' domain allowlist into a portal-specific `databaseHooks` check against portal's own access table — NOT domain-locked.
4. **Password-hash migration: NOT directly compatible by default.** Supabase GoTrue stores **bcrypt** (`$2a$`/`$2b$`); Better Auth defaults to **scrypt**. You CAN reuse Supabase hashes — but only by overriding `emailAndPassword.password.verify` with bcrypt. This is the officially documented path. Without it you get `BetterAuthError: Invalid password hash` (issue #4762).
5. **Auth DB placement: separate database (or dedicated schema) on the company-server Postgres**, distinct from analytics' domain tables. Recommend a **dedicated database** for clean ownership; a dedicated schema is acceptable if a separate DB is operationally costly.

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `better-auth` | `^1.6.11` | Auth framework across all apps | Already the proven choice in analytics (`../data-bp`); same version pins the SSO contract (cookie/secret/session schema) across apps |
| `drizzle-orm` | `^0.45.2` | Typed access to the auth DB from portal | Matches analytics; Better Auth's first-class adapter is `drizzleAdapter` |
| `drizzle-kit` | `^0.31.1` | Generate/apply auth-table migrations | Same as analytics; or use Better Auth CLI (`@better-auth/cli migrate`) |
| `postgres` (postgres-js) | `^3.4.5` | Driver for the company-server auth DB | Matches analytics' `src/shared/db/client.ts`; use `prepare: false` |
| `@supabase/supabase-js` / `@supabase/ssr` | `^2.98` / `^0.9` | UNCHANGED — portal domain data (cloud) | Stays for domain reads/writes; only Supabase **Auth** is dropped |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `better-auth/next-js` → `nextCookies()`, `toNextJsHandler` | (bundled) | Next.js cookie handling + route handler | REQUIRED. `nextCookies()` MUST be the **last** plugin in the array so server-action `Set-Cookie` works |
| `better-auth/plugins` → `magicLink` | (bundled) | Passwordless login for external collaborators | If chosen over (or alongside) email/password — no password storage to migrate |
| `better-auth/client/plugins` → `magicLinkClient` | (bundled) | Client counterpart to `magicLink` | Pair with server `magicLink` plugin |
| `bcrypt` + `@types/bcrypt` | latest | Verify migrated Supabase password hashes | REQUIRED **only if** importing existing email/password users (see migration section) |
| `better-auth/plugins` → `admin` | (bundled) | Optional: user banning, impersonation, role field helpers | Consider for portal user management UI; NOT required for the role model |
| `better-auth/cookies` → `getSessionCookie` | (bundled) | Optimistic middleware redirect | Edge middleware coarse gate (NOT a security boundary) |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `@better-auth/cli` | `npx @better-auth/cli generate` / `migrate` | Generates the Drizzle schema + applies auth tables; alternative to hand-writing schema. Run against the auth DB only |
| Drizzle migrations | Auth-only `drizzle.config.ts` | Separate config/schema path so auth migrations never touch domain tables |

## Installation

```bash
# Portal — add auth stack (keep existing Supabase deps)
pnpm add better-auth drizzle-orm postgres
pnpm add -D drizzle-kit @types/pg

# Only if migrating existing email/password users (verify legacy bcrypt hashes)
pnpm add bcrypt
pnpm add -D @types/bcrypt

# Optional plugins are bundled in `better-auth` — no extra install
```

---

## 1. Cross-subdomain SSO — concrete mechanics

**Mental model:** identity is global, authorization is per-app. SSO works because all apps share (a) the same signing `secret`, (b) a cookie scoped to the parent domain, and (c) the same DB-backed `session` table. There is NO separate identity server — each app's `/api/auth/[...all]` handler reads/writes the same tables.

### Shared config every participating app must have

```typescript
// src/lib/auth/server.ts (portal AND analytics)
export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,          // per-app, e.g. https://portal.basket-app.com
  secret: process.env.BETTER_AUTH_SECRET,        // IDENTICAL across all apps — load-bearing
  trustedOrigins: [
    "https://portal.basket-app.com",
    "https://analytics.basket-app.com",
    "https://incidencias.basket-app.com",        // pre-add for the future app
    // include http://localhost:3000 etc. for dev as needed
  ],
  database: drizzleAdapter(db /* shared auth DB */, {
    provider: "pg",
    schema: { user: authUser, session: authSession, account: authAccount, verification: authVerification },
  }),
  advanced: {
    crossSubDomainCookies: { enabled: true, domain: ".basket-app.com" },
    useSecureCookies: process.env.NODE_ENV === "production",
    // Optional hardening if you hit cross-site nav issues:
    // defaultCookieAttributes: { sameSite: "lax", secure: true },
  },
  plugins: [/* magicLink(...), admin(...) as needed, */ nextCookies()], // nextCookies LAST
});
```

**Verified facts (HIGH):**
- `advanced.crossSubDomainCookies = { enabled: true, domain: "example.com" }` is the exact documented key. Setting `domain` to the root (use leading dot `.basket-app.com` for "all subdomains") makes the cookie readable across subdomains.
- `trustedOrigins` is an explicit array of origins. **No documented wildcard guarantee** — list each subdomain explicitly (treat any `"*.basket-app.com"` form as unverified; LOW confidence). This protects sign-in/callback CSRF and OAuth redirect validation.
- `secret` MUST be identical — it signs the session token in the cookie. Different secrets = each app rejects the other's cookie.
- Sessions are **DB-backed by default**: the cookie carries the session token; any app resolves it via `auth.api.getSession` which hits the shared `session` table. This is exactly why pointing all apps' Drizzle adapter at the same DB yields SSO with no extra wiring.
- `useSecureCookies` forces `Secure`; otherwise secure-only-in-production. Keep `true` in prod (required for cross-subdomain over HTTPS).

**What MUST match across apps for SSO:** `secret`, cookie `domain`, the `session`/`user` tables (same physical DB), and cookie prefix (leave default unless you intentionally set `advanced.cookiePrefix`). If any app sets a custom `cookiePrefix`, ALL must set the same one or `getSessionCookie` in middleware won't find the cookie.

**Analytics repoint:** change analytics' `DATABASE_URL` (or a dedicated `AUTH_DATABASE_URL`) so its Drizzle adapter targets the shared auth DB, add `crossSubDomainCookies` + the full `trustedOrigins` list + the shared `secret`. Its existing tables (`auth_user/session/account/verification`) become the shared tables (or migrate analytics' rows into them).

---

## 2. Better Auth + Supabase coexisting in one Next.js 16 app

Two independent DB connections. Supabase JS = domain data (cloud). Drizzle/postgres = auth (company server). They never share a client.

### File layout (mirror analytics)

```
src/lib/auth/server.ts      # betterAuth({...}) — server-only
src/lib/auth/client.ts      # createAuthClient({...}) — browser
src/lib/auth/schema.ts      # Drizzle pgTable defs for user/session/account/verification
src/lib/auth/getSessionUser.ts  # getSession + portal role lookup
src/lib/auth/rbac.ts        # requireUser/requireEditor/requireAdmin* (replaces auth.uid()-era guards)
src/lib/db/auth-client.ts   # NEW: postgres-js → company-server auth DB (separate from Supabase)
src/app/api/auth/[...all]/route.ts   # toNextJsHandler(auth); runtime = "nodejs"
```

### Auth DB connection (separate from Supabase) — model on `data-bp/src/shared/db/client.ts`

```typescript
// src/lib/db/auth-client.ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as authSchema from "@/lib/auth/schema";

const globalForDb = globalThis as unknown as { authConn?: ReturnType<typeof postgres> };
function build() {
  const url = process.env.AUTH_DATABASE_URL;        // company-server auth DB — NOT the Supabase URL
  if (!url) throw new Error("AUTH_DATABASE_URL not set");
  return postgres(url, { max: Number(process.env.AUTH_DB_POOL_MAX ?? 10), prepare: false });
}
export const authConn = globalForDb.authConn ?? build();
if (process.env.NODE_ENV !== "production") globalForDb.authConn = authConn;
export const authDb = drizzle(authConn, { schema: authSchema });
```

### Route handler

```typescript
// src/app/api/auth/[...all]/route.ts
import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth/server";
export const runtime = "nodejs";                    // Better Auth + postgres need Node, not edge
export const { GET, POST } = toNextJsHandler(auth);
```

### getSession in RSC (replaces Supabase `getUser()`)

```typescript
// src/lib/auth/getSessionUser.ts
import { headers } from "next/headers";
import { auth } from "./server";
export async function getSessionUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;
  // join to portal's own access table (rekeyed `profiles`) for role + section access
  // using the SUPABASE client (domain DB) OR a dedicated portal access store — your choice
  return session.user; // + resolved portal role
}
```

### Middleware (optimistic gate only)

```typescript
// middleware.ts
import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
export function middleware(req: NextRequest) {
  const cookie = getSessionCookie(req);             // presence check only — NOT validation
  if (!cookie) return NextResponse.redirect(new URL("/login", req.url));
  return NextResponse.next();
}
```

**Verified facts (HIGH):**
- RSC session: `auth.api.getSession({ headers: await headers() })` — exact documented call.
- Middleware: docs explicitly warn `getSessionCookie` is an **optimistic** presence check — "THIS IS NOT SECURE." Real authorization stays in RSC/server actions via the `require*` guards. This matches the milestone decision to enforce in the app layer after dropping RLS.
- `runtime = "nodejs"` on the route handler (and avoid running Better Auth DB calls on the edge runtime). Portal's current Supabase session-refresh middleware logic must be **replaced** by this optimistic cookie check; session refresh is handled by Better Auth itself, not middleware.

**Important coexistence note:** portal currently refreshes Supabase sessions in `src/lib/supabase/middleware.ts`. Once Supabase Auth is removed, that refresh disappears; keep the Supabase client only as a plain DB client (anon/service-role) for domain data. Authorization no longer flows through `auth.uid()`/RLS.

---

## 3. Multiple login methods in one instance (portal)

Portal enables Google AND a non-Google path. Per-app gate via `databaseHooks` — but checking portal's access table, NOT a `@basquetpass.tv` domain lock.

```typescript
export const auth = betterAuth({
  // ...shared SSO config from §1...
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    requireEmailVerification: false,          // decide per UX
    // sendResetPassword: async ({ user, url, token }) => { /* email */ },
    // password: { hash, verify }  // ONLY for migration — see §4
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    },
  },
  plugins: [
    magicLink({                                // OPTIONAL alternative/addition for externals
      sendMagicLink: async ({ email, token, url }, ctx) => { /* send email */ },
    }),
    nextCookies(),                             // LAST
  ],
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          // PORTAL gate: do NOT domain-lock. Allow staff (google) + provisioned externals.
          // Check portal access table; assign default role/section access.
          // Throwing here aborts signup. Returning { data } replaces payload.
          return { data: user };
        },
      },
    },
    session: {
      create: {
        before: async (session) => {
          // Optional: block sessions for users without an active portal access row.
          return { data: session };
        },
      },
    },
  },
});
```

**Verified facts (HIGH):**
- `magicLink({ sendMagicLink: async ({ email, token, url, metadata }, ctx) => {} })` — exact signature. Client: `magicLinkClient()`, sign-in via `authClient.signIn.magicLink({ email, callbackURL })`.
- `emailAndPassword` options `enabled`, `minPasswordLength` (default 8), `requireEmailVerification`, `sendResetPassword({ user, url, token })`, `autoSignIn` — all documented.
- `databaseHooks.user.create.before` returning `false` aborts; returning `{ data }` replaces payload. Analytics uses this for its domain allowlist; portal replaces that logic with an access-table check (per the "identity global, authorization per-app" decision).

**Recommendation:** Prefer **magic link** for external collaborators over email/password if you do NOT need to migrate existing Supabase passwords — it sidesteps the bcrypt/scrypt issue entirely and removes password-storage burden. If existing collaborators already have passwords and you want zero-friction continuity, use email/password WITH the bcrypt verify override (§4).

---

## 4. Migrating Supabase Auth users → Better Auth

### Password-hash compatibility — DEFINITIVE ANSWER

**Supabase GoTrue uses bcrypt (`$2a$`/`$2b$`). Better Auth defaults to scrypt. They are NOT interchangeable as-is.** Importing a bcrypt hash into the `account.password` column and leaving the default scrypt verifier produces `BetterAuthError: Invalid password hash` (GitHub issue #4762).

**BUT you can reuse the existing bcrypt hashes** — the official Supabase migration guide documents exactly this by overriding the verifier:

```typescript
import bcrypt from "bcrypt";
export const auth = betterAuth({
  emailAndPassword: {
    enabled: true,
    password: {
      hash:   async (password) => bcrypt.hash(password, 10),       // new signups → bcrypt too
      verify: async ({ hash, password }) => bcrypt.compare(password, hash), // verify migrated hashes
    },
  },
});
```

So: **YES, migratable without forcing resets — IF you set `password.verify` to bcrypt.** Tradeoff: doing so makes ALL portal passwords bcrypt (you lose Better Auth's default scrypt for new users). That is acceptable and is what the guide recommends. Alternative if you'd rather standardize on scrypt: skip hash import and use a **reset/invite flow** (or magic link) for external users.

### What the Better Auth tables expect

| Table | Required fields | Notes |
|-------|-----------------|-------|
| `user` | `id`, `name`, `email`, `emailVerified`, `createdAt`, `updatedAt` (`image` optional) | `emailVerified` is boolean — map from Supabase `email_confirmed_at IS NOT NULL` |
| `account` | `id`, `userId`, `accountId`, `providerId`, `createdAt`, `updatedAt`; optional `password`, tokens | For email/password: `providerId = "credential"`, `accountId = user.id`, `password = encrypted_password`. For Google: `providerId = "google"`, `accountId = identity_data.sub` |
| `session` | `id`, `userId`, `token`, `expiresAt`, `createdAt`, `updatedAt` (`ipAddress`, `userAgent` optional) | Don't migrate Supabase sessions — users re-login once |
| `verification` | `id`, `identifier`, `value`, `expiresAt`, ... | No migration needed |

### Bulk import approach (from official guide)

1. Read Supabase `auth.users` (`id, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at`) and `auth.identities` (`provider, identity_data, provider_id`).
2. Insert into Better Auth `user` (id→id, email→email, `emailVerified` from `email_confirmed_at`, name from metadata).
3. For users with `encrypted_password`: insert `account` row `{ providerId: "credential", accountId: user.id, password: encrypted_password }`.
4. For social identities whose provider is configured (e.g. Google): insert `account` `{ providerId: identity.provider, accountId: identity.identity_data?.sub ?? identity.provider_id }`.
5. Set `emailAndPassword.password.verify` to bcrypt BEFORE go-live.

**Reuse portal user IDs:** keep Supabase `user.id` as the Better Auth `user.id` so portal's rekeyed `profiles` access table (and any FK'd domain rows) line up. This is the cleanest mapping for "authorization per-app keyed by Better Auth user id."

**Run via service-role / direct DB** (server-only), mirroring portal's existing `tools/import/*.mjs` pattern.

**Confidence:** HIGH — hash incompatibility + bcrypt override + field mappings all from the official Supabase migration guide and corroborated by issue #4762.

---

## 5. Auth DB placement on company-server Postgres

| Option | Setup | Pros | Cons | Verdict |
|--------|-------|------|------|---------|
| **Dedicated database** (e.g. `basket_auth`) | New DB on the same Postgres instance; own `AUTH_DATABASE_URL` | Clean ownership; no name collisions with analytics domain tables; easy to back up/secure separately | Separate connection string to manage | **Recommended** |
| **Dedicated schema** (e.g. `auth.` in analytics' DB) | Same DB, new schema; Drizzle `pgSchema("auth")` | One instance/one DB to operate; analytics' Better Auth tables already live there | Shares blast radius with analytics domain data; must namespace tables | Acceptable fallback |
| Reuse analytics' existing `public` tables | Point portal at analytics' current `auth_*` tables | Zero new schema | Couples portal to analytics' DB layout/migrations; muddy ownership | Avoid for a *shared* service |

**Recommendation:** a **dedicated `basket_auth` database** owned by the auth concern. Analytics then repoints to it (migrate its existing rows in). Drizzle auth config:

```typescript
// drizzle.auth.config.ts  (separate from any domain drizzle config)
import { defineConfig } from "drizzle-kit";
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/auth/schema.ts",
  out: "./drizzle/auth",
  dbCredentials: { url: process.env.AUTH_DATABASE_URL! },
});
```

If using a schema instead of a DB, declare tables under `pgSchema("auth")` and add `migrations: { schema: "auth" }` / `tablesFilter` so auth migrations stay isolated.

---

## 6. Plugins relevant here

| Plugin | Use it? | Why |
|--------|---------|-----|
| `nextCookies()` | **YES, required** | Enables `Set-Cookie` from server actions; must be LAST in `plugins` |
| `magicLink()` + `magicLinkClient()` | **Recommended** for externals | Passwordless path; avoids password migration entirely; good for collaborators/guests |
| `admin()` | **Optional** | Adds ban/impersonate + a `role` field convention and admin APIs. Useful if portal wants a user-management UI. NOT needed for portal's existing role model (roles live in portal's own access table) |
| `organization()` | **NO (this milestone)** | Multi-tenant orgs/teams/invitations — overkill. Portal's roles are per-section app-layer guards, not org membership. Decision §42 keeps role models per-app and un-unified |

**Roles strategy (matches PROJECT decisions):** keep portal's rich `admin/editor/viewer/collaborator + per-section` model in portal's **own** access table (rekeyed `profiles`), keyed by Better Auth `user.id`, resolved in `getSessionUser`/`require*` guards — NOT in the shared `user` table and NOT via the `organization` plugin. Analytics keeps its `admin/viewer` in its allowlist/`user.role`. Identity shared, authorization per-app.

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Magic link for externals | Email/password for externals | When existing collaborators already have Supabase passwords and you want continuity → then you MUST add bcrypt `verify` |
| Reuse bcrypt hashes via `password.verify` | Force password reset / re-invite | When you prefer standardizing on Better Auth's default scrypt and accept one-time friction |
| Dedicated `basket_auth` database | Dedicated `auth` schema in analytics' DB | When provisioning a new DB is operationally expensive |
| Same `secret` + shared session table (built-in SSO) | `sso` / OIDC-provider plugin | Only if apps were on different domains or you needed a true IdP — not the case here |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Default scrypt verifier with imported bcrypt hashes | Causes `Invalid password hash` (issue #4762); users locked out | Set `emailAndPassword.password.verify` to `bcrypt.compare` before go-live |
| Full `auth.api.getSession` inside middleware as the security gate | Edge runtime + DB; docs say middleware check is optimistic only | `getSessionCookie` for redirect; enforce in RSC/server actions |
| `nextCookies()` placed anywhere but last | Cookie-setting wrapping breaks | Always last element of `plugins` |
| Domain allowlist (`@basquetpass.tv`) gate on portal | Portal has external/guest users without workspace Google | Portal access-table check in `databaseHooks` |
| Different `BETTER_AUTH_SECRET` or `cookiePrefix` per app | Cookies become unreadable cross-app → SSO silently breaks | Identical secret, domain, and (default) cookie prefix everywhere |
| Pointing Better Auth's Drizzle adapter at Supabase | Splits identity across two stores; defeats the shared-DB SSO | Single company-server auth DB for all apps |
| Edge runtime on `/api/auth/[...all]` | postgres-js needs Node | `export const runtime = "nodejs"` |

## Stack Patterns by Variant

**If existing collaborators have active Supabase passwords:**
- Import bcrypt hashes into `account` (`providerId: "credential"`), set bcrypt `password.verify`.
- Because it preserves login continuity with zero user friction.

**If you can re-onboard externals:**
- Skip password import; enable `magicLink` only for the non-Google path.
- Because it removes the bcrypt/scrypt coupling and password storage entirely.

**If a separate auth database is not feasible on the company server:**
- Use a dedicated `auth` schema via `pgSchema("auth")` in analytics' Postgres.
- Because it still isolates auth tables from domain tables within one instance.

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `better-auth@^1.6.11` | `next@16.x`, `react@19.x` | Same versions running in analytics today; pin all apps to the same minor to keep the SSO/session-schema contract stable |
| `better-auth@^1.6.11` | `drizzle-orm@^0.45`, `postgres@^3.4` | Reference impl in `../data-bp` |
| Cross-app SSO | ALL apps on `better-auth@^1.6.x` + same `secret`/cookie domain/session schema | Avoid mixed majors across subdomains; a schema change in `user/session` must be coordinated |
| `bcrypt` | Node runtime | Native addon — ensure the Netlify/host build includes it; route handler must be `runtime = "nodejs"` |

## Confidence Assessment

| Area | Confidence | Basis |
|------|------------|-------|
| Cross-subdomain cookie/secret/trustedOrigins config | HIGH | Official cookies doc + verified against analytics impl |
| `trustedOrigins` wildcard support | LOW | Not documented; list origins explicitly |
| Next.js wiring (route/getSession/middleware) | HIGH | Official Next integration doc + analytics impl |
| Multiple methods + databaseHooks gate | HIGH | Official email-password/magic-link/database docs + analytics hook pattern |
| Password-hash migratability (bcrypt vs scrypt) | HIGH | Official Supabase migration guide + issue #4762 |
| Migration field mappings | HIGH | Official Supabase migration guide |
| Auth DB placement | MEDIUM | Best-practice reasoning; no single authoritative doc — driven by ownership/blast-radius |

## Sources

- Better Auth docs index — https://better-auth.com/llms.txt
- Cookies / cross-subdomain — https://better-auth.com/docs/concepts/cookies
- Next.js integration — https://better-auth.com/docs/integrations/next
- Email & password (custom hash/verify) — https://better-auth.com/docs/authentication/email-password
- Magic link plugin — https://better-auth.com/docs/plugins/magic-link
- Database / hooks / schema — https://better-auth.com/docs/concepts/database
- Supabase → Better Auth migration guide (bcrypt verify + field mappings) — https://better-auth.com/docs/guides/supabase-migration-guide
- Issue #4762 "Invalid password hash" after Supabase migration — https://github.com/better-auth/better-auth/issues/4762
- Reference implementation (analytics) — `../data-bp/src/lib/auth/*`, `../data-bp/src/shared/db/client.ts`, `../data-bp/src/app/api/auth/[...all]/route.ts`

---

*Stack research: 2026-06-03*
