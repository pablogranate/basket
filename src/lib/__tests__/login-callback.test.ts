import { describe, expect, it } from "vitest";

import { resolvePostLoginDestination } from "@/lib/constants";
import type { AppRole } from "@/lib/database.types";
import {
  buildLoginCallbackURL,
  decodeLoginRedirect,
  encodeLoginRedirect,
  resolveLoginRedirectTarget,
} from "@/lib/auth/login-callback";

const APEX_LOGIN = "https://basket-app.com/login";

// Copied verbatim from better-auth's matchesOriginPattern relative-path branch
// (node_modules/better-auth/dist/auth/trusted-origins.mjs). A callbackURL that
// fails this is rejected with INVALID_CALLBACK_URL.
const BETTER_AUTH_RELATIVE_CALLBACK =
  /^\/(?!\/|\\|%2f|%5c)[\w\-.\+/@]*(?:\?[\w\-.\+/=&%@]*)?$/;

function isAcceptedByBetterAuth(url: string) {
  return BETTER_AUTH_RELATIVE_CALLBACK.test(url);
}

// POST /sign-in/magic-link and /sign-in/social validate the raw JSON body value.
function asPostedBody(callbackURL: string) {
  return callbackURL;
}

// GET /magic-link/verify: the framework decodes the query string once, then the
// plugin runs its own decodeURIComponent on top of that.
function asMagicLinkVerify(callbackURL: string) {
  const link = new URL("https://portal.basket-app.com/api/auth/magic-link/verify");
  link.searchParams.set("callbackURL", callbackURL);
  const fromQuery = new URL(link).searchParams.get("callbackURL") ?? "";
  return decodeURIComponent(fromQuery);
}

// GET /callback/:provider replays the value verbatim from the signed state.
function asOAuthCallback(callbackURL: string) {
  return callbackURL;
}

describe("buildLoginCallbackURL", () => {
  it("stays a bare path when there is nothing to carry", () => {
    expect(buildLoginCallbackURL(null)).toBe("/login");
    expect(buildLoginCallbackURL("")).toBe("/login");
  });

  it("drops a target that fails the open-redirect guard", () => {
    expect(buildLoginCallbackURL("https://evil.com/phish")).toBe("/login");
    expect(buildLoginCallbackURL("//evil.com")).toBe("/login");
  });

  it("carries the target as an opaque token, never as a raw URL", () => {
    const callbackURL = buildLoginCallbackURL(APEX_LOGIN);
    expect(callbackURL).toMatch(/^\/login\?r=[A-Za-z0-9_-]+$/);
    expect(callbackURL).not.toContain("basket-app.com");
  });

  it.each([
    ["a relative path", "/grid"],
    ["a path with a query", "/grid?region=norte"],
    ["the apex launcher", APEX_LOGIN],
    ["a sibling app", "https://analytics.basket-app.com/dashboard"],
    ["a non-ascii path", "/mi-jornada?nota=coordinación"],
  ])("survives every better-auth callbackURL check for %s", (_label, target) => {
    const callbackURL = buildLoginCallbackURL(target);

    expect(isAcceptedByBetterAuth(asPostedBody(callbackURL))).toBe(true);
    expect(isAcceptedByBetterAuth(asMagicLinkVerify(callbackURL))).toBe(true);
    expect(isAcceptedByBetterAuth(asOAuthCallback(callbackURL))).toBe(true);
  });

  it("round-trips through the magic-link and OAuth flows back to the target", () => {
    for (const target of [
      "/grid",
      "/grid?region=norte",
      APEX_LOGIN,
      "/mi-jornada?nota=coordinación",
    ]) {
      const callbackURL = buildLoginCallbackURL(target);

      for (const landing of [
        asMagicLinkVerify(callbackURL),
        asOAuthCallback(callbackURL),
      ]) {
        const params = Object.fromEntries(
          new URL(landing, "https://portal.basket-app.com").searchParams,
        );
        expect(resolveLoginRedirectTarget(params)).toBe(target);
      }
    }
  });

  // Regression guard for the shipped bug: nesting the target as a plain query
  // value decoded to literal ":" and "//" on verify and was rejected.
  it("does not regress to nesting the raw URL in the query", () => {
    const legacy = `/login?redirectTo=${encodeURIComponent(APEX_LOGIN)}`;
    expect(isAcceptedByBetterAuth(asMagicLinkVerify(legacy))).toBe(false);
    expect(isAcceptedByBetterAuth(asMagicLinkVerify(buildLoginCallbackURL(APEX_LOGIN)))).toBe(
      true,
    );
  });
});

describe("decodeLoginRedirect", () => {
  it("round-trips a safe target", () => {
    expect(decodeLoginRedirect(encodeLoginRedirect("/mi-jornada"))).toBe(
      "/mi-jornada",
    );
  });

  it("re-applies the open-redirect guard to a tampered token", () => {
    expect(decodeLoginRedirect(encodeLoginRedirect("https://evil.com"))).toBeNull();
    expect(decodeLoginRedirect(encodeLoginRedirect("//evil.com"))).toBeNull();
    expect(
      decodeLoginRedirect(encodeLoginRedirect("javascript:alert(1)")),
    ).toBeNull();
  });

  it("treats malformed input as no redirect", () => {
    expect(decodeLoginRedirect(null)).toBeNull();
    expect(decodeLoginRedirect("")).toBeNull();
    expect(decodeLoginRedirect("not base64!!")).toBeNull();
    expect(decodeLoginRedirect("////")).toBeNull();
  });
});

describe("resolveLoginRedirectTarget", () => {
  it("reads the middleware form", () => {
    expect(resolveLoginRedirectTarget({ redirectTo: "/grid" })).toBe("/grid");
    expect(resolveLoginRedirectTarget({ redirectTo: APEX_LOGIN })).toBe(APEX_LOGIN);
  });

  it("prefers the callback token over a stale redirectTo", () => {
    expect(
      resolveLoginRedirectTarget({
        redirectTo: "/grid",
        r: encodeLoginRedirect("/mi-jornada"),
      }),
    ).toBe("/mi-jornada");
  });

  it("falls back to redirectTo when the token is unusable", () => {
    expect(
      resolveLoginRedirectTarget({ redirectTo: "/grid", r: "!!!" }),
    ).toBe("/grid");
  });

  it("returns null when nothing usable is present", () => {
    expect(resolveLoginRedirectTarget({})).toBeNull();
    expect(resolveLoginRedirectTarget({ redirectTo: ["/a", "/b"] })).toBeNull();
    expect(resolveLoginRedirectTarget({ redirectTo: "https://evil.com" })).toBeNull();
  });
});

// The flow that broke in production: an external user opens basket-app.com, the
// middleware bounces them to the portal login carrying the absolute apex URL,
// they request a magic link and click it.
describe("apex-originated magic link for an external user", () => {
  const APEX_URL = "https://basket-app.com/login";

  it.each<AppRole>(["collaborator"])(
    "verifies and lands %s on mi-jornada",
    (role) => {
      const callbackURL = buildLoginCallbackURL(
        resolveLoginRedirectTarget({ redirectTo: APEX_URL }),
      );
      const landing = asMagicLinkVerify(callbackURL);

      expect(isAcceptedByBetterAuth(landing)).toBe(true);

      const params = Object.fromEntries(
        new URL(landing, "https://portal.basket-app.com").searchParams,
      );
      expect(
        resolvePostLoginDestination({
          role,
          redirectTo: resolveLoginRedirectTarget(params),
        }),
      ).toBe("/mi-jornada");
    },
  );

  it("still returns an Admin to the apex launcher", () => {
    const callbackURL = buildLoginCallbackURL(APEX_URL);
    const params = Object.fromEntries(
      new URL(asMagicLinkVerify(callbackURL), "https://portal.basket-app.com")
        .searchParams,
    );
    expect(
      resolvePostLoginDestination({
        role: "admin",
        redirectTo: resolveLoginRedirectTarget(params),
      }),
    ).toBe(APEX_URL);
  });
});
