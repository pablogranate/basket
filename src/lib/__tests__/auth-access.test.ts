import { afterEach, describe, expect, it, vi } from "vitest";

import { makeUserContext } from "@/test/fixtures/user-context";

const requireUserContext = vi.fn();

vi.mock("@/lib/auth", () => ({
  requireUserContext: () => requireUserContext(),
}));

import { requireAdmin } from "@/lib/auth-access";

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
