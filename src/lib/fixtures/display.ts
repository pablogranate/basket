const UNDECIDED_TEAM = /POR DETERMINAR|^LIBRE$/i;

export function fixtureTeamLabel(team: string | null | undefined, club?: string | null) {
  const name = (team ?? club ?? "").trim();
  return !name || UNDECIDED_TEAM.test(name) ? "A definir" : name;
}

export function titleCaseFixtureText(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replaceAll(/(^|[\s(])\S/g, (letter) => letter.toUpperCase());
}

// FASE and GRUPO nest levels with " | " ("APERTURA | SERIE REGULAR") and often
// repeat each other ("SERIE REGULAR" / "SERIE REGULAR").
export function fixturePhaseLabel(phase: string | null | undefined, group: string | null | undefined) {
  const parts = [phase ?? "", group ?? ""]
    .join("|")
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);

  return [...new Set(parts)].map(titleCaseFixtureText).join(" · ");
}

// Formativas holds many CABB-only categories; the category is the useful name.
export function fixtureCategoryLabel(category: string | null | undefined) {
  return titleCaseFixtureText((category ?? "").replace(/^LA LIGA /i, ""));
}

export function hasFixtureScore(fixture: { homePoints: number | null; awayPoints: number | null }) {
  return fixture.homePoints !== null && fixture.awayPoints !== null;
}
