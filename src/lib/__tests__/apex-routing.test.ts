import { describe, expect, it } from "vitest";

import {
  buildSiblingAppUrl,
  isApexHost,
  resolveApexDestination,
} from "@/lib/constants";

describe("isApexHost", () => {
  it("recognizes the apex host but not the portal subdomain", () => {
    expect(isApexHost("basket-app.com")).toBe(true);
    expect(isApexHost("portal.basket-app.com")).toBe(false);
  });

  it("treats other subdomains as non-apex", () => {
    expect(isApexHost("analytics.basket-app.com")).toBe(false);
    expect(isApexHost("incidencias.basket-app.com")).toBe(false);
  });

  it("recognizes the local apex alias for development", () => {
    expect(isApexHost("basket-app.localhost")).toBe(true);
    expect(isApexHost("localhost")).toBe(false);
  });

  it("ignores the port when matching the host", () => {
    expect(isApexHost("basket-app.localhost:3000")).toBe(true);
    expect(isApexHost("basket-app.com:443")).toBe(true);
  });
});

describe("resolveApexDestination", () => {
  it("sends a session-less visitor to the portal login", () => {
    expect(resolveApexDestination({ hasSession: false })).toEqual({
      kind: "redirect",
      path: "/login",
    });
  });

  // Every signed-in identity gets the launcher; what it lists is per person
  // (launcherApps), so nobody is bounced into the portal from the apex.
  it("renders the landing for any session", () => {
    expect(resolveApexDestination({ hasSession: true })).toEqual({
      kind: "render-landing",
    });
  });
});

describe("buildSiblingAppUrl", () => {
  it("builds an https sibling URL from the production apex", () => {
    expect(buildSiblingAppUrl("basket-app.com", "analytics")).toBe(
      "https://analytics.basket-app.com",
    );
  });

  it("preserves http and port for the local apex alias", () => {
    expect(buildSiblingAppUrl("basket-app.localhost:3000", "portal")).toBe(
      "http://portal.basket-app.localhost:3000",
    );
  });
});
