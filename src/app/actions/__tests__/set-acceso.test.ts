import { afterEach, describe, expect, it, vi } from "vitest";

import { redirectWithNotice } from "@/app/actions/helpers";
import { setAccesoAction } from "@/app/actions/access";
import { grantAcceso, revokeAcceso } from "@/lib/acceso/accesos";
import { requireAdmin } from "@/lib/auth-access";
import { CAPABILITY_DENIED_MESSAGE } from "@/lib/roles";
import { makeUserContext } from "@/test/fixtures/user-context";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/auth-access", () => ({ requireAdmin: vi.fn() }));

vi.mock("@/lib/acceso/accesos", () => ({
  grantAcceso: vi.fn(),
  revokeAcceso: vi.fn(),
}));

// Every outcome ends in a redirect; model it as a throw so control returns.
vi.mock("@/app/actions/helpers", () => ({
  getRedirectTarget: () => "/access",
  redirectWithNotice: vi.fn(() => {
    throw new Error("REDIRECT");
  }),
  rethrowNavigationError: (error: unknown) => {
    if (error instanceof Error && error.message === "REDIRECT") throw error;
  },
}));

const mockedRequireAdmin = vi.mocked(requireAdmin);
const mockedRedirect = vi.mocked(redirectWithNotice);
const mockedGrant = vi.mocked(grantAcceso);
const mockedRevoke = vi.mocked(revokeAcceso);

function form(entries: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(entries)) formData.set(key, value);
  return formData;
}

// Server-side refusal for editors (spec story 13) and the grant/revoke seam.
describe("setAccesoAction", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("refuses a non-admin with the admin-only notice and touches nothing", async () => {
    mockedRequireAdmin.mockRejectedValue(new Error(CAPABILITY_DENIED_MESSAGE.admin));

    await expect(
      setAccesoAction(form({ userId: "user-2", app: "ops", level: "write" })),
    ).rejects.toThrow("REDIRECT");

    expect(mockedRedirect).toHaveBeenCalledWith(
      expect.objectContaining({ intent: "error", notice: CAPABILITY_DENIED_MESSAGE.admin }),
    );
    expect(mockedGrant).not.toHaveBeenCalled();
    expect(mockedRevoke).not.toHaveBeenCalled();
  });

  it("grants with the admin stamped as grantor", async () => {
    mockedRequireAdmin.mockResolvedValue(makeUserContext({ role: "admin", userId: "user-admin" }));

    await expect(
      setAccesoAction(form({ userId: "user-2", app: "incidencias", level: "read" })),
    ).rejects.toThrow("REDIRECT");

    expect(mockedGrant).toHaveBeenCalledWith({
      userId: "user-2",
      app: "incidencias",
      level: "read",
      grantedBy: "user-admin",
    });
    expect(mockedRedirect).toHaveBeenCalledWith(
      expect.objectContaining({ intent: "success" }),
    );
  });

  it("revokes when the cell is set to none", async () => {
    mockedRequireAdmin.mockResolvedValue(makeUserContext({ role: "admin", userId: "user-admin" }));
    mockedRevoke.mockResolvedValue(true);

    await expect(
      setAccesoAction(form({ userId: "user-2", app: "ops", level: "none" })),
    ).rejects.toThrow("REDIRECT");

    expect(mockedRevoke).toHaveBeenCalledWith({ userId: "user-2", app: "ops" });
    expect(mockedGrant).not.toHaveBeenCalled();
  });

  it("rejects an unknown app before reaching the Auth DB", async () => {
    mockedRequireAdmin.mockResolvedValue(makeUserContext({ role: "admin" }));

    await expect(
      setAccesoAction(form({ userId: "user-2", app: "portal", level: "read" })),
    ).rejects.toThrow("REDIRECT");

    expect(mockedRedirect).toHaveBeenCalledWith(
      expect.objectContaining({ intent: "error", notice: "App desconocida." }),
    );
    expect(mockedGrant).not.toHaveBeenCalled();
  });
});
