import { afterEach, describe, expect, it, vi } from "vitest";

import { getUserContext } from "@/lib/auth";
import { makeGuestContext, makeUserContext } from "@/test/fixtures/user-context";

vi.mock("@/lib/auth", () => ({
  getUserContext: vi.fn(),
}));

const mockedGetUserContext = vi.mocked(getUserContext);

function buildRequest(query = "?teamName=Cimarrones") {
  return new Request(
    `https://portal.basket-app.test/api/team-logo${query}`,
  );
}

describe("api/team-logo GET auth", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when there is no session", async () => {
    mockedGetUserContext.mockResolvedValue(makeGuestContext());
    const { GET } = await import("../route");

    const response = await GET(buildRequest());

    expect(response.status).toBe(401);
  });

  it("resolves the logo for an authenticated session", async () => {
    mockedGetUserContext.mockResolvedValue(makeUserContext({ role: "viewer" }));
    const { GET } = await import("../route");

    const response = await GET(buildRequest());

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty("src");
  });

  it("returns 400 for an authenticated session without teamName", async () => {
    mockedGetUserContext.mockResolvedValue(makeUserContext({ role: "viewer" }));
    const { GET } = await import("../route");

    const response = await GET(buildRequest(""));

    expect(response.status).toBe(400);
  });
});
