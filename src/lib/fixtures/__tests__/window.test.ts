import { describe, expect, it } from "vitest";

import { addFixtureMonths, fixtureMonthRange, parseFixtureMonth } from "@/lib/fixtures/window";

const NOW = new Date("2026-10-08T15:00:00Z");

describe("parseFixtureMonth", () => {
  it("keeps a valid YYYY-MM", () => {
    expect(parseFixtureMonth("2027-02", NOW)).toBe("2027-02");
  });

  it("falls back to the current Buenos Aires month on anything else", () => {
    expect(parseFixtureMonth(undefined, NOW)).toBe("2026-10");
    expect(parseFixtureMonth("2026-13", NOW)).toBe("2026-10");
    expect(parseFixtureMonth(["2026-11"], NOW)).toBe("2026-10");
  });

  it("uses Buenos Aires time at the month boundary", () => {
    expect(parseFixtureMonth(undefined, new Date("2026-11-01T02:00:00Z"))).toBe("2026-10");
  });
});

describe("addFixtureMonths", () => {
  it("steps across the year boundary both ways", () => {
    expect(addFixtureMonths("2026-12", 1)).toBe("2027-01");
    expect(addFixtureMonths("2027-01", -1)).toBe("2026-12");
  });
});

describe("fixtureMonthRange", () => {
  it("spans the first to the last day of the month", () => {
    expect(fixtureMonthRange("2026-10")).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(fixtureMonthRange("2027-02")).toEqual({ from: "2027-02-01", to: "2027-02-28" });
    expect(fixtureMonthRange("2026-12")).toEqual({ from: "2026-12-01", to: "2026-12-31" });
  });
});
