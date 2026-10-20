import { describe, expect, it } from "vitest";

import { buildTeamDirectoryTabs } from "@/lib/data/teams";
import {
  ALL_TEAM_LEAGUES,
  getDefaultTeamLeague,
  resolveActiveTeamLeague,
  type TeamDirectoryItem,
} from "@/lib/team-directory";

function team(id: string, competition: string): TeamDirectoryItem {
  return {
    id,
    slug: id,
    official_name: id,
    competition,
    stadium: null,
    manager: null,
    website: null,
    instagram: null,
    official_url: "",
    incident_count: 0,
    logo_src: null,
  } as TeamDirectoryItem;
}

const TEAMS = [
  team("a", "Liga Nacional"),
  team("b", "Liga Argentina / Liga Regional"),
];

describe("buildTeamDirectoryTabs", () => {
  it("keeps the built-in order when no persisted order exists", () => {
    const values = buildTeamDirectoryTabs(TEAMS).map((tab) => tab.value);

    expect(values.slice(0, 3)).toEqual([
      "Liga Nacional",
      "Liga Desarrollo",
      "Liga Argentina",
    ]);
    expect(values).toContain("Liga Regional");
  });

  it("puts persisted positions first and leaves the rest in built-in order", () => {
    const values = buildTeamDirectoryTabs(TEAMS, {
      "Liga Regional": 1,
      "Liga Argentina": 2,
      "Liga Nacional": 3,
    }).map((tab) => tab.value);

    expect(values.slice(0, 4)).toEqual([
      "Liga Regional",
      "Liga Argentina",
      "Liga Nacional",
      "Liga Desarrollo",
    ]);
    expect(values.indexOf("Liga Desarrollo")).toBeLessThan(
      values.indexOf("Liga Federal"),
    );
  });
});

describe("default team league", () => {
  const tabs = [
    { value: "Liga Nacional", label: "Liga Nacional", count: 0 },
    { value: "Liga Argentina", label: "Liga Argentina", count: 3 },
  ];

  it("opens on the first league that has teams", () => {
    expect(getDefaultTeamLeague(tabs)).toBe("Liga Argentina");
    expect(getDefaultTeamLeague([])).toBe("");
  });

  it("uses the default league unless the URL picks one or asks for all", () => {
    expect(resolveActiveTeamLeague(null, "Liga Argentina")).toBe(
      "Liga Argentina",
    );
    expect(resolveActiveTeamLeague("Liga Nacional", "Liga Argentina")).toBe(
      "Liga Nacional",
    );
    expect(resolveActiveTeamLeague(ALL_TEAM_LEAGUES, "Liga Argentina")).toBe(
      "",
    );
  });
});
