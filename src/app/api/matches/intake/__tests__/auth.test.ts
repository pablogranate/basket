import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_KEY = process.env.INTAKE_API_KEY;

function buildRequest(headers: Record<string, string> = {}) {
  return new Request("https://portal.basket-app.test/api/matches/intake", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    // No externalId: if the handler runs it returns 400, proving auth passed.
    body: JSON.stringify({}),
  });
}

describe("api/matches/intake POST machine-auth", () => {
  beforeEach(() => {
    process.env.INTAKE_API_KEY = "test-intake-secret";
    vi.resetModules();
  });

  afterEach(() => {
    if (ORIGINAL_KEY === undefined) {
      delete process.env.INTAKE_API_KEY;
    } else {
      process.env.INTAKE_API_KEY = ORIGINAL_KEY;
    }
    vi.clearAllMocks();
  });

  it("returns 401 when the api key header is missing (handler not executed)", async () => {
    const { POST } = await import("../route");

    const response = await POST(buildRequest());

    expect(response.status).toBe(401);
  });

  it("returns 401 when the api key header is wrong (handler not executed)", async () => {
    const { POST } = await import("../route");

    const response = await POST(buildRequest({ "x-intake-key": "wrong" }));

    expect(response.status).toBe(401);
  });

  it("proceeds to the handler when the api key header is correct", async () => {
    const { POST } = await import("../route");

    const response = await POST(
      buildRequest({ "x-intake-key": "test-intake-secret" }),
    );

    // Handler ran: empty externalId short-circuits to 400 (not 401).
    expect(response.status).toBe(400);
  });
});
