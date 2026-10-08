import { describe, expect, it } from "vitest";

import { createCompetitionLeagueResolver } from "@/lib/competition-league";

const LEAGUES = [
  { id: "id-metro", slug: "liga-metropolitana", name: "Liga Metropolitana" },
  { id: "id-proximo", slug: "liga-proximo", name: "Liga Próximo" },
  { id: "id-argentina", slug: "liga-argentina", name: "Liga Argentina" },
  { id: "id-femenina", slug: "liga-femenina", name: "Liga Femenina" },
  { id: "id-nacional", slug: "liga-nacional", name: "Liga Nacional" },
  { id: "id-acb", slug: "liga-endesa-acb", name: "Liga Endesa (ACB)" },
  { id: "id-euroliga", slug: "euroliga", name: "Euroliga" },
  { id: "id-chery", slug: "liga-chery", name: "Liga Chery" },
  { id: "id-sudamericana", slug: "liga-sudamericana", name: "Liga Sudamericana" },
  { id: "id-febamba", slug: "febamba", name: "Febamba" },
  { id: "id-lpb-fem", slug: "lpb-fem-ecuador", name: "LPB Fem Ecuador" },
  { id: "id-lnb-chile", slug: "lnb-chile", name: "LNB Chile" },
  { id: "id-pre-metro", slug: "pre-metropolitana", name: "Pre Metropolitana" },
];

const resolve = createCompetitionLeagueResolver(LEAGUES);

describe("createCompetitionLeagueResolver", () => {
  it.each([
    ["Liga Nacional", "id-nacional"],
    ["Liga Desarrollo", "id-proximo"],
    ["Liga Femenina", "id-femenina"],
    ["Liga Argentina", "id-argentina"],
    ["Liga Metro", "id-metro"],
    ["Liga chery", "id-chery"],
    ["Euroliga", "id-euroliga"],
    ["Endesa ACB", "id-acb"],
    ["Sudamericana", "id-sudamericana"],
    ["Febamba", "id-febamba"],
    ["Pre Metropolina", "id-pre-metro"],
    ["Liga Nacional / Liga Próximo", "id-nacional"],
  ])("maps grid text %s to its league", (competition, leagueId) => {
    expect(resolve(competition)).toBe(leagueId);
  });

  it("matches a league by its own name, ignoring case, accents and spacing", () => {
    expect(resolve("  liga   PROXIMO ")).toBe("id-proximo");
    expect(resolve("Liga Endesa (ACB)")).toBe("id-acb");
    expect(resolve("LNB Chile")).toBe("id-lnb-chile");
  });

  it("leaves content recordings without a league", () => {
    expect(resolve("Grabacion Contenido")).toBeNull();
    expect(resolve("Grabación Contenido")).toBeNull();
  });

  it("does not map LPB Ecuador onto the women's league", () => {
    expect(resolve("LPB Ecuador")).toBeNull();
  });

  it("returns null for unknown, empty or missing text", () => {
    expect(resolve("Americup Femenina")).toBeNull();
    expect(resolve("")).toBeNull();
    expect(resolve(null)).toBeNull();
    expect(resolve(undefined)).toBeNull();
  });

  it("returns null when the aliased league row does not exist", () => {
    const withoutMetro = createCompetitionLeagueResolver(
      LEAGUES.filter((league) => league.slug !== "liga-metropolitana"),
    );
    expect(withoutMetro("Liga Metro")).toBeNull();
  });
});
