import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { syncGridAction } from "@/app/actions/grid-sync";
import { redirectWithNotice } from "@/app/actions/helpers";
import { requireEditor } from "@/lib/auth";
import { runGridSync } from "@/lib/grid/sync";
import { trackServerEvent } from "@/lib/telemetry";
import { makeUserContext } from "@/test/fixtures/user-context";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireEditor: vi.fn() }));
vi.mock("@/lib/grid/sync", () => ({
  previewGridSync: vi.fn(),
  runGridSync: vi.fn(),
}));
vi.mock("@/lib/telemetry", () => ({ trackServerEvent: vi.fn() }));
vi.mock("@/app/actions/helpers", () => ({
  getRedirectTarget: (_formData: FormData, fallback: string) => fallback,
  redirectWithNotice: vi.fn(),
  rethrowNavigationError: () => {},
}));

type SyncResult = Awaited<ReturnType<typeof runGridSync>>;

function syncResult(overrides: Partial<SyncResult>): SyncResult {
  return {
    skipped: false,
    created: 0,
    updated: 0,
    unchanged: 0,
    deleted: 0,
    assignmentsUpserted: 0,
    assignmentsDeleted: 0,
    tabsMissing: [],
    errors: [],
    ...overrides,
  } as SyncResult;
}

// The manual grid sync emits grid_synced (basket-telemetry SPEC §11.4) only
// when it actually ran.
describe("syncGridAction telemetry", () => {
  beforeEach(() => {
    vi.mocked(requireEditor).mockResolvedValue(makeUserContext());
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("tracks grid_synced with the created and updated counts", async () => {
    vi.mocked(runGridSync).mockResolvedValue(syncResult({ created: 3, updated: 5 }));

    await syncGridAction(new FormData());

    expect(vi.mocked(trackServerEvent)).toHaveBeenCalledWith(
      "grid_synced",
      "user-test-1",
      { created: 3, updated: 5 },
    );
    expect(vi.mocked(redirectWithNotice)).toHaveBeenCalledWith(
      expect.objectContaining({ intent: "success" }),
    );
  });

  it("tracks nothing when another sync is already running", async () => {
    vi.mocked(runGridSync).mockResolvedValue(syncResult({ skipped: true }));

    await syncGridAction(new FormData());

    expect(vi.mocked(trackServerEvent)).not.toHaveBeenCalled();
  });
});
