import { describe, expect, it } from "vitest";

import {
  resolvePostLoginDestination,
  sanitizeRedirectTo,
} from "@/lib/constants";

describe("sanitizeRedirectTo", () => {
  it("keeps a relative in-app path but rejects an external absolute URL", () => {
    expect(sanitizeRedirectTo("/grid")).toBe("/grid");
    expect(sanitizeRedirectTo("https://evil.com/phish")).toBeNull();
  });

  it("allows absolute URLs within the basket-app domain", () => {
    expect(sanitizeRedirectTo("https://basket-app.com/")).toBe(
      "https://basket-app.com/",
    );
    expect(sanitizeRedirectTo("https://analytics.basket-app.com/x")).toBe(
      "https://analytics.basket-app.com/x",
    );
  });

  // Session readers send unauthenticated visitors to the portal login and back
  // to the page they asked for (ADR 0009); the round-trip must survive the gate.
  it.each([
    "https://op.basket-app.com/clubs?tab=activos",
    "https://incidencias.basket-app.com/partidos/123",
    "http://op.basket-app.localhost:3006/",
    "http://incidencias.basket-app.localhost:3002/reportes",
  ])("accepts the ops hub and incidencias hosts as login round-trip targets: %s", (target) => {
    expect(sanitizeRedirectTo(target)).toBe(target);
  });

  it("rejects protocol-relative and javascript URLs", () => {
    expect(sanitizeRedirectTo("//evil.com")).toBeNull();
    expect(sanitizeRedirectTo("javascript:alert(1)")).toBeNull();
  });

  it("rejects look-alike domains that merely contain the base host", () => {
    expect(sanitizeRedirectTo("https://basket-app.com.evil.com/")).toBeNull();
    expect(sanitizeRedirectTo("https://notbasket-app.com/")).toBeNull();
  });

  it("treats missing input as no redirect", () => {
    expect(sanitizeRedirectTo(undefined)).toBeNull();
    expect(sanitizeRedirectTo("")).toBeNull();
  });
});

const APEX_LANDING = "https://basket-app.com/";

describe("resolvePostLoginDestination", () => {
  it("honors a safe explicit target over the apex", () => {
    expect(
      resolvePostLoginDestination({ redirectTo: "/mi-jornada/m1/reportar", apexUrl: APEX_LANDING }),
    ).toBe("/mi-jornada/m1/reportar");
    expect(
      resolvePostLoginDestination({
        redirectTo: "https://facturacion.basket-app.com/admin",
        apexUrl: APEX_LANDING,
      }),
    ).toBe("https://facturacion.basket-app.com/admin");
  });

  // basket#199: the directory, never a role dashboard.
  it("defaults to the apex directory when there is no safe target", () => {
    expect(resolvePostLoginDestination({ redirectTo: null, apexUrl: APEX_LANDING })).toBe(APEX_LANDING);
    expect(
      resolvePostLoginDestination({ redirectTo: "https://evil.com", apexUrl: APEX_LANDING }),
    ).toBe(APEX_LANDING);
  });

  it("falls back to portal / off the basket-app hosts, where there is no apex", () => {
    expect(resolvePostLoginDestination({ redirectTo: null, apexUrl: null })).toBe("/");
  });
});
