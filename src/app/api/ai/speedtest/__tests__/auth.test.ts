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
  const form = new FormData();
  form.set("image", new File(["bytes"], "shot.png", { type: "image/png" }));
  return new Request("https://portal.basket-app.test/api/ai/speedtest", {
    method: "POST",
    body: form,
  });
}

describe("api/ai/speedtest POST auth", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when there is no session (non-guest route)", async () => {
    mockedGetUserContext.mockResolvedValue(makeGuestContext());
    const { POST } = await import("../route");

    const response = await POST(buildRequest());

    expect(response.status).toBe(401);
    expect(mockedGetGeminiRuntimeConfig).not.toHaveBeenCalled();
  });

  it("runs the handler for an authenticated user (reaches Gemini config read)", async () => {
    mockedGetUserContext.mockResolvedValue(makeUserContext({ role: "editor" }));
    mockedGetGeminiRuntimeConfig.mockResolvedValue({
      apiKey: "",
      model: "gemini-2.5-flash",
      source: "env",

      hasGeminiKey: false,

      hasPersonalGeminiKey: false,

      hasPortalGeminiKey: false,

      hasEnvGeminiKey: false,
    });
    const { POST } = await import("../route");

    const response = await POST(buildRequest());

    expect(mockedGetGeminiRuntimeConfig).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(400);
  });
});
