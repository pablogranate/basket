import { describe, expect, it } from "vitest";

import type { FixturesSyncResult } from "@/lib/fixtures/sync";
import { buildFixturesSyncAlert } from "@/lib/fixtures/sync-alert";

function result(overrides: Partial<FixturesSyncResult> = {}): FixturesSyncResult {
  return {
    skipped: false,
    reason: null,
    from: "2026-10-20",
    to: "2026-12-11",
    fetched: {},
    upserted: 949,
    deleted: 2,
    linked: 0,
    warnings: [],
    errors: [],
    ...overrides,
  };
}

describe("buildFixturesSyncAlert", () => {
  it("stays quiet on a clean run, even with link warnings", () => {
    expect(buildFixturesSyncAlert({ result: result({ warnings: ["sin partido oficial para 1"] }) })).toBeNull();
  });

  it("stays quiet on a skipped run", () => {
    expect(buildFixturesSyncAlert({ result: result({ skipped: true, reason: "cooldown" }) })).toBeNull();
  });

  it("names every failed feed once", () => {
    const alert = buildFixturesSyncAlert({
      result: result({ errors: ["lba: timeout", "acb-liga-endesa: fila 3 sin fecha", "lba: 500"] }),
    });

    expect(alert?.subject).toBe("[fixtures-sync] Error en lba, acb-liga-endesa");
    expect(alert?.text).toContain("- acb-liga-endesa: fila 3 sin fecha");
  });

  it("reports a run that threw", () => {
    const alert = buildFixturesSyncAlert({ error: "connection refused" });

    expect(alert?.subject).toBe("[fixtures-sync] La corrida falló");
    expect(alert?.text).toContain("connection refused");
  });
});
