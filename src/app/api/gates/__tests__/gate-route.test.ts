import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/gates/[app]/route";
import { getUserContext } from "@/lib/auth";
import type { AppRole } from "@/lib/database.types";
import { makeGuestContext, makeUserContext } from "@/test/fixtures/user-context";

vi.mock("@/lib/auth", () => ({
  getUserContext: vi.fn(),
}));

const mockedGetUserContext = vi.mocked(getUserContext);

function callGate(app: string) {
  return GET(new Request(`https://portal.basket-app.test/api/gates/${app}`), {
    params: Promise.resolve({ app }),
  });
}

describe("GET /api/gates/[app]", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns 404 for an app outside the allowlist, even with an admin session", async () => {
    mockedGetUserContext.mockResolvedValue(makeUserContext({ role: "admin" }));

    const response = await callGate("nope");

    expect(response.status).toBe(404);
  });

  it("returns 401 for the generator gate without a session", async () => {
    mockedGetUserContext.mockResolvedValue(makeGuestContext());

    const response = await callGate("generator");

    expect(response.status).toBe(401);
  });

  it.each<AppRole>(["collaborator", "viewer"])(
    "returns 403 for the generator gate with a %s session",
    async (role) => {
      mockedGetUserContext.mockResolvedValue(makeUserContext({ role }));

      const response = await callGate("generator");

      expect(response.status).toBe(403);
    },
  );

  it.each<AppRole>(["admin", "editor", "coordinator"])(
    "returns 204 with an empty body for the generator gate with a %s session",
    async (role) => {
      mockedGetUserContext.mockResolvedValue(makeUserContext({ role }));

      const response = await callGate("generator");

      expect(response.status).toBe(204);
      expect(await response.text()).toBe("");
    },
  );
});
