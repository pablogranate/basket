import "server-only";

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { admin, magicLink } from "better-auth/plugins";

import { authDb } from "@/lib/db/auth-client";
import { resolveCrossSubdomainCookieConfig } from "@/lib/auth/cookie-domain";
import {
  authAccount,
  authSession,
  authUser,
  authVerification,
} from "@/lib/auth/schema";
import { appEnv, assertBetterAuthEnv } from "@/lib/env";
import { sendMagicLinkEmail } from "@/lib/email/mailer";

assertBetterAuthEnv();

const SIXTY_DAYS_SECONDS = 60 * 60 * 24 * 60;
const ONE_DAY_SECONDS = 60 * 60 * 24;

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
    // portal role (resolved fresh from profiles in getUserContext), so
    // role/permission changes stay immediate. Short maxAge bounds the window
    // in which an admin force-logout/ban can linger.
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
  // Same-email Google + magic-link identities collapse to one user. Both methods
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
    admin(),
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        await sendMagicLinkEmail({ to: email, url });
      },
    }),
    // nextCookies() MUST stay last so server-action Set-Cookie headers are handled.
    nextCookies(),
  ],
});
