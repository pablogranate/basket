import { afterEach, describe, expect, it, vi } from "vitest";

import { getUserContext } from "@/lib/auth";
import { getGeminiRuntimeConfig } from "@/lib/settings";
import { makeGuestContext, makeUserContext } from "@/test/fixtures/user-context";

vi.mock("@/lib/auth", () => ({
  getUserContext: vi.fn(),
}));

vi.mock("@/lib/settings", () => ({
  getGeminiRuntimeConfig: vi.fn(),
}));

const mockedGetUserContext = vi.mocked(getUserContext);
const mockedGetGeminiRuntimeConfig = vi.mocked(getGeminiRuntimeConfig);

function buildRequest() {
  return new Request("https://portal.basket-app.test/api/ai/people", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question: "¿Quién cubre el partido?",
      people: [
        {
          fullName: "Ana",
          role: "camara",
          coverage: "local",
          phone: "300",
          email: "ana@test",
          status: "ok",
          notes: "",
        },
      ],
    }),
  });
}

describe("api/ai/people POST auth", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when there is no session", async () => {
    mockedGetUserContext.mockResolvedValue(makeGuestContext());
    const { POST } = await import("../route");

    const response = await POST(buildRequest());

    expect(response.status).toBe(401);
    expect(mockedGetGeminiRuntimeConfig).not.toHaveBeenCalled();
  });

  it("returns 403 for an under-privileged role", async () => {
    mockedGetUserContext.mockResolvedValue(
      makeUserContext({ role: "collaborator" }),
    );
    const { POST } = await import("../route");

    const response = await POST(buildRequest());

    expect(response.status).toBe(403);
    expect(mockedGetGeminiRuntimeConfig).not.toHaveBeenCalled();
  });

  it("runs the handler for an editor (reaches the Gemini config read)", async () => {
    mockedGetUserContext.mockResolvedValue(makeUserContext({ role: "editor" }));
    mockedGetGeminiRuntimeConfig.mockResolvedValue({
      apiKey: "",
      model: "gemini-2.5-flash",
      source: "env",
    });
    const { POST } = await import("../route");

    const response = await POST(buildRequest());

    expect(mockedGetGeminiRuntimeConfig).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(400);
  });
});
