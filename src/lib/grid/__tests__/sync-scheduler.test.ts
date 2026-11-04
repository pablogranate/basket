import { DrizzleQueryError } from "drizzle-orm";
import cron from "node-cron";
import { afterEach, describe, expect, it, vi } from "vitest";

import { runGridSync } from "@/lib/grid/sync";
import { registerGridSyncScheduler } from "@/lib/grid/sync-scheduler";
import { reportServerError } from "@/lib/telemetry";

vi.mock("node-cron", () => ({
  default: { validate: () => true, schedule: vi.fn() },
}));
vi.mock("@/lib/env", () => ({
  appEnv: { gridSyncEnabled: true, gridSyncCron: "*/30 * * * *" },
}));
vi.mock("@/lib/grid/sync", () => ({
  getLastSuccessfulSync: vi.fn(async () => null),
  runGridSync: vi.fn(),
}));
vi.mock("@/lib/telemetry", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/telemetry")>()),
  reportServerError: vi.fn(),
}));

describe("grid-sync cron", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reports a failed run once as the grid-sync job", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const failure = new DrizzleQueryError("select 1", []);
    vi.mocked(runGridSync).mockRejectedValue(failure);

    registerGridSyncScheduler();
    const tick = vi.mocked(cron.schedule).mock.calls[0]?.[1] as () => void;
    tick();
    await vi.waitFor(() => expect(vi.mocked(reportServerError)).toHaveBeenCalled());

    expect(vi.mocked(reportServerError)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(reportServerError)).toHaveBeenCalledWith(failure, {
      route: "grid-sync",
      routeType: "job",
    });
    expect(errorLog).toHaveBeenCalledTimes(1);
  });
});
