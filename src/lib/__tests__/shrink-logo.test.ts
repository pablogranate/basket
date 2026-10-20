import { describe, expect, it } from "vitest";

import { fitWithin } from "@/lib/shrink-logo";

describe("fitWithin", () => {
  it("scales the longest side down to the limit, keeping the ratio", () => {
    expect(fitWithin(1000, 500, 256)).toEqual({ width: 256, height: 128 });
    expect(fitWithin(300, 1200, 256)).toEqual({ width: 64, height: 256 });
  });

  it("never enlarges a smaller image", () => {
    expect(fitWithin(120, 80, 256)).toEqual({ width: 120, height: 80 });
  });
});
