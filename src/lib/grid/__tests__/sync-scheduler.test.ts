import { DrizzleQueryError } from "drizzle-orm";
import cron from "node-cron";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { getLastSuccessfulSync, runGridSync } from "@/lib/grid/sync";
import { registerGridSyncScheduler } from "@/lib/grid/sync-scheduler";
import { telemetry } from "@/lib/telemetry";
import { captureLogLines } from "@/test/fixtures/log-lines";

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
vi.mock("@/lib/telemetry", () => ({
  telemetry: { reportServerError: vi.fn(), trackServerEvent: vi.fn(), flush: vi.fn() },
}));

let tick: () => void;

async function runTick(log: ReturnType<typeof captureLogLines>) {
  tick();
  await vi.waitFor(() => expect(log.lines.length).toBeGreaterThan(0));
}

describe("grid-sync cron", () => {
  let log: ReturnType<typeof captureLogLines>;

  beforeAll(() => {
    registerGridSyncScheduler();
    tick = vi.mocked(cron.schedule).mock.calls[0]?.[1] as () => void;
  });

  beforeEach(() => {
    log = captureLogLines();
  });

  afterEach(() => {
    log.restore();
    vi.clearAllMocks();
  });

  it("writes one job line per run", async () => {
    vi.mocked(runGridSync).mockResolvedValue({ skipped: false } as never);

    await runTick(log);

    expect(log.lines).toHaveLength(1);
    expect(log.lines[0]).toMatchObject({
      level: "info",
      kind: "job",
      route: "grid_sync",
      outcome: "ok",
    });
    expect(log.lines[0].duration_ms).toEqual(expect.any(Number));
  });

  it("says why a run was skipped in the same line", async () => {
    vi.mocked(getLastSuccessfulSync).mockResolvedValueOnce({
      started_at: new Date().toISOString(),
    } as never);

    await runTick(log);

    expect(log.lines).toHaveLength(1);
    expect(log.lines[0]).toMatchObject({ kind: "job", skipped: "recent_success" });
    expect(vi.mocked(runGridSync)).not.toHaveBeenCalled();
  });

  it("reports a failed run once and marks its one line as an error", async () => {
    const failure = new DrizzleQueryError("select 1", []);
    vi.mocked(runGridSync).mockRejectedValue(failure);

    await runTick(log);

    expect(vi.mocked(telemetry.reportServerError)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(telemetry.reportServerError)).toHaveBeenCalledWith(
      failure,
      expect.objectContaining({ route_type: "job" }),
    );
    expect(log.lines).toHaveLength(1);
    expect(log.lines[0]).toMatchObject({
      level: "error",
      kind: "job",
      route: "grid_sync",
      outcome: "error",
      error: { message: expect.stringContaining("Failed query") },
    });
  });
});
