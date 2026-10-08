import { describe, expect, it } from "vitest";

import { argentineSchedule, compareFixtureSchedule } from "@/lib/fixtures/schedule";

describe("argentineSchedule", () => {
  it("reads a UTC kickoff as Argentine date and time", () => {
    expect(argentineSchedule("2026-10-11T00:30:00Z")).toEqual({ date: "2026-10-10", time: "21:30" });
  });
});

describe("compareFixtureSchedule", () => {
  const kickoffAt = "2026-10-10T21:00:00Z";

  it("matches when CABB has the same Argentine date and time", () => {
    expect(compareFixtureSchedule({ matchDate: "2026-10-10", matchTime: "18:00" }, kickoffAt)).toEqual({
      grid: { date: "2026-10-10", time: "18:00" },
      differs: false,
    });
  });

  it("flags a different time", () => {
    expect(compareFixtureSchedule({ matchDate: "2026-10-10", matchTime: "20:30" }, kickoffAt).differs).toBe(true);
  });

  it("flags a different date", () => {
    expect(compareFixtureSchedule({ matchDate: "2026-10-11", matchTime: "18:00" }, kickoffAt).differs).toBe(true);
  });

  it("does not flag what CABB has not published", () => {
    expect(compareFixtureSchedule({ matchDate: null, matchTime: null }, kickoffAt).differs).toBe(false);
    expect(compareFixtureSchedule({ matchDate: "2026-10-10", matchTime: null }, kickoffAt).differs).toBe(false);
  });
});
