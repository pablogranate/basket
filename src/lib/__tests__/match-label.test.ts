import { describe, expect, it } from "vitest";

import { matchLabelLogoPairs, splitMatchLabelTeams } from "@/lib/match-label";

describe("splitMatchLabelTeams", () => {
  it("splits a 'Home vs Away' label and trims", () => {
    expect(splitMatchLabelTeams("Boca Juniors vs Atenas de Córdoba")).toEqual({
      homeTeam: "Boca Juniors",
      awayTeam: "Atenas de Córdoba",
    });
  });

  it("is case-insensitive on the separator", () => {
    expect(splitMatchLabelTeams("River Plate VS San Lorenzo")).toEqual({
      homeTeam: "River Plate",
      awayTeam: "San Lorenzo",
    });
  });

  it("falls back to the whole label when there is no separator", () => {
    expect(splitMatchLabelTeams("Solo un equipo")).toEqual({
      homeTeam: "Solo un equipo",
      awayTeam: "Solo un equipo",
    });
  });
});

describe("matchLabelLogoPairs", () => {
  it("produces one pair per team carrying the shared competition", () => {
    expect(
      matchLabelLogoPairs("Boca Juniors vs River Plate", "Liga Nacional"),
    ).toEqual([
      { teamName: "Boca Juniors", competition: "Liga Nacional" },
      { teamName: "River Plate", competition: "Liga Nacional" },
    ]);
  });
});
