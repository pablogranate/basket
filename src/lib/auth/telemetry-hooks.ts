import type { BetterAuthOptions } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";

import { reportAuthEvent } from "@/lib/telemetry";

// Auth events for basket-telemetry (its SPEC §11.5), wired into Better Auth in
// src/lib/auth/server.ts. Every function here is fire-and-forget: it never
// throws into Better Auth and never delays a sign-in.

const MAGIC_LINK_REQUEST_PATH = "/sign-in/magic-link";
const MAGIC_LINK_VERIFY_PATH = "/magic-link/verify";
const EMAIL_OTP_REQUEST_PATH = "/email-otp/send-verification-otp";
const EMAIL_OTP_SIGN_IN_PATH = "/sign-in/email-otp";
const OAUTH_CALLBACK_PATH = "/callback/:id";
const SOCIAL_SIGN_IN_PATH = "/sign-in/social";
const SIGN_OUT_PATH = "/sign-out";
const IMPERSONATE_PATH = "/admin/impersonate-user";

const SIGN_IN_PATHS = new Set([
  MAGIC_LINK_REQUEST_PATH,
  MAGIC_LINK_VERIFY_PATH,
  EMAIL_OTP_REQUEST_PATH,
  EMAIL_OTP_SIGN_IN_PATH,
  OAUTH_CALLBACK_PATH,
  SOCIAL_SIGN_IN_PATH,
]);

// Sign-in endpoints whose body carries the email being signed in.
const EMAIL_BODY_PATHS = new Set([
  MAGIC_LINK_REQUEST_PATH,
  EMAIL_OTP_REQUEST_PATH,
  EMAIL_OTP_SIGN_IN_PATH,
]);

// What Better Auth hands a database hook or an after hook about the endpoint
// that ran (GenericEndpointContext / the middleware context), narrowed to
// the fields read here.
export type AuthEndpointLike = {
  path?: string;
  params?: unknown;
  body?: unknown;
} | null;

function stringField(source: unknown, key: string): string | null {
  if (source && typeof source === "object" && key in source) {
    const value = (source as Record<string, unknown>)[key];
    return typeof value === "string" && value ? value : null;
  }

  return null;
}

// How the person signed in: the provider of the OAuth callback (google), the
// magic link, the emailed code, or the admin plugin's impersonation.
export function loginMethodOf(endpoint: AuthEndpointLike): string {
  switch (endpoint?.path) {
    case MAGIC_LINK_REQUEST_PATH:
    case MAGIC_LINK_VERIFY_PATH:
      return "magic_link";
    case EMAIL_OTP_REQUEST_PATH:
    case EMAIL_OTP_SIGN_IN_PATH:
      return "email_otp";
    case OAUTH_CALLBACK_PATH:
      return stringField(endpoint.params, "id") ?? "oauth";
    case SOCIAL_SIGN_IN_PATH:
      return stringField(endpoint.body, "provider") ?? "oauth";
    case IMPERSONATE_PATH:
      return "impersonation";
    default:
      return "other";
  }
}

function locationOf(headers: unknown): string | null {
  if (headers instanceof Headers) {
    return headers.get("location");
  }

  return stringField(headers, "location") ?? stringField(headers, "Location");
}

// Whether an auth endpoint failed, read from what it returned: a thrown
// APIError (Better Auth keeps it in ctx.context.returned) other than a
// redirect, or a redirect that carries `?error=` (magic link verify and the
// OAuth callback report failures that way). The code is Better Auth's own
// (INVALID_TOKEN, unable_to_get_user_info…), never user data.
export function endpointFailure(returned: unknown): string | null {
  if (!returned || typeof returned !== "object" || !("statusCode" in returned)) {
    return null;
  }

  const { statusCode, headers, body } = returned as {
    statusCode: unknown;
    headers?: unknown;
    body?: unknown;
  };

  if (statusCode === 302) {
    const location = locationOf(headers);
    if (!location) {
      return null;
    }

    try {
      return new URL(location, "http://placeholder.invalid").searchParams.get("error");
    } catch {
      return null;
    }
  }

  if (typeof statusCode === "number" && statusCode >= 400) {
    return stringField(body, "code") ?? String(statusCode);
  }

  return null;
}

// databaseHooks.session.create.after: every new session is a login.
export function reportLoginSuccess(
  session: { userId: string },
  endpoint: AuthEndpointLike,
): void {
  try {
    reportAuthEvent({
      type: "login_success",
      userId: session.userId,
      method: loginMethodOf(endpoint),
    });
  } catch {
    // Never into Better Auth.
  }
}

// databaseHooks.session.delete.after: only a sign-out is a logout; a revoke
// or a ban from /usuarios also deletes sessions.
export function reportLogout(
  session: { userId: string },
  endpoint: AuthEndpointLike,
): void {
  try {
    if (endpoint?.path !== SIGN_OUT_PATH) {
      return;
    }

    reportAuthEvent({ type: "logout", userId: session.userId });
  } catch {
    // Never into Better Auth.
  }
}

// hooks.after: failed sign-ins on every sign-in endpoint, and magic link
// requests. A successful verify or callback is already a login_success from
// the session hook. The email is sent only when no identity has it.
export function reportSignInOutcome(input: {
  endpoint: AuthEndpointLike;
  returned: unknown;
  findUserIdByEmail: (email: string) => Promise<string | null>;
}): void {
  try {
    const { endpoint } = input;
    const path = endpoint?.path;

    if (!path || !SIGN_IN_PATHS.has(path)) {
      return;
    }

    const method = loginMethodOf(endpoint);
    const failure = endpointFailure(input.returned);
    const email = EMAIL_BODY_PATHS.has(path)
      ? (stringField(endpoint.body, "email")?.trim().toLowerCase() ?? null)
      : null;

    if (failure) {
      reportAuthEvent({
        type: "login_failed",
        email,
        method,
        detail: { error: failure },
      });
      return;
    }

    if (path !== MAGIC_LINK_REQUEST_PATH) {
      return;
    }

    if (!email) {
      reportAuthEvent({ type: "magic_link_requested", method });
      return;
    }

    void input
      .findUserIdByEmail(email)
      .catch(() => null)
      .then((userId) =>
        reportAuthEvent({
          type: "magic_link_requested",
          userId,
          email: userId ? null : email,
          method,
        }),
      )
      .catch(() => {});
  } catch {
    // Never into Better Auth.
  }
}

// The Better Auth options that wire the reporters above, spread into the
// betterAuth() config in src/lib/auth/server.ts.
export const authTelemetryOptions = {
  databaseHooks: {
    session: {
      create: {
        after: async (session, context) => {
          reportLoginSuccess(session, context);
        },
      },
      delete: {
        after: async (session, context) => {
          reportLogout(session, context);
        },
      },
    },
  },
  hooks: {
    after: createAuthMiddleware(async (ctx) => {
      reportSignInOutcome({
        endpoint: ctx,
        returned: ctx.context.returned,
        findUserIdByEmail: async (email) =>
          (await ctx.context.internalAdapter.findUserByEmail(email))?.user.id ??
          null,
      });
    }),
  },
} satisfies Pick<BetterAuthOptions, "databaseHooks" | "hooks">;
