import { describe, expect, it } from "vitest";

import {
  resolveCrossSubdomainCookieConfig,
  resolveSessionCookiePrefix,
} from "@/lib/auth/cookie-domain";

describe("resolveCrossSubdomainCookieConfig", () => {
  it("enables the shared parent-domain cookie for a portal subdomain", () => {
    expect(
      resolveCrossSubdomainCookieConfig("https://portal.basket-app.com"),
    ).toEqual({ enabled: true, domain: ".basket-app.com" });
  });

  it("enables the shared parent-domain cookie at the apex", () => {
    expect(
      resolveCrossSubdomainCookieConfig("https://basket-app.com"),
    ).toEqual({ enabled: true, domain: ".basket-app.com" });
  });

  it("disables cross-subdomain cookies on localhost", () => {
    expect(
      resolveCrossSubdomainCookieConfig("http://localhost:3000"),
    ).toEqual({ enabled: false });
  });

  it("disables cross-subdomain cookies for the local apex alias", () => {
    expect(
      resolveCrossSubdomainCookieConfig("http://basket-app.localhost:3000"),
    ).toEqual({ enabled: false });
  });
});

describe("resolveSessionCookiePrefix", () => {
  it("keeps Better Auth's default prefix in production", () => {
    expect(resolveSessionCookiePrefix("https://portal.basket-app.com")).toBe("better-auth");
    expect(resolveSessionCookiePrefix("http://localhost:3000")).toBe("better-auth");
  });

  it("gives the Entorno de desarrollo its own cookie, still on .basket-app.com", () => {
    expect(resolveSessionCookiePrefix("https://dev.portal.basket-app.com")).toBe("basket-dev");
    expect(resolveCrossSubdomainCookieConfig("https://dev.portal.basket-app.com")).toEqual({
      enabled: true,
      domain: ".basket-app.com",
    });
  });
});
