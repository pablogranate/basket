import { describe, expect, it } from "vitest";

import { getCityIndicator } from "@/components/people/people-view-helpers";

describe("getCityIndicator", () => {
  it("takes the flag from the country part", () => {
    expect(getCityIndicator("Córdoba, Argentina")).toEqual({
      symbol: "AR",
      emoji: "🇦🇷",
      label: "Argentina",
    });
    expect(getCityIndicator("Madrid, España")).toMatchObject({ symbol: "ES", label: "España" });
    expect(getCityIndicator("Bogotá, Colombia")).toMatchObject({ symbol: "CO" });
  });

  it("falls back to the plain pin without a known country", () => {
    const pin = { symbol: "CI", emoji: null, label: "Ciudad" };
    expect(getCityIndicator("Córdoba")).toEqual(pin);
    expect(getCityIndicator("Springfield, Narnia")).toEqual(pin);
    expect(getCityIndicator("")).toEqual(pin);
  });
});
