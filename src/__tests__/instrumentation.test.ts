import { afterEach, describe, expect, it, vi } from "vitest";

import { onRequestError } from "@/instrumentation";
import { reportServerError } from "@/lib/telemetry";

vi.mock("@/lib/telemetry", () => ({
  reportServerError: vi.fn(),
}));

describe("onRequestError", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("reports the error with the method and the route pattern, never the concrete path", async () => {
    const error = new Error("boom");

    await onRequestError(
      error,
      { path: "/match/0b6c1f0e-1111-2222-3333-444455556666?tab=staff", method: "GET", headers: {} },
      {
        routerKind: "App Router",
        routePath: "/match/[id]",
        routeType: "render",
        revalidateReason: undefined,
      },
    );

    expect(vi.mocked(reportServerError)).toHaveBeenCalledWith(error, {
      method: "GET",
      route: "/match/[id]",
      routeType: "render",
    });
  });
});
