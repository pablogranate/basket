import "server-only";

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { admin, emailOTP, magicLink } from "better-auth/plugins";
import { adminAc, userAc } from "better-auth/plugins/admin/access";

import { authDb } from "@/lib/db/auth-client";
import { resolveCrossSubdomainCookieConfig } from "@/lib/auth/cookie-domain";
import { authTelemetryOptions } from "@/lib/auth/telemetry-hooks";
import {
  authAccount,
  authSession,
  authUser,
  authVerification,
} from "@/lib/auth/schema";
import { appEnv, assertBetterAuthEnv } from "@/lib/env";
import { sendLoginCodeEmail, sendMagicLinkEmail } from "@/lib/email/mailer";

assertBetterAuthEnv();

const SIXTY_DAYS_SECONDS = 60 * 60 * 24 * 60;
const ONE_DAY_SECONDS = 60 * 60 * 24;
const TEN_MINUTES_SECONDS = 60 * 10;

export const auth = betterAuth({
  secret: appEnv.betterAuthSecret,
  baseURL: appEnv.betterAuthUrl,
  database: drizzleAdapter(authDb, {
    provider: "pg",
    schema: {
      user: authUser,
      session: authSession,
      account: authAccount,
      verification: authVerification,
    },
  }),
  session: {
    expiresIn: SIXTY_DAYS_SECONDS,
    updateAge: ONE_DAY_SECONDS,
    // Serve session validation from a signed cookie for `maxAge` seconds,
    // skipping the auth-DB round-trip on every getSession. Does NOT cache the
    // portal role (read per request from auth_effective_access in
    // getUserContext), so role/permission changes stay immediate. Short maxAge
    // bounds the window in which an admin force-logout/ban can linger.
    cookieCache: { enabled: true, maxAge: 60 },
  },
  // Share the session cookie across *.basket-app.com so logging in once on the
  // portal is recognized on every sibling subdomain. Disabled on localhost,
  // where parent-domain cookies are not honored by browsers.
  advanced: {
    crossSubDomainCookies: resolveCrossSubdomainCookieConfig(
      appEnv.betterAuthUrl,
    ),
  },
  // Auth events for basket-telemetry (docs/telemetry.md): login_success,
  // login_failed, magic_link_requested and logout. The hooks never throw and
  // never wait on the ingest.
  databaseHooks: authTelemetryOptions.databaseHooks,
  hooks: authTelemetryOptions.hooks,
  // Same-email Google + email (code or link) identities collapse to one user. All
  // yield a verified email, so no trustedProviders shortcut is needed (D-10).
  account: {
    accountLinking: {
      enabled: true,
    },
  },
  socialProviders: {
    google: {
      clientId: appEnv.googleClientId,
      clientSecret: appEnv.googleClientSecret,
      // Pre-filter at Google's consent screen to the Workspace domain...
      hd: appEnv.staffEmailDomain,
      // ...and enforce it server-side — the `hd` hint alone is spoofable (D-07).
      mapProfileToUser: (profile) => {
        const email = profile.email?.toLowerCase() ?? "";
        if (!email.endsWith(`@${appEnv.staffEmailDomain}`)) {
          throw new APIError("FORBIDDEN", {
            message: `El acceso con Google está restringido a cuentas @${appEnv.staffEmailDomain}.`,
          });
        }

        return {
          email: profile.email,
          name: profile.name,
          image: profile.picture,
        };
      },
    },
  },
  plugins: [
    // Only super admins (ADR 0010) may call the admin endpoints; everyone else
    // keeps the plugin's default role "user". There is deliberately no "admin"
    // role here: portal admin is an Acceso, not an identity role.
    admin({
      roles: { user: userAc, superadmin: adminAc },
      adminRoles: ["superadmin"],
    }),
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        await sendMagicLinkEmail({ to: email, url });
      },
    }),
    // The login form signs in with an emailed code: it is typed into the same
    // browser that asked for it, so the session lands in an iOS home-screen
    // app too (a magic link opens in Safari, whose cookies the app does not
    // share). magicLink stays so links already sent keep working.
    emailOTP({
      expiresIn: TEN_MINUTES_SECONDS,
      storeOTP: "hashed",
      sendVerificationOTP: async ({ email, otp, type }) => {
        if (type !== "sign-in") {
          return;
        }
        await sendLoginCodeEmail({ to: email, code: otp });
      },
    }),
    // nextCookies() MUST stay last so server-action Set-Cookie headers are handled.
    nextCookies(),
  ],
});
