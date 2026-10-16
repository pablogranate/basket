import { describe, expect, it } from "vitest";

import {
  computeSendAt,
  isMatchDueForNotification,
} from "@/lib/notifications/schedule";

// ARG is UTC-3 (no DST): 11:00 ARG = 14:00Z, 22:00 ARG = 01:00Z next day.
describe("computeSendAt", () => {
  it("notifies an afternoon match at 11:00 ARG the same day", () => {
    // Kickoff 20:00 ARG (23:00Z) on 2026-07-10 → 11:00 ARG same day.
    const sendAt = computeSendAt("2026-07-10T23:00:00.000Z");
    expect(sendAt.toISOString()).toBe("2026-07-10T14:00:00.000Z");
  });

  it("notifies a morning match at 22:00 ARG the previous day", () => {
    // Kickoff 09:00 ARG (12:00Z) on 2026-07-10 → 22:00 ARG on 2026-07-09.
    const sendAt = computeSendAt("2026-07-10T12:00:00.000Z");
    expect(sendAt.toISOString()).toBe("2026-07-10T01:00:00.000Z");
  });

  it("treats exactly 12:00 ARG as afternoon (11:00 same day)", () => {
    // Kickoff 12:00 ARG (15:00Z) → noon-inclusive → 11:00 ARG same day.
    const sendAt = computeSendAt("2026-07-10T15:00:00.000Z");
    expect(sendAt.toISOString()).toBe("2026-07-10T14:00:00.000Z");
  });

  it("rolls the previous day across a year boundary for a morning match", () => {
    // Kickoff 09:00 ARG on 2026-01-01 → 22:00 ARG on 2025-12-31.
    const sendAt = computeSendAt("2026-01-01T12:00:00.000Z");
    expect(sendAt.toISOString()).toBe("2026-01-01T01:00:00.000Z");
  });

  it("notifies a just-after-midnight match the previous night", () => {
    // Kickoff 00:30 ARG (03:30Z) on 2026-07-10 → 22:00 ARG on 2026-07-09.
    const sendAt = computeSendAt("2026-07-10T03:30:00.000Z");
    expect(sendAt.toISOString()).toBe("2026-07-10T01:00:00.000Z");
  });
});

describe("isMatchDueForNotification", () => {
  // Kickoff 20:00 ARG on 2026-06-15 -> send time 11:00 ARG (14:00Z) that day.
  const match = {
    status: "Pendiente",
    kickoff_at: "2026-06-15T23:00:00.000Z",
    day_notified_at: null,
  };
  const afterSend = new Date("2026-06-15T14:30:00.000Z");
  const beforeSend = new Date("2026-06-15T13:59:00.000Z");

  it("is due once the send time has passed", () => {
    expect(isMatchDueForNotification(match, afterSend)).toBe(true);
    expect(
      isMatchDueForNotification({ ...match, status: "Confirmado" }, afterSend),
    ).toBe(true);
  });

  it("is not due before the send time", () => {
    expect(isMatchDueForNotification(match, beforeSend)).toBe(false);
  });

  it("is not due when the match is out of play", () => {
    for (const status of ["Cancelado", "Finalizado", "Suspendido"]) {
      expect(isMatchDueForNotification({ ...match, status }, afterSend)).toBe(
        false,
      );
    }
  });

  it("is not due when already notified", () => {
    expect(
      isMatchDueForNotification(
        { ...match, day_notified_at: "2026-06-15T14:00:00.000Z" },
        afterSend,
      ),
    ).toBe(false);
  });
});
