import { describe, expect, it } from "vitest";

import {
  buildTeamPickerCatalog,
  countTeamsInLeague,
  getTeamPickerLeagues,
  NO_LEAGUE,
  pickLatestSeasonEntries,
  searchTeamPicker,
  type TeamPickerSourceRow,
} from "@/lib/team-picker";

const NACIONAL = { slug: "liga-nacional", name: "Liga Nacional", color: "#e12121", sortOrder: 1 };
const PROXIMO = { slug: "liga-proximo", name: "Liga Próximo", color: "#2eac28", sortOrder: 2 };
const FEDERAL = { slug: "liga-federal", name: "Liga Federal", color: null, sortOrder: 4 };

function team(
  id: string,
  name: string,
  memberships: TeamPickerSourceRow["memberships"],
): TeamPickerSourceRow {
  return { id, name, memberships };
}

const ROWS: TeamPickerSourceRow[] = [
  team("quimsa", "Quimsa", [{ season: "2025/26", league: NACIONAL }]),
  team("boca", "Boca Juniors", [
    { season: "2025/26", league: PROXIMO },
    { season: "2025/26", league: NACIONAL },
  ]),
  team("union", "Unión de Santa Fe", [
    { season: "2024/25", league: NACIONAL },
    { season: "2025/26", league: FEDERAL },
  ]),
  team("retired", "Club Retirado", []),
  team("orphan", "Huérfano", [{ season: "2025/26", league: null }]),
];

describe("pickLatestSeasonEntries", () => {
  it("keeps only the entries of the latest season", () => {
    expect(
      pickLatestSeasonEntries([
        { season: "2024/25", id: 1 },
        { season: "2025/26", id: 2 },
        { season: "2025/26", id: 3 },
      ]).map((entry) => entry.id),
    ).toEqual([2, 3]);
  });

  it("returns nothing for no entries", () => {
    expect(pickLatestSeasonEntries([])).toEqual([]);
  });
});

describe("buildTeamPickerCatalog", () => {
  const catalog = buildTeamPickerCatalog(ROWS);

  it("lists every team, sorted by name", () => {
    expect(catalog.teams.map((entry) => entry.id)).toEqual([
      "boca",
      "retired",
      "orphan",
      "quimsa",
      "union",
    ]);
  });

  it("orders leagues by sort order, drops past-only leagues, ends with Sin liga", () => {
    expect(catalog.leagues.map((league) => league.slug)).toEqual([
      "liga-nacional",
      "liga-proximo",
      "liga-federal",
      NO_LEAGUE.slug,
    ]);
  });

  it("puts teams without a current league under Sin liga", () => {
    expect(getTeamPickerLeagues(catalog, "retired")).toEqual([NO_LEAGUE]);
    expect(getTeamPickerLeagues(catalog, "orphan")).toEqual([NO_LEAGUE]);
  });

  it("adds no Sin liga group when every team plays", () => {
    const playing = buildTeamPickerCatalog(ROWS.slice(0, 3));
    expect(playing.leagues.map((league) => league.slug)).not.toContain(
      NO_LEAGUE.slug,
    );
  });

  it("uses a team's latest-season leagues only", () => {
    expect(getTeamPickerLeagues(catalog, "union").map((l) => l.slug)).toEqual([
      "liga-federal",
    ]);
    expect(countTeamsInLeague(catalog, "liga-nacional")).toBe(2);
  });

  it("returns a team's leagues in catalog order", () => {
    expect(getTeamPickerLeagues(catalog, "boca").map((l) => l.slug)).toEqual([
      "liga-nacional",
      "liga-proximo",
    ]);
    expect(getTeamPickerLeagues(catalog, "missing")).toEqual([]);
  });
});

describe("searchTeamPicker", () => {
  const catalog = buildTeamPickerCatalog(ROWS);

  function search(leagueSlug: string | null, query: string) {
    return searchTeamPicker(catalog, { leagueSlug, query }).map((group) => [
      group.league.slug,
      group.teams.map((entry) => entry.id),
    ]);
  }

  it("groups every league's teams when nothing is filtered", () => {
    expect(search(null, "")).toEqual([
      ["liga-nacional", ["boca", "quimsa"]],
      ["liga-proximo", ["boca"]],
      ["liga-federal", ["union"]],
      [NO_LEAGUE.slug, ["retired", "orphan"]],
    ]);
  });

  it("narrows to one league", () => {
    expect(search("liga-proximo", "")).toEqual([["liga-proximo", ["boca"]]]);
  });

  it("matches the name ignoring case and accents, and drops empty leagues", () => {
    expect(search(null, "UNION")).toEqual([["liga-federal", ["union"]]]);
    expect(search("liga-nacional", "unión")).toEqual([]);
  });
});
