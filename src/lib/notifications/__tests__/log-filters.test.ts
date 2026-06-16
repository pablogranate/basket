import { describe, expect, it } from "vitest";

import {
  EMPTY_NOTIFICATION_LOG_FILTERS,
  parseNotificationLogFilters,
  resolveTriggerValues,
} from "@/lib/notifications/log-filters";

describe("parseNotificationLogFilters", () => {
  it("returns empty defaults when no params are present", () => {
    expect(parseNotificationLogFilters({})).toEqual(
      EMPTY_NOTIFICATION_LOG_FILTERS,
    );
  });

  it("passes through valid enum values", () => {
    const filters = parseNotificationLogFilters({
      status: "failed",
      channel: "whatsapp",
      trigger: "automatic",
    });
    expect(filters.status).toBe("failed");
    expect(filters.channel).toBe("whatsapp");
    expect(filters.trigger).toBe("automatic");
  });

  it("drops unknown enum values back to empty", () => {
    const filters = parseNotificationLogFilters({
      status: "exploded",
      channel: "carrier-pigeon",
      trigger: "telepathy",
    });
    expect(filters.status).toBe("");
    expect(filters.channel).toBe("");
    expect(filters.trigger).toBe("");
  });

  it("trims free-text searches and date bounds", () => {
    const filters = parseNotificationLogFilters({
      recipient: "  Wenceslao  ",
      match: " Boca ",
      dateFrom: " 2026-06-01 ",
      dateTo: "2026-06-16",
    });
    expect(filters.recipient).toBe("Wenceslao");
    expect(filters.match).toBe("Boca");
    expect(filters.dateFrom).toBe("2026-06-01");
    expect(filters.dateTo).toBe("2026-06-16");
  });
});

describe("resolveTriggerValues", () => {
  it("expands automatic into the three machine triggers", () => {
    expect(resolveTriggerValues("automatic")).toEqual([
      "cron",
      "catchup",
      "boot",
    ]);
  });

  it("returns a single granular trigger as-is", () => {
    expect(resolveTriggerValues("manual")).toEqual(["manual"]);
  });

  it("returns null for no trigger filter (no constraint)", () => {
    expect(resolveTriggerValues("")).toBeNull();
  });
});
