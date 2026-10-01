import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  approveAppAccessRequestAction,
  rejectAppAccessRequestAction,
} from "@/app/actions/app-access-requests";
import { redirectWithNotice } from "@/app/actions/helpers";
import {
  approveAppAccessRequest,
  rejectAppAccessRequest,
} from "@/lib/access-requests/app-approval";
import { sendCollaboratorInviteEmail } from "@/lib/email/mailer";
import { requireSuperAdmin } from "@/lib/usuarios/guard";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/usuarios/guard", () => ({ requireSuperAdmin: vi.fn() }));
vi.mock("@/lib/access-requests/app-approval", () => ({
  approveAppAccessRequest: vi.fn(),
  rejectAppAccessRequest: vi.fn(),
}));
vi.mock("@/lib/acceso/accesos", () => ({
  listCatalogApps: vi.fn(async () => [
    { key: "portal", label: "Portal" },
    { key: "facturacion", label: "Facturación" },
  ]),
}));
vi.mock("@/lib/email/mailer", () => ({ sendCollaboratorInviteEmail: vi.fn() }));
vi.mock("@/lib/env", () => ({
  appEnv: { portalBaseUrl: "https://portal.basket-app.com" },
}));
vi.mock("@/app/actions/helpers", () => ({
  getRedirectTarget: (formData: FormData, fallback: string) =>
    String(formData.get("redirectTo") ?? fallback),
  redirectWithNotice: vi.fn(),
  rethrowNavigationError: (error: unknown) => {
    if (error instanceof Error && error.message === "NO_ACCESS") {
      throw error;
    }
  },
}));

const mockedRedirect = vi.mocked(redirectWithNotice);
const mockedApprove = vi.mocked(approveAppAccessRequest);
const mockedReject = vi.mocked(rejectAppAccessRequest);
const mockedInvite = vi.mocked(sendCollaboratorInviteEmail);

function form(entries: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries({
    solicitudId: "req-1",
    app: "facturacion",
    redirectTo: "/",
    ...entries,
  })) {
    formData.set(key, value);
  }
  return formData;
}

// The apex bell's sibling decisions (basket#200): super admins only, checked
// server-side in every action.
describe("apex Solicitud actions", () => {
  beforeEach(() => {
    vi.mocked(requireSuperAdmin).mockResolvedValue({
      userId: "super-1",
      email: "super@basquetpass.tv",
      name: "Super",
    });
    mockedApprove.mockResolvedValue({
      email: "ana@example.com",
      userId: "user-1",
      roleLabel: "Coordinador",
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ["approve", () => approveAppAccessRequestAction(form({ rol: "admin" }))],
    ["reject", () => rejectAppAccessRequestAction(form({}))],
  ])("%s refuses anyone but a super admin", async (_name, act) => {
    vi.mocked(requireSuperAdmin).mockRejectedValue(new Error("NO_ACCESS"));

    await expect(act()).rejects.toThrow("NO_ACCESS");

    expect(mockedApprove).not.toHaveBeenCalled();
    expect(mockedReject).not.toHaveBeenCalled();
  });

  it("approves as the super admin and emails a link to the approved app", async () => {
    await approveAppAccessRequestAction(form({ rol: "coordinador" }));

    expect(mockedApprove).toHaveBeenCalledWith({
      requestId: "req-1",
      app: "facturacion",
      role: "coordinador",
      deciderId: "super-1",
    });
    expect(mockedInvite).toHaveBeenCalledWith({
      to: "ana@example.com",
      loginUrl: "https://facturacion.basket-app.com",
      appName: "Facturación",
    });
    expect(mockedRedirect).toHaveBeenCalledWith(
      expect.objectContaining({ intent: "success", redirectTo: "/" }),
    );
  });

  it("refuses an approval without a role", async () => {
    await approveAppAccessRequestAction(form({}));

    expect(mockedApprove).not.toHaveBeenCalled();
    expect(mockedRedirect).toHaveBeenCalledWith(
      expect.objectContaining({ intent: "error", notice: "Elegí un rol." }),
    );
  });

  it("surfaces a role outside the catalog as an error notice", async () => {
    mockedApprove.mockRejectedValue(new Error("Ese rol no existe en la app pedida."));

    await approveAppAccessRequestAction(form({ rol: "write" }));

    expect(mockedInvite).not.toHaveBeenCalled();
    expect(mockedRedirect).toHaveBeenCalledWith(
      expect.objectContaining({ intent: "error", notice: "Ese rol no existe en la app pedida." }),
    );
  });

  it("tells the losing decider the request was already resolved", async () => {
    mockedApprove.mockRejectedValue(new Error("Esta solicitud ya fue resuelta."));

    await approveAppAccessRequestAction(form({ rol: "coordinador" }));

    expect(mockedRedirect).toHaveBeenCalledWith(
      expect.objectContaining({ intent: "error", notice: "Esta solicitud ya fue resuelta." }),
    );
  });

  it("keeps the approval when the invite email fails", async () => {
    mockedInvite.mockRejectedValue(new Error("smtp down"));

    await approveAppAccessRequestAction(form({ rol: "coordinador" }));

    expect(mockedRedirect).toHaveBeenCalledWith(
      expect.objectContaining({
        intent: "success",
        notice: expect.stringContaining("No pudimos enviarle el correo de aviso."),
      }),
    );
  });

  it("rejects silently as the super admin", async () => {
    await rejectAppAccessRequestAction(form({}));

    expect(mockedReject).toHaveBeenCalledWith({
      requestId: "req-1",
      app: "facturacion",
      deciderId: "super-1",
    });
    expect(mockedInvite).not.toHaveBeenCalled();
  });
});
