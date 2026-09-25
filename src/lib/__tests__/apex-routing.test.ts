import { describe, expect, it } from "vitest";

import {
  buildSiblingAppUrl,
  isApexHost,
  isUsuariosPath,
  resolveApexDestination,
  resolveUsuariosDestination,
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

// The users section (basket#187): apex only, super admins only.
describe("resolveUsuariosDestination", () => {
  it("is a 404 on every host but the apex, whoever asks", () => {
    for (const host of ["portal.basket-app.com", "analytics.basket-app.com", "localhost:3000"]) {
      expect(
        resolveUsuariosDestination({ host, hasSession: true, superAdmin: true }),
      ).toEqual({ kind: "not-found" });
    }
  });

  it("sends a session-less visitor on the apex to the login", () => {
    expect(
      resolveUsuariosDestination({ host: "basket-app.com", hasSession: false, superAdmin: false }),
    ).toEqual({ kind: "redirect", path: "/login" });
  });

  it("sends a signed-in non-super-admin to /no-access", () => {
    expect(
      resolveUsuariosDestination({ host: "basket-app.com", hasSession: true, superAdmin: false }),
    ).toEqual({ kind: "redirect", path: "/no-access" });
  });

  it("lets a super admin in on the apex, local alias included", () => {
    for (const host of ["basket-app.com", "basket-app.localhost:3000"]) {
      expect(
        resolveUsuariosDestination({ host, hasSession: true, superAdmin: true }),
      ).toEqual({ kind: "allow" });
    }
  });
});

describe("isUsuariosPath", () => {
  it("matches the section and its subpaths only", () => {
    expect(isUsuariosPath("/usuarios")).toBe(true);
    expect(isUsuariosPath("/usuarios/x")).toBe(true);
    expect(isUsuariosPath("/usuarios-old")).toBe(false);
    expect(isUsuariosPath("/access")).toBe(false);
  });
});
