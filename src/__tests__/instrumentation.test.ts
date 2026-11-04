import { markError, startEvent } from "basket-tv-telemetry/log";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { onRequestError } from "@/instrumentation";
import { telemetry } from "@/lib/telemetry";

vi.mock("@/lib/telemetry", () => ({
  telemetry: { reportServerError: vi.fn(), trackServerEvent: vi.fn(), flush: vi.fn() },
}));

const renderContext = {
  routerKind: "App Router" as const,
  routePath: "/match/[id]",
  routeType: "render" as const,
  revalidateReason: undefined,
};

describe("onRequestError", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("reports the error with the method and the route pattern, never the concrete path", async () => {
    const error = new Error("boom");

    await onRequestError(
      error,
      { path: "/match/0b6c1f0e-1111-2222-3333-444455556666?tab=staff", method: "GET", headers: {} },
      renderContext,
    );

    expect(vi.mocked(telemetry.reportServerError)).toHaveBeenCalledWith(error, {
      method: "GET",
      route: "/match/[id]",
      route_type: "render",
      request_id: undefined,
    });
  });

  it("passes the request id of the line the error marked", async () => {
    const error = new Error("boom");
    const event = startEvent("request", { request_id: "req-12345678" });
    markError(error, event);

    await onRequestError(error, { path: "/api/x", method: "POST", headers: {} }, renderContext);

    expect(vi.mocked(telemetry.reportServerError)).toHaveBeenCalledWith(
      error,
      expect.objectContaining({ request_id: "req-12345678" }),
    );
  });
});
