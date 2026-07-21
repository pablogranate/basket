import { afterEach, describe, expect, it, vi } from "vitest";

import {
  isSectionAllowedForContext,
  resolveSectionAiContext,
} from "@/lib/ai/section-context";
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

// Stub the two server-side helpers so the route never touches the DB. The real
// `sectionRefSchema` (from @/lib/ai/section-keys) stays in play, so the route
// validates section refs exactly as it does in production.
vi.mock("@/lib/ai/section-context", () => ({
  isSectionAllowedForContext: vi.fn(),
  resolveSectionAiContext: vi.fn(),
}));

const mockedGetUserContext = vi.mocked(getUserContext);
const mockedGetGeminiRuntimeConfig = vi.mocked(getGeminiRuntimeConfig);
const mockedConsumeGuestRateLimit = vi.mocked(consumeGuestRateLimit);
const mockedIsSectionAllowed = vi.mocked(isSectionAllowedForContext);
const mockedResolveContext = vi.mocked(resolveSectionAiContext);

const geminiConfigWithoutKey = {
  apiKey: "",
  model: "gemini-2.5-flash" as const,
  source: "env" as const,
  hasGeminiKey: false,
  hasPersonalGeminiKey: false,
  hasPortalGeminiKey: false,
  hasEnvGeminiKey: false,
};

function buildRequest(body: Record<string, unknown>) {
  return new Request("https://portal.basket-app.test/api/ai/section", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": "203.0.113.9",
    },
    body: JSON.stringify(body),
  });
}

function refBody(overrides: Record<string, unknown> = {}) {
  return {
    section: "Producción",
    question: "¿Qué partidos hay hoy?",
    contextLabel: "Grilla visible",
    contextRef: { section: "grid", params: {} },
    ...overrides,
  };
}

describe("api/ai/section POST", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns 429 for a guest over the rate limit (handler not reached)", async () => {
    mockedGetUserContext.mockResolvedValue(makeGuestContext());
    mockedConsumeGuestRateLimit.mockResolvedValue({
      allowed: false,
      remainingPoints: 0,
      msBeforeNext: 60000,
    });
    const { POST } = await import("../route");

    const response = await POST(buildRequest(refBody()));

    expect(response.status).toBe(429);
    expect(mockedResolveContext).not.toHaveBeenCalled();
    expect(mockedGetGeminiRuntimeConfig).not.toHaveBeenCalled();
  });

  it("rejects a section the caller is not authorized to see (403)", async () => {
    mockedGetUserContext.mockResolvedValue(makeGuestContext());
    mockedConsumeGuestRateLimit.mockResolvedValue({
      allowed: true,
      remainingPoints: 4,
      msBeforeNext: 0,
    });
    mockedIsSectionAllowed.mockReturnValue(false);
    const { POST } = await import("../route");

    const response = await POST(
      buildRequest(refBody({ contextRef: { section: "people" } })),
    );

    expect(response.status).toBe(403);
    expect(mockedResolveContext).not.toHaveBeenCalled();
    expect(mockedGetGeminiRuntimeConfig).not.toHaveBeenCalled();
  });

  it("rebuilds the context server-side when the section is allowed", async () => {
    mockedGetUserContext.mockResolvedValue(makeUserContext({ role: "editor" }));
    mockedIsSectionAllowed.mockReturnValue(true);
    mockedResolveContext.mockResolvedValue([{ partido: "A vs B" }]);
    mockedGetGeminiRuntimeConfig.mockResolvedValue(geminiConfigWithoutKey);
    const { POST } = await import("../route");

    const response = await POST(buildRequest(refBody()));

    // No client blob is trusted: the route derived the dataset itself.
    expect(mockedResolveContext).toHaveBeenCalledTimes(1);
    expect(mockedConsumeGuestRateLimit).not.toHaveBeenCalled();
    // Missing Gemini key short-circuits to 400 after the rebuild.
    expect(response.status).toBe(400);
  });

  it("rejects a malformed contextRef via the real schema (400)", async () => {
    mockedGetUserContext.mockResolvedValue(makeUserContext({ role: "editor" }));
    const { POST } = await import("../route");

    const response = await POST(
      buildRequest(refBody({ contextRef: { section: "bogus-section" } })),
    );

    expect(response.status).toBe(400);
    expect(mockedIsSectionAllowed).not.toHaveBeenCalled();
    expect(mockedResolveContext).not.toHaveBeenCalled();
  });

  it("still accepts a legacy client-posted context (no contextRef)", async () => {
    mockedGetUserContext.mockResolvedValue(makeUserContext({ role: "editor" }));
    mockedGetGeminiRuntimeConfig.mockResolvedValue(geminiConfigWithoutKey);
    const { POST } = await import("../route");

    const response = await POST(
      buildRequest({
        section: "Incidencias",
        question: "¿Cuántas incidencias hay?",
        contextLabel: "Incidencias visibles",
        context: [{ incidencia: "A" }],
      }),
    );

    expect(mockedIsSectionAllowed).not.toHaveBeenCalled();
    expect(mockedResolveContext).not.toHaveBeenCalled();
    expect(mockedGetGeminiRuntimeConfig).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(400);
  });
});
