import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { completeFichaAction } from "@/app/actions/ficha-completion";
import { redirectWithNotice } from "@/app/actions/helpers";
import { requireAccess } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { resolveFuncionRoleId } from "@/lib/people/ficha-completion-data";
import { completeOwnFicha } from "@/lib/people/identity";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireAccess: vi.fn() }));
vi.mock("@/lib/audit", () => ({ writeAudit: vi.fn() }));
vi.mock("@/lib/db/client", () => ({
  db: { transaction: (run: (tx: unknown) => unknown) => run({ name: "tx" }) },
}));
vi.mock("@/lib/people/ficha-completion-data", () => ({
  resolveFuncionRoleId: vi.fn(),
}));
vi.mock("@/lib/people/identity", () => ({ completeOwnFicha: vi.fn() }));
vi.mock("@/app/actions/helpers", () => ({
  getRedirectTarget: (formData: FormData, fallback: string) =>
    String(formData.get("redirectTo") ?? fallback),
  redirectWithNotice: vi.fn(),
  rethrowNavigationError: () => {},
}));

const mockedRedirect = vi.mocked(redirectWithNotice);
const mockedComplete = vi.mocked(completeOwnFicha);

function form(entries: Record<string, string> = {}) {
  const formData = new FormData();
  const values: Record<string, string> = {
    funcion: "Relator",
    phone: "+5491122334455",
    pais: "AR",
    ciudad: "Córdoba",
    redirectTo: "/mi-jornada",
    ...entries,
  };
  for (const [key, value] of Object.entries(values)) formData.set(key, value);
  return formData;
}

// basket#202: the completion modal writes the ficha with no approval.
describe("completeFichaAction", () => {
  beforeEach(() => {
    vi.mocked(requireAccess).mockResolvedValue({
      userId: "user-1",
      profileId: "profile-1",
      email: "ana@example.com",
      profile: { full_name: "Ana Pérez" },
      hasAccess: true,
    } as Awaited<ReturnType<typeof requireAccess>>);
    vi.mocked(resolveFuncionRoleId).mockResolvedValue("role-relator");
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("creates the ficha for the session's own Cuenta and audits it", async () => {
    mockedComplete.mockResolvedValue({ kind: "created", personId: "person-1" });

    await completeFichaAction(form());

    expect(mockedComplete).toHaveBeenCalledWith(
      { name: "tx" },
      expect.objectContaining({
        profileId: "profile-1",
        email: "ana@example.com",
        fullName: "Ana Pérez",
        phone: "+5491122334455",
        roleId: "role-relator",
        ciudad: "Córdoba, Argentina",
      }),
    );
    expect(writeAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ table: "people", recordId: "person-1", action: "INSERT" }),
    );
    expect(mockedRedirect).toHaveBeenCalledWith(
      expect.objectContaining({ intent: "success", notice: "Listo, creamos tu ficha.", redirectTo: "/mi-jornada" }),
    );
  });

  it("links an email-matched ficha", async () => {
    mockedComplete.mockResolvedValue({ kind: "linked", personId: "person-2" });

    await completeFichaAction(form());

    expect(writeAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ recordId: "person-2", action: "UPDATE" }),
    );
    expect(mockedRedirect).toHaveBeenCalledWith(
      expect.objectContaining({ notice: "Listo, vinculamos tu ficha." }),
    );
  });

  it("leaves a name-only match to the admins and writes no audit", async () => {
    mockedComplete.mockResolvedValue({ kind: "review" });

    await completeFichaAction(form());

    expect(writeAudit).not.toHaveBeenCalled();
    expect(mockedRedirect).toHaveBeenCalledWith(
      expect.objectContaining({
        notice: "Encontramos una ficha con tu nombre: un admin la va a vincular a tu cuenta.",
      }),
    );
  });

  it("refuses without the portal Acceso", async () => {
    vi.mocked(requireAccess).mockRejectedValue(new Error("Sin acceso"));

    await completeFichaAction(form());

    expect(mockedComplete).not.toHaveBeenCalled();
    expect(mockedRedirect).toHaveBeenCalledWith(
      expect.objectContaining({ intent: "error", notice: "Sin acceso" }),
    );
  });

  it("rejects a función outside the list before writing", async () => {
    await completeFichaAction(form({ funcion: "Director" }));

    expect(mockedComplete).not.toHaveBeenCalled();
    expect(mockedRedirect).toHaveBeenCalledWith(
      expect.objectContaining({ intent: "error", notice: "Elegí una función de la lista." }),
    );
  });
});
