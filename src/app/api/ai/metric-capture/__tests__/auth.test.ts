import { afterEach, describe, expect, it, vi } from "vitest";

import { consumeGuestRateLimit } from "@/lib/api/rate-limit";
import { getUserContext } from "@/lib/auth";
import { getGeminiRuntimeConfig } from "@/lib/settings";
import { makeGuestContext, makeUserContext } from "@/test/fixtures/user-context";

vi.mock("@/lib/auth", () => ({
  getUserContext: vi.fn(),
}));

vi.mock("@/lib/settings", () => ({
  getGeminiRuntimeConfig: vi.fn(),
}));

vi.mock("@/lib/api/rate-limit", () => ({
  consumeGuestRateLimit: vi.fn(),
}));

const mockedGetUserContext = vi.mocked(getUserContext);
const mockedGetGeminiRuntimeConfig = vi.mocked(getGeminiRuntimeConfig);
const mockedConsumeGuestRateLimit = vi.mocked(consumeGuestRateLimit);

function buildRequest() {
  const form = new FormData();
  form.set("image", new File(["bytes"], "shot.png", { type: "image/png" }));
  form.set("kind", "speedtest");
  return new Request("https://portal.basket-app.test/api/ai/metric-capture", {
    method: "POST",
    headers: { "x-forwarded-for": "203.0.113.7" },
    body: form,
  });
}

describe("api/ai/metric-capture POST auth (guest-allowed)", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("lets a guest through when under the rate limit (does not 401)", async () => {
    mockedGetUserContext.mockResolvedValue(makeGuestContext());
    mockedConsumeGuestRateLimit.mockResolvedValue({
      allowed: true,
      remainingPoints: 4,
      msBeforeNext: 0,
    });
    mockedGetGeminiRuntimeConfig.mockResolvedValue({
      apiKey: "",
      model: "gemini-2.5-flash",
      source: "env",
    });
    const { POST } = await import("../route");

    const response = await POST(buildRequest());

    expect(response.status).not.toBe(401);
    expect(mockedConsumeGuestRateLimit).toHaveBeenCalledTimes(1);
    expect(mockedGetGeminiRuntimeConfig).toHaveBeenCalledTimes(1);
  });

  it("returns 429 for a guest over the rate limit (handler not reached)", async () => {
    mockedGetUserContext.mockResolvedValue(makeGuestContext());
    mockedConsumeGuestRateLimit.mockResolvedValue({
      allowed: false,
      remainingPoints: 0,
      msBeforeNext: 60000,
    });
    const { POST } = await import("../route");

    const response = await POST(buildRequest());

    expect(response.status).toBe(429);
    expect(mockedGetGeminiRuntimeConfig).not.toHaveBeenCalled();
  });

  it("does not rate-limit an authenticated user", async () => {
    mockedGetUserContext.mockResolvedValue(makeUserContext({ role: "editor" }));
    mockedGetGeminiRuntimeConfig.mockResolvedValue({
      apiKey: "",
      model: "gemini-2.5-flash",
      source: "env",
    });
    const { POST } = await import("../route");

    const response = await POST(buildRequest());

    expect(mockedConsumeGuestRateLimit).not.toHaveBeenCalled();
    expect(mockedGetGeminiRuntimeConfig).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(400);
  });
});
