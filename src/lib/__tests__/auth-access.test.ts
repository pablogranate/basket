import { afterEach, describe, expect, it, vi } from "vitest";

import { makeUserContext } from "@/test/fixtures/user-context";

const requireUserContext = vi.fn();

vi.mock("@/lib/auth", () => ({
  requireUserContext: () => requireUserContext(),
}));

import {
  requireAccessManager,
  requireAccessRequestApprover,
  requireAdmin,
  requireCapability,
} from "@/lib/auth-access";

afterEach(() => {
  requireUserContext.mockReset();
});

describe("requireAdmin (issue #4 admin-only guard)", () => {
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

describe("requireAccessManager (issue #30 — guard for the access-grant flows)", () => {
  it("returns the context for admin and Productor", async () => {
    for (const role of ["admin", "editor"] as const) {
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

describe("requireAccessRequestApprover (D-06 — approving is a productor job)", () => {
  it("returns the context for admin and Productor", async () => {
    for (const role of ["admin", "editor"] as const) {
      const context = makeUserContext({ role });
      requireUserContext.mockResolvedValue(context);

      await expect(requireAccessRequestApprover()).resolves.toBe(context);
    }
  });

  it("throws for an Externo", async () => {
    requireUserContext.mockResolvedValue(
      makeUserContext({ role: "collaborator" }),
    );

    await expect(requireAccessRequestApprover()).rejects.toThrow(
      "No tenes permisos para aprobar solicitudes de acceso.",
    );
  });
});

describe("requireCapability", () => {
  it("denies a context without access regardless of role", async () => {
    requireUserContext.mockResolvedValue({
      ...makeUserContext({ role: "admin" }),
      hasAccess: false,
    });

    await expect(requireCapability("edit")).rejects.toThrow(
      "No tenes permisos para editar.",
    );
  });
});
