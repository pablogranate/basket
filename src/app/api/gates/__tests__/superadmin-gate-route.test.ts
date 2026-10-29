import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

import { GET as appGate } from "@/app/api/gates/[app]/route";
import { GET } from "@/app/api/gates/superadmin/route";
import { getEffectiveAccess } from "@/lib/acceso/accesos";
import { getUserContext } from "@/lib/auth";
import { findActiveSuperAdmin } from "@/lib/usuarios/super-admin";
import { makeGuestContext, makeUserContext } from "@/test/fixtures/user-context";

vi.mock("@/lib/auth", () => ({
  getUserContext: vi.fn(),
}));

vi.mock("@/lib/acceso/accesos", () => ({
  getEffectiveAccess: vi.fn(),
}));

vi.mock("@/lib/usuarios/super-admin", () => ({
  findActiveSuperAdmin: vi.fn(),
}));

const mockedGetUserContext = vi.mocked(getUserContext);
const mockedFindSuperAdmin = vi.mocked(findActiveSuperAdmin);

function callGate() {
  return GET(new Request("https://portal.basket-app.test/api/gates/superadmin"));
}

// The superadmin gate in front of server.basket-app.com (telemetry panel):
// only an active super admin passes, read live from the Auth DB.
describe("GET /api/gates/superadmin", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 without a session and never reads the Auth DB", async () => {
    mockedGetUserContext.mockResolvedValue(makeGuestContext());

    const response = await callGate();

    expect(response.status).toBe(401);
    expect(mockedFindSuperAdmin).not.toHaveBeenCalled();
  });

  it("returns 403 for a session that is not an active super admin, whatever the portal role", async () => {
    mockedGetUserContext.mockResolvedValue(makeUserContext({ role: "admin" }));
    mockedFindSuperAdmin.mockResolvedValue(null);

    const response = await callGate();

    expect(response.status).toBe(403);
    expect(mockedFindSuperAdmin).toHaveBeenCalledWith("user-test-1");
  });

  it("returns 403 when the session still says super admin but the Auth DB no longer does", async () => {
    mockedGetUserContext.mockResolvedValue(
      makeUserContext({ userId: "user-demoted-1", superAdmin: true }),
    );
    mockedFindSuperAdmin.mockResolvedValue(null);

    const response = await callGate();

    expect(response.status).toBe(403);
    expect(mockedFindSuperAdmin).toHaveBeenCalledWith("user-demoted-1");
  });

  it("returns 204 with an empty body for an active super admin", async () => {
    mockedGetUserContext.mockResolvedValue(
      makeUserContext({ userId: "user-super-1", role: "collaborator" }),
    );
    mockedFindSuperAdmin.mockResolvedValue({
      userId: "user-super-1",
      email: "super@basket-app.test",
      name: "Super de prueba",
    });

    const response = await callGate();

    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
  });

  it("lives in a static segment, which Next.js matches before the dynamic [app] gate", () => {
    const staticRoute = fileURLToPath(
      new URL("../superadmin/route.ts", import.meta.url),
    );

    expect(existsSync(staticRoute)).toBe(true);
  });

  it("is not answered by the [app] gate, which keeps 404 for 'superadmin'", async () => {
    mockedGetUserContext.mockResolvedValue(makeUserContext({ superAdmin: true }));

    const response = await appGate(
      new Request("https://portal.basket-app.test/api/gates/superadmin"),
      { params: Promise.resolve({ app: "superadmin" }) },
    );

    expect(response.status).toBe(404);
    expect(vi.mocked(getEffectiveAccess)).not.toHaveBeenCalled();
  });
});
