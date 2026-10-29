import { afterEach, describe, expect, it, vi } from "vitest";

import { reportNoAccess } from "@/lib/access-requests/no-access";
import { reportAuthEvent } from "@/lib/telemetry";

vi.mock("@/lib/telemetry", () => ({ reportAuthEvent: vi.fn() }));

describe("reportNoAccess", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it.each(["form", "pending"] as const)(
    "reports no_access with the requested app and the user id (%s)",
    (view) => {
      reportNoAccess({ userId: "user-test-1", app: "facturacion", view });

      expect(vi.mocked(reportAuthEvent)).toHaveBeenCalledWith({
        type: "no_access",
        userId: "user-test-1",
        app: "facturacion",
        detail: { view },
      });
    },
  );

  it("reports nothing when the person holds the app and is sent on", () => {
    reportNoAccess({ userId: "user-test-1", app: "portal", view: "forward" });

    expect(vi.mocked(reportAuthEvent)).not.toHaveBeenCalled();
  });
});
