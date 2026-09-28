import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/gates/[app]/route";
import { getEffectiveAccess } from "@/lib/acceso/accesos";
import { getUserContext } from "@/lib/auth";
import { makeGuestContext, makeUserContext } from "@/test/fixtures/user-context";

vi.mock("@/lib/auth", () => ({
  getUserContext: vi.fn(),
}));

vi.mock("@/lib/acceso/accesos", () => ({
  getEffectiveAccess: vi.fn(),
}));

const mockedGetUserContext = vi.mocked(getUserContext);
const mockedGetAccess = vi.mocked(getEffectiveAccess);

function callGate(app: string) {
  return GET(new Request(`https://portal.basket-app.test/api/gates/${app}`), {
    params: Promise.resolve({ app }),
  });
}

const GENERATOR_RANKS = { read: 10, write: 20, admin: 30 } as const;

function accessFor(
  userId: string,
  role: keyof typeof GENERATOR_RANKS,
  viaSuperadmin = false,
) {
  return {
    userId,
    app: "generator",
    role,
    rank: GENERATOR_RANKS[role],
    isAdmin: role === "admin",
    viaSuperadmin,
  };
}

// The App gate in front of the generator (ADRs 0009/0010): identity alone
// admits nobody; any `generator` role in auth_effective_access does, and a
// super admin resolves to the admin role.
describe("GET /api/gates/[app]", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns 404 for an app outside the gate allowlist, even with an admin session", async () => {
    mockedGetUserContext.mockResolvedValue(makeUserContext({ role: "admin" }));
    mockedGetAccess.mockResolvedValue(accessFor("user-test-1", "admin"));

    const response = await callGate("nope");

    expect(response.status).toBe(404);
    expect(mockedGetAccess).not.toHaveBeenCalled();
  });

  it("returns 404 for a sibling app that is not gated by nginx (readers gate themselves)", async () => {
    mockedGetUserContext.mockResolvedValue(makeUserContext({ role: "admin" }));
    mockedGetAccess.mockResolvedValue(accessFor("user-test-1", "admin"));

    const response = await callGate("ops");

    expect(response.status).toBe(404);
  });

  it("returns 401 for the generator gate without a session", async () => {
    mockedGetUserContext.mockResolvedValue(makeGuestContext());

    const response = await callGate("generator");

    expect(response.status).toBe(401);
    expect(mockedGetAccess).not.toHaveBeenCalled();
  });

  it("returns 403 with a session but no generator access, whatever the portal role", async () => {
    mockedGetUserContext.mockResolvedValue(makeUserContext({ role: "admin" }));
    mockedGetAccess.mockResolvedValue(null);

    const response = await callGate("generator");

    expect(response.status).toBe(403);
    expect(mockedGetAccess).toHaveBeenCalledWith("user-test-1", "generator");
  });

  it.each(["read", "write", "admin"] as const)(
    "returns 204 with an empty body for any generator role (%s), even without a Cuenta",
    async (role) => {
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
      mockedGetAccess.mockResolvedValue(accessFor("user-gen-1", role));

      const response = await callGate("generator");

      expect(response.status).toBe(204);
      expect(await response.text()).toBe("");
      expect(mockedGetAccess).toHaveBeenCalledWith("user-gen-1", "generator");
    },
  );

  it("returns 204 for a super admin with no generator grant of their own", async () => {
    mockedGetUserContext.mockResolvedValue(
      makeUserContext({ userId: "user-super-1", role: "collaborator" }),
    );
    mockedGetAccess.mockResolvedValue(
      accessFor("user-super-1", "admin", true),
    );

    const response = await callGate("generator");

    expect(response.status).toBe(204);
    expect(mockedGetAccess).toHaveBeenCalledWith("user-super-1", "generator");
  });
});
