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

function league(
  name: string,
  slug: string,
  sortOrder: number | null,
  inTeamDirectory = true,
) {
  return { name, slug, sortOrder, inTeamDirectory };
}

const LEAGUES = [
  league("Liga Argentina", "liga-argentina", 3),
  league("Liga Nacional", "liga-nacional", 1),
  league("Liga Desarrollo", "liga-proximo", 2),
  league("Amistosos", "amistosos", 30, false),
  league("Liga Regional", "liga-regional", null, false),
];

describe("buildTeamDirectoryTabs", () => {
  it("lists the leagues in their persisted order", () => {
    const values = buildTeamDirectoryTabs(TEAMS, LEAGUES).map(
      (tab) => tab.value,
    );

    expect(values).toEqual([
      "Liga Nacional",
      "Liga Desarrollo",
      "Liga Argentina",
      "Liga Regional",
    ]);
  });

  it("keeps empty leagues marked for /teams and drops the rest", () => {
    const tabs = buildTeamDirectoryTabs(TEAMS, LEAGUES);

    expect(tabs.find((tab) => tab.value === "Liga Desarrollo")?.count).toBe(0);
    expect(tabs.some((tab) => tab.value === "Amistosos")).toBe(false);
  });

  it("carries the slug, which survives a rename", () => {
    const tabs = buildTeamDirectoryTabs(
      [team("c", "Liga Desarrollo Pro")],
      [league("Liga Desarrollo Pro", "liga-proximo", 2)],
    );

    expect(tabs).toEqual([
      {
        value: "Liga Desarrollo Pro",
        slug: "liga-proximo",
        label: "Liga Desarrollo Pro",
        count: 1,
      },
    ]);
  });

  it("still shows a league known only through its teams", () => {
    const tabs = buildTeamDirectoryTabs([team("d", "Liga Nueva")], []);

    expect(tabs).toEqual([
      { value: "Liga Nueva", slug: "liga-nueva", label: "Liga Nueva", count: 1 },
    ]);
  });
});

describe("default team league", () => {
  const tabs = [
    { value: "Liga Nacional", slug: "liga-nacional", label: "Liga Nacional", count: 0 },
    { value: "Liga Argentina", slug: "liga-argentina", label: "Liga Argentina", count: 3 },
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
