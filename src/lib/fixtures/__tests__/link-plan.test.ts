import { describe, expect, it } from "vitest";

import { normalizeTeamName, planFixtureLinks } from "@/lib/fixtures/link-plan";
import type { LinkCandidate, LinkFixture } from "@/lib/fixtures/link-plan";

function fixture(overrides: Partial<LinkFixture> & { id: string }): LinkFixture {
  return {
    competition: "LIGA NACIONAL 2026/2027",
    homeTeam: "BOCA",
    awayTeam: "OBERÁ",
    matchDate: "2026-10-07",
    matchTime: "21:05",
    ...overrides,
  };
}

function candidate(overrides: Partial<LinkCandidate> & { id: string }): LinkCandidate {
  return {
    productionCode: "31049",
    competition: "Liga Nacional",
    leagueSlug: null,
    homeTeam: "BOCA",
    awayTeam: "OBERA",
    // 21:05 in Buenos Aires (UTC-3).
    kickoffAt: "2026-10-08T00:05:00.000Z",
    ...overrides,
  };
}

describe("normalizeTeamName", () => {
  it("drops accents, notes and punctuation but keeps codes", () => {
    expect(normalizeTeamName("LANUS (Partido de la semana)")).toBe("LANUS");
    expect(normalizeTeamName("QUIMSA (DE SER NECESARIO)")).toBe("QUIMSA");
    expect(normalizeTeamName("SAN MARTÍN (C)")).toBe(normalizeTeamName("SAN MARTIN (C)"));
    expect(normalizeTeamName("RACING (CH)")).toBe("RACINGCH");
  });
});

describe("planFixtureLinks", () => {
  it("links on league, Argentine date and both teams", () => {
    const plan = planFixtureLinks({
      fixtures: [fixture({ id: "696086" })],
      candidates: [candidate({ id: "m1" })],
    });

    expect(plan.links).toEqual([{ matchId: "m1", fixtureId: "696086" }]);
    expect(plan.warnings).toEqual([]);
  });

  it("uses the Partido's league to tell Nacional and Desarrollo apart", () => {
    const plan = planFixtureLinks({
      fixtures: [
        fixture({ id: "nacional" }),
        fixture({ id: "desarrollo", competition: "LIGA DE DESARROLLO 2026/2027", matchTime: "21:00" }),
      ],
      candidates: [
        candidate({ id: "m1" }),
        candidate({ id: "m2", productionCode: "31100", competition: "Liga Desarrollo", kickoffAt: "2026-10-08T00:00:00.000Z" }),
      ],
    });

    expect(plan.links).toEqual([
      { matchId: "m1", fixtureId: "nacional" },
      { matchId: "m2", fixtureId: "desarrollo" },
    ]);
  });

  it("prefers league_id over the competition text", () => {
    const plan = planFixtureLinks({
      fixtures: [fixture({ id: "696086" })],
      candidates: [candidate({ id: "m1", leagueSlug: "liga-nacional", competition: "otra cosa" })],
    });

    expect(plan.links).toHaveLength(1);
  });

  it("matches grid notes and accents against CABB names", () => {
    const plan = planFixtureLinks({
      fixtures: [fixture({ id: "f1", homeTeam: "LANÚS", awayTeam: "OBERÁ", matchDate: "2026-10-09", matchTime: "20:30" })],
      candidates: [candidate({ id: "m1", homeTeam: "LANUS (Partido de la semana)", awayTeam: "OBERA", kickoffAt: "2026-10-09T23:30:00.000Z" })],
    });

    expect(plan.links).toEqual([{ matchId: "m1", fixtureId: "f1" }]);
  });

  it("links but warns when the grid time differs from CABB", () => {
    const plan = planFixtureLinks({
      fixtures: [
        fixture({ id: "f1", competition: "LIGA DE DESARROLLO 2026/2027", homeTeam: "INSTITUTO", awayTeam: "FERRO", matchDate: "2026-10-10", matchTime: "15:30" }),
      ],
      candidates: [
        candidate({ id: "m1", competition: "Liga Desarrollo", homeTeam: "INSTITUTO", awayTeam: "FERRO", kickoffAt: "2026-10-10T17:30:00.000Z" }),
      ],
    });

    expect(plan.links).toEqual([{ matchId: "m1", fixtureId: "f1" }]);
    expect(plan.warnings).toEqual([expect.stringContaining("grilla 14:30, oficial 15:30")]);
  });

  it("uses the Argentine date for late games", () => {
    const plan = planFixtureLinks({
      fixtures: [fixture({ id: "f1", matchDate: "2026-10-08" })],
      candidates: [candidate({ id: "m1" })],
    });

    expect(plan.links).toEqual([]);
    expect(plan.warnings).toEqual([expect.stringContaining("sin partido oficial")]);
  });

  it("skips a Partido with several CABB games", () => {
    const plan = planFixtureLinks({
      fixtures: [fixture({ id: "f1" }), fixture({ id: "f2", matchTime: "18:00" })],
      candidates: [candidate({ id: "m1" })],
    });

    expect(plan.links).toEqual([]);
    expect(plan.warnings).toEqual([expect.stringContaining("varios partidos oficiales")]);
  });

  it("skips a CABB game claimed by several Partidos", () => {
    const plan = planFixtureLinks({
      fixtures: [fixture({ id: "f1" })],
      candidates: [candidate({ id: "m1" }), candidate({ id: "m2", productionCode: "99999" })],
    });

    expect(plan.links).toEqual([]);
    expect(plan.warnings).toEqual([expect.stringContaining("coincide con varios partidos")]);
  });

  it("ignores Partidos outside fixture leagues", () => {
    const plan = planFixtureLinks({
      fixtures: [fixture({ id: "f1" })],
      candidates: [candidate({ id: "m1", competition: "BCLA" }), candidate({ id: "m2", leagueSlug: "bcla" })],
    });

    expect(plan).toEqual({ links: [], warnings: [] });
  });

  it("reads the competition of Partidos filed under Exterior", () => {
    const plan = planFixtureLinks({
      fixtures: [fixture({ id: "acb-1", competition: "COPA DEL REY 2026/2027" })],
      candidates: [candidate({ id: "m1", competition: "Copa del Rey", leagueSlug: "exterior" })],
    });

    expect(plan.links).toEqual([{ matchId: "m1", fixtureId: "acb-1" }]);
  });

  it("never links a FORMATIVAS game", () => {
    const plan = planFixtureLinks({
      fixtures: [fixture({ id: "f1", competition: "FORMATIVAS" })],
      candidates: [candidate({ id: "m1" })],
    });

    expect(plan.links).toEqual([]);
  });
});
