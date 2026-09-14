import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/gates/[app]/route";
import { getAcceso } from "@/lib/acceso/accesos";
import { getUserContext } from "@/lib/auth";
import { makeGuestContext, makeUserContext } from "@/test/fixtures/user-context";

vi.mock("@/lib/auth", () => ({
  getUserContext: vi.fn(),
}));

vi.mock("@/lib/acceso/accesos", () => ({
  getAcceso: vi.fn(),
}));

const mockedGetUserContext = vi.mocked(getUserContext);
const mockedGetAcceso = vi.mocked(getAcceso);

function callGate(app: string) {
  return GET(new Request(`https://portal.basket-app.test/api/gates/${app}`), {
    params: Promise.resolve({ app }),
  });
}

function accesoFor(userId: string, level: "read" | "write" | "admin") {
  return {
    userId,
    app: "generator" as const,
    level,
    grantedBy: "user-admin",
    grantedAt: new Date("2026-09-14T12:00:00Z"),
  };
}

// The App gate in front of the generator (ADR 0009): identity alone admits
// nobody; an Acceso for `generator` at any Nivel does.
describe("GET /api/gates/[app]", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns 404 for an app outside the gate allowlist, even with an admin session", async () => {
    mockedGetUserContext.mockResolvedValue(makeUserContext({ role: "admin" }));
    mockedGetAcceso.mockResolvedValue(accesoFor("user-test-1", "admin"));

    const response = await callGate("nope");

    expect(response.status).toBe(404);
    expect(mockedGetAcceso).not.toHaveBeenCalled();
  });

  it("returns 404 for a sibling app that is not gated by nginx (readers gate themselves)", async () => {
    mockedGetUserContext.mockResolvedValue(makeUserContext({ role: "admin" }));
    mockedGetAcceso.mockResolvedValue(accesoFor("user-test-1", "admin"));

    const response = await callGate("ops");

    expect(response.status).toBe(404);
  });

  it("returns 401 for the generator gate without a session", async () => {
    mockedGetUserContext.mockResolvedValue(makeGuestContext());

    const response = await callGate("generator");

    expect(response.status).toBe(401);
    expect(mockedGetAcceso).not.toHaveBeenCalled();
  });

  it("returns 403 with a session but no generator Acceso, whatever the portal role", async () => {
    mockedGetUserContext.mockResolvedValue(makeUserContext({ role: "admin" }));
    mockedGetAcceso.mockResolvedValue(null);

    const response = await callGate("generator");

    expect(response.status).toBe(403);
    expect(mockedGetAcceso).toHaveBeenCalledWith("user-test-1", "generator");
  });

  it.each(["read", "write", "admin"] as const)(
    "returns 204 with an empty body for any generator Acceso (%s), even without a Cuenta",
    async (level) => {
      // Authenticated but unprovisioned on the portal: no profile, no role.
      mockedGetUserContext.mockResolvedValue(
        makeUserContext({
          userId: "user-gen-1",
          role: "collaborator",
          hasAccess: false,
          profileId: null,
          profile: null,
        } as never),
      );
      mockedGetAcceso.mockResolvedValue(accesoFor("user-gen-1", level));

      const response = await callGate("generator");

      expect(response.status).toBe(204);
      expect(await response.text()).toBe("");
      expect(mockedGetAcceso).toHaveBeenCalledWith("user-gen-1", "generator");
    },
  );
});
