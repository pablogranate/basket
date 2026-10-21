import { describe, expect, it } from "vitest";

import { isSameLeagueName, parseLeagueName } from "@/lib/leagues/league-name";
import { createLeagueColorResolver, getTeamLeagueColorSet } from "@/lib/team-directory";

describe("parseLeagueName", () => {
  it("trims and collapses spaces", () => {
    expect(parseLeagueName("  Liga   Femenina  Chile ")).toEqual({
      ok: true,
      name: "Liga Femenina Chile",
    });
  });

  it.each([
    ["", "Escribí el nombre de la liga."],
    ["   ", "Escribí el nombre de la liga."],
    ["Liga A / Liga B", "El nombre no puede incluir «/»."],
    ["Todos", "«Todos» ya es una pestaña de Equipos."],
    ["ARCHIVADOS", "«ARCHIVADOS» ya es una pestaña de Equipos."],
  ])("rejects %j", (raw, error) => {
    expect(parseLeagueName(raw)).toEqual({ ok: false, error });
  });

  it("rejects names longer than 60 characters", () => {
    expect(parseLeagueName("x".repeat(61)).ok).toBe(false);
    expect(parseLeagueName("x".repeat(60)).ok).toBe(true);
  });
});

describe("isSameLeagueName", () => {
  it("ignores case, accents and spacing", () => {
    expect(isSameLeagueName("Liga Próximo", " liga  proximo")).toBe(true);
    expect(isSameLeagueName("Liga Nacional", "Liga Argentina")).toBe(false);
  });
});

describe("createLeagueColorResolver", () => {
  it("keeps a renamed league's colour through its slug", () => {
    const colorOf = createLeagueColorResolver([
      { value: "Primera Nacional", slug: "liga-nacional" },
    ]);

    expect(colorOf("Primera Nacional")).toEqual(
      getTeamLeagueColorSet("Liga Nacional"),
    );
  });

  it("falls back to the name for leagues without a tab", () => {
    const colorOf = createLeagueColorResolver([]);

    expect(colorOf("Liga Federal")).toEqual(getTeamLeagueColorSet("Liga Federal"));
  });
});
