import { describe, expect, it } from "vitest";

import { resolveCrossSubdomainCookieConfig } from "@/lib/auth/cookie-domain";

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
