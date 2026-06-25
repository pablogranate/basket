import { afterEach, describe, expect, it, vi } from "vitest";

import { makeUserContext } from "@/test/fixtures/user-context";

const requireUserContext = vi.fn();

vi.mock("@/lib/auth", () => ({
  requireUserContext: () => requireUserContext(),
}));

import {
  canManageAccessTier,
  isAccessManagerRole,
  requireAccessManager,
  requireAdmin,
} from "@/lib/auth-access";

describe("requireAdmin (issue #4 admin-only guard)", () => {
  afterEach(() => {
    requireUserContext.mockReset();
  });

  it("returns the context for an admin", async () => {
    const adminContext = makeUserContext({ role: "admin" });
    requireUserContext.mockResolvedValue(adminContext);

    await expect(requireAdmin()).resolves.toBe(adminContext);
  });

  it("throws a generic admin-only message for an editor (Productor)", async () => {
    requireUserContext.mockResolvedValue(makeUserContext({ role: "editor" }));

    await expect(requireAdmin()).rejects.toThrow(
      "Solo un admin puede realizar esta accion.",
    );
  });

  it("throws for any other non-admin role", async () => {
    requireUserContext.mockResolvedValue(
      makeUserContext({ role: "collaborator", canEdit: true }),
    );

    await expect(requireAdmin()).rejects.toThrow(
      "Solo un admin puede realizar esta accion.",
    );
  });
});

describe("isAccessManagerRole (issue #30 — who can manage platform access)", () => {
  it("treats admin and both Productor roles as access managers", () => {
    expect(isAccessManagerRole("admin")).toBe(true);
    expect(isAccessManagerRole("editor")).toBe(true);
    expect(isAccessManagerRole("coordinator")).toBe(true);
  });

  it("does not treat Externo roles as access managers", () => {
    expect(isAccessManagerRole("collaborator")).toBe(false);
    expect(isAccessManagerRole("viewer")).toBe(false);
  });
});

describe("canManageAccessTier (issue #30 — which tiers a manager may grant/revoke)", () => {
  it("lets an admin manage every tier", () => {
    expect(canManageAccessTier("admin", "admin")).toBe(true);
    expect(canManageAccessTier("admin", "editor")).toBe(true);
    expect(canManageAccessTier("admin", "collaborator")).toBe(true);
  });

  it("limits both Productor roles to the Externo tier", () => {
    for (const role of ["editor", "coordinator"] as const) {
      expect(canManageAccessTier(role, "collaborator")).toBe(true);
      expect(canManageAccessTier(role, "editor")).toBe(false);
      expect(canManageAccessTier(role, "admin")).toBe(false);
    }
  });

  it("denies Externo roles every tier", () => {
    for (const role of ["collaborator", "viewer"] as const) {
      expect(canManageAccessTier(role, "collaborator")).toBe(false);
      expect(canManageAccessTier(role, "editor")).toBe(false);
      expect(canManageAccessTier(role, "admin")).toBe(false);
    }
  });
});

describe("requireAccessManager (issue #30 — guard for the access-grant flows)", () => {
  afterEach(() => {
    requireUserContext.mockReset();
  });

  it("returns the context for admin and both Productor roles", async () => {
    for (const role of ["admin", "editor", "coordinator"] as const) {
      const context = makeUserContext({ role, canEdit: true });
      requireUserContext.mockResolvedValue(context);

      await expect(requireAccessManager()).resolves.toBe(context);
    }
  });

  it("throws for an Externo even when they can edit", async () => {
    requireUserContext.mockResolvedValue(
      makeUserContext({ role: "collaborator", canEdit: true }),
    );

    await expect(requireAccessManager()).rejects.toThrow(
      "No tenes permisos para gestionar accesos a la plataforma.",
    );
  });
});
