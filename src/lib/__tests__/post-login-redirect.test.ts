import { describe, expect, it } from "vitest";

import {
  resolvePostLoginDestination,
  sanitizeRedirectTo,
} from "@/lib/constants";
import type { AppRole } from "@/lib/database.types";

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
  it("returns an Admin to the apex landing they came from", () => {
    expect(
      resolvePostLoginDestination({ role: "admin", redirectTo: APEX_LANDING }),
    ).toBe(APEX_LANDING);
  });

  it.each<AppRole>(["editor", "coordinator"])(
    "sends a Productor (%s) to the portal grid instead of bouncing through the apex",
    (role) => {
      expect(
        resolvePostLoginDestination({ role, redirectTo: APEX_LANDING }),
      ).toBe("/grid");
    },
  );

  it.each<AppRole>(["collaborator", "viewer"])(
    "sends an Externo (%s) to mi-jornada instead of the apex",
    (role) => {
      expect(
        resolvePostLoginDestination({ role, redirectTo: APEX_LANDING }),
      ).toBe("/mi-jornada");
    },
  );

  it("honors a safe non-apex deep link for any role", () => {
    expect(
      resolvePostLoginDestination({ role: "collaborator", redirectTo: "/mi-jornada/m1/reportar" }),
    ).toBe("/mi-jornada/m1/reportar");
  });

  it("falls back to the role default when there is no safe redirect", () => {
    expect(
      resolvePostLoginDestination({ role: "admin", redirectTo: "https://evil.com" }),
    ).toBe("/grid");
    expect(
      resolvePostLoginDestination({ role: "viewer", redirectTo: null }),
    ).toBe("/mi-jornada");
  });
});
