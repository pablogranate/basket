import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { redirectWithNotice } from "@/app/actions/helpers";
import {
  banIdentityAction,
  setAppRoleAction,
  setSuperAdminAction,
} from "@/app/actions/usuarios";
import { grantRole, revokeRole } from "@/lib/acceso/accesos";
import {
  grantPortalRoleWithCuenta,
  revokePortalRoleWithCuenta,
} from "@/lib/acceso/portal-cuenta";
import { auth } from "@/lib/auth/server";
import { requireSuperAdmin } from "@/lib/usuarios/guard";
import { findIdentity, getRoleCatalog } from "@/lib/usuarios/matrix";
import { setSuperAdmin } from "@/lib/usuarios/super-admin";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));

vi.mock("@/lib/usuarios/guard", () => ({ requireSuperAdmin: vi.fn() }));
vi.mock("@/lib/usuarios/matrix", () => ({
  findIdentity: vi.fn(),
  getRoleCatalog: vi.fn(),
}));
vi.mock("@/lib/usuarios/super-admin", () => ({
  recordIdentityEvent: vi.fn(),
  setSuperAdmin: vi.fn(),
}));
vi.mock("@/lib/acceso/accesos", () => ({
  findIdentityByEmail: vi.fn(),
  grantRole: vi.fn(),
  revokeRole: vi.fn(),
}));
vi.mock("@/lib/acceso/portal-cuenta", () => ({
  grantPortalRoleWithCuenta: vi.fn(),
  revokePortalRoleWithCuenta: vi.fn(),
}));
vi.mock("@/lib/auth/server", () => ({
  auth: { api: { banUser: vi.fn(), createUser: vi.fn() } },
}));
vi.mock("@/lib/db/auth-client", () => ({ authDb: {} }));

// requireSuperAdmin redirects a non-super-admin; model navigation as throws.
vi.mock("@/app/actions/helpers", () => ({
  getRedirectTarget: () => "/usuarios",
  redirectWithNotice: vi.fn(() => {
    throw new Error("REDIRECT");
  }),
  rethrowNavigationError: (error: unknown) => {
    if (
      error instanceof Error &&
      (error.message === "REDIRECT" || error.message === "NO_ACCESS")
    ) {
      throw error;
    }
  },
}));

const mockedGuard = vi.mocked(requireSuperAdmin);
const mockedRedirect = vi.mocked(redirectWithNotice);

const ACTOR = { userId: "super-1", email: "super@basquetpass.tv", name: "Super" };
const TARGET = {
  userId: "user-2",
  email: "ana@basquetpass.tv",
  name: "Ana",
  activeSuperAdmin: false,
};

function form(entries: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(entries)) formData.set(key, value);
  return formData;
}

describe("usuarios actions", () => {
  beforeEach(() => {
    mockedGuard.mockResolvedValue(ACTOR);
    vi.mocked(findIdentity).mockResolvedValue(TARGET);
    vi.mocked(getRoleCatalog).mockResolvedValue([
      {
        key: "portal",
        label: "Portal",
        roles: [
          { key: "collaborator", label: "Externo", description: null, rank: 10, isAdmin: false },
          { key: "admin", label: "Admin", description: null, rank: 30, isAdmin: true },
        ],
      },
      {
        key: "facturacion",
        label: "Facturación",
        roles: [
          { key: "coordinador", label: "Coordinador", description: null, rank: 20, isAdmin: false },
        ],
      },
    ]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("refuses a non-super-admin before touching any Acceso", async () => {
    mockedGuard.mockRejectedValue(new Error("NO_ACCESS"));

    await expect(
      setAppRoleAction(form({ userId: "user-2", app: "facturacion", role: "coordinador" })),
    ).rejects.toThrow("NO_ACCESS");
    await expect(
      setSuperAdminAction(form({ userId: "user-2", superAdmin: "true" })),
    ).rejects.toThrow("NO_ACCESS");
    await expect(banIdentityAction(form({ userId: "user-2" }))).rejects.toThrow("NO_ACCESS");

    expect(grantRole).not.toHaveBeenCalled();
    expect(setSuperAdmin).not.toHaveBeenCalled();
    expect(auth.api.banUser).not.toHaveBeenCalled();
  });

  it("grants a sibling role with the super admin stamped as grantor", async () => {
    await expect(
      setAppRoleAction(form({ userId: "user-2", app: "facturacion", role: "coordinador" })),
    ).rejects.toThrow("REDIRECT");

    expect(grantRole).toHaveBeenCalledWith({
      userId: "user-2",
      app: "facturacion",
      role: "coordinador",
      grantedBy: "super-1",
    });
    expect(mockedRedirect).toHaveBeenCalledWith(
      expect.objectContaining({ intent: "success" }),
    );
  });

  it("refuses a role the app's catalog doesn't declare", async () => {
    await expect(
      setAppRoleAction(form({ userId: "user-2", app: "facturacion", role: "admin" })),
    ).rejects.toThrow("REDIRECT");

    expect(grantRole).not.toHaveBeenCalled();
    expect(mockedRedirect).toHaveBeenCalledWith(
      expect.objectContaining({ intent: "error" }),
    );
  });

  it("writes the portal with its Cuenta, and revokes both", async () => {
    await expect(
      setAppRoleAction(form({ userId: "user-2", app: "portal", role: "collaborator" })),
    ).rejects.toThrow("REDIRECT");
    expect(grantPortalRoleWithCuenta).toHaveBeenCalledWith({
      ...TARGET,
      role: "collaborator",
      grantedBy: "super-1",
    });

    vi.mocked(revokePortalRoleWithCuenta).mockResolvedValue(true);
    await expect(
      setAppRoleAction(form({ userId: "user-2", app: "portal", role: "none" })),
    ).rejects.toThrow("REDIRECT");
    expect(revokePortalRoleWithCuenta).toHaveBeenCalledWith(TARGET);
    expect(revokeRole).not.toHaveBeenCalled();
  });

  it("leaves a super admin's cells alone", async () => {
    vi.mocked(findIdentity).mockResolvedValue({ ...TARGET, activeSuperAdmin: true });

    await expect(
      setAppRoleAction(form({ userId: "user-2", app: "facturacion", role: "coordinador" })),
    ).rejects.toThrow("REDIRECT");

    expect(grantRole).not.toHaveBeenCalled();
    expect(mockedRedirect).toHaveBeenCalledWith(
      expect.objectContaining({ intent: "error" }),
    );
  });

  it("surfaces the last-super-admin refusal as an error notice", async () => {
    vi.mocked(setSuperAdmin).mockRejectedValue(
      new Error("No se puede quitar el último super admin."),
    );

    await expect(
      setSuperAdminAction(form({ userId: "super-1", superAdmin: "false" })),
    ).rejects.toThrow("REDIRECT");

    expect(mockedRedirect).toHaveBeenCalledWith(
      expect.objectContaining({
        intent: "error",
        notice: "No se puede quitar el último super admin.",
      }),
    );
  });
});
