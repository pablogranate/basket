import { describe, expect, it } from "vitest";

import { buildTeamDirectoryTabs } from "@/lib/data/teams";
import type { TeamDirectoryItem } from "@/lib/team-directory";

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
    logo_data_url: null,
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
      "Liga Próximo",
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
      "Liga Próximo",
    ]);
    expect(values.indexOf("Liga Próximo")).toBeLessThan(
      values.indexOf("Liga Federal"),
    );
  });
});
