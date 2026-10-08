export type FixtureLeagueSlug =
  | "liga-nacional"
  | "liga-argentina"
  | "liga-femenina"
  | "liga-proximo"
  | "liga-federal"
  | "3x3";

export type FixtureCompetition = {
  key: string;
  label: string;
  leagueSlug: FixtureLeagueSlug | null;
  leagueName: string | null;
};

const SEASON_SUFFIX = /\s+(\d{4})\/(\d{2})?(\d{2})$/;

// CABB competition text (season suffix stripped) -> portal league. FORMATIVAS
// is CABB-only youth play BP does not cover, so it maps to no league.
const COMPETITIONS: FixtureCompetition[] = [
  { key: "LIGA NACIONAL", label: "Nacional", leagueSlug: "liga-nacional", leagueName: "Liga Nacional" },
  { key: "LIGA ARGENTINA", label: "Argentina", leagueSlug: "liga-argentina", leagueName: "Liga Argentina" },
  { key: "LIGA FEMENINA", label: "Femenina", leagueSlug: "liga-femenina", leagueName: "Liga Femenina" },
  { key: "LIGA DE DESARROLLO", label: "Próximo", leagueSlug: "liga-proximo", leagueName: "Liga Próximo" },
  { key: "MAYORES", label: "Federal", leagueSlug: "liga-federal", leagueName: "Liga Federal" },
  { key: "LA LIGA FEDERAL", label: "Federal", leagueSlug: "liga-federal", leagueName: "Liga Federal" },
  { key: "ARGENTINO 3X3", label: "3x3", leagueSlug: "3x3", leagueName: "3x3" },
  { key: "FORMATIVAS", label: "Formativas", leagueSlug: null, leagueName: null },
];

// Grid Partido competition text -> league, for Partidos whose league_id is
// unset. Keys are normalized with normalizeCompetitionKey.
const GRID_COMPETITION_LEAGUES: Record<string, FixtureLeagueSlug> = {
  "LIGA NACIONAL": "liga-nacional",
  "LIGA ARGENTINA": "liga-argentina",
  "LIGA FEMENINA": "liga-femenina",
  "LIGA DESARROLLO": "liga-proximo",
  "LIGA DE DESARROLLO": "liga-proximo",
  "LIGA PROXIMO": "liga-proximo",
  "LIGA FEDERAL": "liga-federal",
  "3X3": "3x3",
};

function normalizeCompetitionKey(value: string) {
  return value
    .normalize("NFD")
    .replaceAll(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replaceAll(/\s+/g, " ")
    .trim();
}

export function splitCompetitionSeason(competition: string | null | undefined) {
  const text = normalizeCompetitionKey(competition ?? "");
  const match = text.match(SEASON_SUFFIX);

  if (!match) {
    return { base: text, season: null };
  }

  const [, startYear, , endYear] = match;
  return { base: text.slice(0, match.index).trim(), season: `${startYear}/${endYear}` };
}

export function resolveFixtureCompetition(
  competition: string | null | undefined,
): FixtureCompetition {
  const { base } = splitCompetitionSeason(competition);
  const known = COMPETITIONS.find((entry) => entry.key === base);

  if (known) {
    return known;
  }

  if (base.includes("3X3")) {
    return { key: base, label: "3x3", leagueSlug: "3x3", leagueName: "3x3" };
  }

  return { key: base || "SIN COMPETENCIA", label: base || "Sin competencia", leagueSlug: null, leagueName: null };
}

export function isFixtureLeagueSlug(value: string): value is FixtureLeagueSlug {
  return COMPETITIONS.some((entry) => entry.leagueSlug === value);
}

export function resolveGridCompetitionLeague(
  competition: string | null | undefined,
): FixtureLeagueSlug | null {
  return GRID_COMPETITION_LEAGUES[normalizeCompetitionKey(competition ?? "")] ?? null;
}

export const FIXTURE_COMPETITION_ORDER = COMPETITIONS.map((entry) => entry.label).filter(
  (label, index, all) => all.indexOf(label) === index,
);
