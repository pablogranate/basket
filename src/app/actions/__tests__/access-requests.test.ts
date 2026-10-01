import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { submitAccessRequestAction } from "@/app/actions/access-requests";
import { redirectWithNotice } from "@/app/actions/helpers";
import { listCatalogApps } from "@/lib/acceso/accesos";
import { notifyAccessRequest } from "@/lib/access-requests/notify";
import { submitAccessRequest } from "@/lib/access-requests/requests";
import { requireUserContext } from "@/lib/auth";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  requireUserContext: vi.fn(),
  clearProfileCache: vi.fn(),
}));
vi.mock("@/lib/auth-access", () => ({
  requireAccessRequestApprover: vi.fn(),
  requireAdmin: vi.fn(),
}));
vi.mock("@/lib/acceso/accesos", () => ({ listCatalogApps: vi.fn() }));
vi.mock("@/lib/access-requests/requests", () => ({
  claimAccessRequest: vi.fn(),
  submitAccessRequest: vi.fn(),
}));
vi.mock("@/lib/access-requests/notify", () => ({ notifyAccessRequest: vi.fn() }));
vi.mock("@/lib/access-requests/portal-approval", () => ({
  approvePortalAccessRequest: vi.fn(),
}));
vi.mock("@/lib/audit", () => ({ writeAudit: vi.fn() }));
vi.mock("@/lib/db/auth-client", () => ({ authDb: { name: "authDb" } }));
vi.mock("@/lib/db/client", () => ({ db: {} }));
vi.mock("@/lib/email/mailer", () => ({ sendCollaboratorInviteEmail: vi.fn() }));
vi.mock("@/lib/people/identity", () => ({ linkProfileToPerson: vi.fn() }));
vi.mock("@/app/actions/helpers", () => ({
  getRedirectTarget: (formData: FormData, fallback: string) =>
    String(formData.get("redirectTo") ?? fallback),
  redirectWithNotice: vi.fn(),
  rethrowNavigationError: () => {},
}));

const mockedRedirect = vi.mocked(redirectWithNotice);
const mockedSubmit = vi.mocked(submitAccessRequest);

function form(entries: Record<string, string>) {
  const formData = new FormData();
  const values: Record<string, string> = {
    fullName: "Ana Pérez",
    phone: "+5491122334455",
    pais: "AR",
    ciudad: "Córdoba",
    ...entries,
  };
  for (const [key, value] of Object.entries(values)) formData.set(key, value);
  return formData;
}

// The submit action files the Solicitud for the app the form names, checked
// against the catalog (basket#198).
describe("submitAccessRequestAction", () => {
  beforeEach(() => {
    vi.mocked(requireUserContext).mockResolvedValue({
      userId: "user-1",
      email: "Ana@Example.com",
    } as Awaited<ReturnType<typeof requireUserContext>>);
    vi.mocked(listCatalogApps).mockResolvedValue([
      { key: "portal", label: "Portal" },
      { key: "facturacion", label: "Facturación" },
    ]);
    mockedSubmit.mockResolvedValue({ id: "req-1", email: "ana@example.com" });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("files a sibling Solicitud without a Función and notifies that app", async () => {
    await submitAccessRequestAction(
      form({ app: "facturacion", funcion: "Relator", redirectTo: "/no-access?app=facturacion" }),
    );

    expect(mockedSubmit).toHaveBeenCalledWith(
      { name: "authDb" },
      expect.objectContaining({ userId: "user-1", app: "facturacion", funcion: null }),
    );
    expect(vi.mocked(notifyAccessRequest)).toHaveBeenCalledWith(
      expect.objectContaining({ app: "facturacion", appLabel: "Facturación" }),
    );
    expect(mockedRedirect).toHaveBeenCalledWith(
      expect.objectContaining({
        intent: "success",
        redirectTo: "/no-access?app=facturacion",
      }),
    );
  });

  it("files an unknown app as a portal Solicitud", async () => {
    await submitAccessRequestAction(form({ app: "evil", funcion: "Relator" }));

    expect(mockedSubmit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ app: "portal", funcion: "Relator" }),
    );
  });

  it("refuses a portal Solicitud without a Función", async () => {
    await submitAccessRequestAction(form({ app: "portal" }));

    expect(mockedSubmit).not.toHaveBeenCalled();
    expect(mockedRedirect).toHaveBeenCalledWith(
      expect.objectContaining({
        intent: "error",
        notice: "Elegí una función de la lista.",
        redirectTo: "/no-access?app=portal",
      }),
    );
  });

  it("keeps the Solicitud when the notification fails", async () => {
    vi.mocked(notifyAccessRequest).mockRejectedValue(new Error("smtp down"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    await submitAccessRequestAction(form({ app: "facturacion" }));

    expect(mockedSubmit).toHaveBeenCalled();
    expect(mockedRedirect).toHaveBeenCalledWith(
      expect.objectContaining({ intent: "success" }),
    );
  });
});
