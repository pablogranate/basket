import { describe, expect, it } from "vitest";

import { buildApexUrl, buildAppUrlFromAnyHost } from "@/lib/constants";
import { isDevEnvironmentHost, resolveSessionCookiePrefix } from "@/lib/environment";

describe("isDevEnvironmentHost", () => {
  it("recognizes an app in the Entorno de desarrollo", () => {
    expect(isDevEnvironmentHost("dev.portal.basket-app.com")).toBe(true);
    expect(isDevEnvironmentHost("dev.cashflow.basket-app.com:443")).toBe(true);
  });

  it("leaves production and local hosts alone", () => {
    expect(isDevEnvironmentHost("portal.basket-app.com")).toBe(false);
    expect(isDevEnvironmentHost("basket-app.com")).toBe(false);
    expect(isDevEnvironmentHost("devices.basket-app.com")).toBe(false);
    expect(isDevEnvironmentHost("localhost:3000")).toBe(false);
  });
});

describe("resolveSessionCookiePrefix", () => {
  it("keeps Better Auth's default prefix in production", () => {
    expect(resolveSessionCookiePrefix("https://portal.basket-app.com")).toBe("better-auth");
    expect(resolveSessionCookiePrefix("http://localhost:3000")).toBe("better-auth");
  });

  it("gives the Entorno de desarrollo its own cookie", () => {
    expect(resolveSessionCookiePrefix("https://dev.portal.basket-app.com")).toBe("basket-dev");
  });
});

describe("app URLs in the Entorno de desarrollo", () => {
  it("has no Lanzador", () => {
    expect(buildApexUrl("dev.portal.basket-app.com")).toBeNull();
  });

  it("links each app to its development copy", () => {
    expect(buildAppUrlFromAnyHost("dev.portal.basket-app.com", "portal")).toBe(
      "https://dev.portal.basket-app.com",
    );
    expect(buildAppUrlFromAnyHost("dev.portal.basket-app.com", "cashflow")).toBe(
      "https://dev.cashflow.basket-app.com",
    );
  });

  it("keeps the production links unchanged", () => {
    expect(buildApexUrl("portal.basket-app.com")).toBe("https://basket-app.com");
    expect(buildAppUrlFromAnyHost("portal.basket-app.com", "cashflow")).toBe(
      "https://cashflow.basket-app.com",
    );
  });
});
