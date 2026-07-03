import { describe, expect, it } from "vitest";

import { getTeamLogoPath, resolveTeamLogoMap } from "@/lib/team-logos";

describe("getTeamLogoPath", () => {
  it("resolves a public crest path for a known team", () => {
    const src = getTeamLogoPath({
      teamName: "Boca Juniors",
      competition: "Liga Nacional",
    });

    expect(typeof src).toBe("string");
    expect(src?.startsWith("/")).toBe(true);
  });

  it("returns null when the query is empty", () => {
    expect(getTeamLogoPath({ teamName: "", competition: null })).toBeNull();
  });
});

describe("resolveTeamLogoMap", () => {
  it("keys entries exactly like the client cache key and dedupes pairs", () => {
    const map = resolveTeamLogoMap([
      { teamName: "Boca Juniors", competition: "Liga Nacional" },
      { teamName: "Boca Juniors", competition: "Liga Nacional" },
      { teamName: "River Plate", competition: "Liga Nacional" },
    ]);

    // Deduped to one entry per distinct (teamName, competition) pair, keyed as
    // `${teamName}::${competition ?? ""}` — identical to ClientTeamLogoMark's
    // cacheKey so the context lookup lands.
    expect(Object.keys(map)).toHaveLength(2);
    expect("Boca Juniors::Liga Nacional" in map).toBe(true);
    expect("River Plate::Liga Nacional" in map).toBe(true);
  });

  it("keys a null competition as an empty suffix", () => {
    const map = resolveTeamLogoMap([{ teamName: "Boca Juniors", competition: null }]);

    expect("Boca Juniors::" in map).toBe(true);
  });

  it("skips blank team names", () => {
    const map = resolveTeamLogoMap([
      { teamName: "", competition: "x" },
      { teamName: "   ", competition: "x" },
      { teamName: null, competition: "x" },
      { teamName: undefined, competition: "x" },
    ]);

    expect(Object.keys(map)).toHaveLength(0);
  });
});
