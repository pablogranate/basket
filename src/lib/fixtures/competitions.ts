export type FixtureLeagueSlug =
  | "liga-nacional"
  | "liga-argentina"
  | "liga-femenina"
  | "liga-proximo"
  | "liga-federal"
  | "3x3"
  | "liga-metropolitana"
  | "liga-endesa-acb"
  | "copa-del-rey"
  | "primera-feb"
  | "euroliga"
  | "liga-italiana-lba"
  | "nbb"
  | "liga-ouro"
  | "copa-super-8"
  | "lnb-chile"
  | "liga-dos"
  | "lub-uruguay"
  | "liga-de-ascenso"
  | "seleccion-argentina"
  | "wbla";

export type FixtureCompetition = {
  key: string;
  label: string;
  leagueSlug: FixtureLeagueSlug | null;
  leagueName: string | null;
};

const SEASON_SUFFIX = /\s+(\d{4})\/(\d{2})?(\d{2})$/;

// Fixture competition text (season suffix stripped) -> portal league. Slugs
// match the leagues table where the league exists there; the rest only exist
// as grid competition text. `leagueName` keys the grid colour. FORMATIVAS is
// CABB-only youth play BP does not cover, so it maps to no league.
const COMPETITIONS: FixtureCompetition[] = [
  { key: "LIGA NACIONAL", label: "Nacional", leagueSlug: "liga-nacional", leagueName: "Liga Nacional" },
  { key: "LIGA ARGENTINA", label: "Argentina", leagueSlug: "liga-argentina", leagueName: "Liga Argentina" },
  { key: "LIGA FEMENINA", label: "Femenina", leagueSlug: "liga-femenina", leagueName: "Liga Femenina" },
  { key: "LIGA DE DESARROLLO", label: "Próximo", leagueSlug: "liga-proximo", leagueName: "Liga Próximo" },
  { key: "MAYORES", label: "Federal", leagueSlug: "liga-federal", leagueName: "Liga Federal" },
  { key: "LA LIGA FEDERAL", label: "Federal", leagueSlug: "liga-federal", leagueName: "Liga Federal" },
  { key: "ARGENTINO 3X3", label: "3x3", leagueSlug: "3x3", leagueName: "3x3" },
  { key: "FORMATIVAS", label: "Formativas", leagueSlug: null, leagueName: null },
  { key: "LIGA METROPOLITANA", label: "Metropolitana", leagueSlug: "liga-metropolitana", leagueName: "Liga Metro" },
  { key: "SEL. ARGENTINA", label: "Selección", leagueSlug: "seleccion-argentina", leagueName: "FIBA" },
  { key: "LIGA ENDESA", label: "Endesa", leagueSlug: "liga-endesa-acb", leagueName: "Liga Endesa (ACB)" },
  { key: "COPA DEL REY", label: "Copa del Rey", leagueSlug: "copa-del-rey", leagueName: "Copa del Rey" },
  { key: "PRIMERA FEB", label: "Primera FEB", leagueSlug: "primera-feb", leagueName: "Primera FEB" },
  { key: "EUROLIGA", label: "Euroliga", leagueSlug: "euroliga", leagueName: "Euroliga" },
  { key: "LBA", label: "LBA", leagueSlug: "liga-italiana-lba", leagueName: "Liga Italiana (LBA)" },
  { key: "NBB", label: "NBB", leagueSlug: "nbb", leagueName: "NBB" },
  { key: "LIGA OURO", label: "Liga Ouro", leagueSlug: "liga-ouro", leagueName: "Liga Ouro" },
  { key: "COPA SUPER 8", label: "Super 8", leagueSlug: "copa-super-8", leagueName: "Copa Super 8" },
  { key: "LNB CHILE", label: "LNB Chile", leagueSlug: "lnb-chile", leagueName: "Liga Chery" },
  { key: "LIGA DOS", label: "Liga Dos", leagueSlug: "liga-dos", leagueName: "Liga Dos" },
  { key: "LUB", label: "LUB", leagueSlug: "lub-uruguay", leagueName: "LUB (Uruguay)" },
  { key: "LIGA DE ASCENSO", label: "LDA", leagueSlug: "liga-de-ascenso", leagueName: "Liga de Ascenso" },
  { key: "WBLA", label: "WBLA", leagueSlug: "wbla", leagueName: "WBLA" },
];

// Leagues table rows that are the same league as a fixture league.
const LEAGUE_ALIASES: Record<string, FixtureLeagueSlug> = {
  "liga-chery": "lnb-chile",
};

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
  LDB: "liga-proximo",
  "3X3": "3x3",
  "LIGA METROPOLITANA": "liga-metropolitana",
  METROPOLITANA: "liga-metropolitana",
  "LIGA METRO": "liga-metropolitana",
  "SEL. ARGENTINA": "seleccion-argentina",
  "SELECCION ARGENTINA": "seleccion-argentina",
  "LIGA ENDESA": "liga-endesa-acb",
  "LIGA ENDESA (ACB)": "liga-endesa-acb",
  ACB: "liga-endesa-acb",
  "COPA DEL REY": "copa-del-rey",
  "PRIMERA FEB": "primera-feb",
  EUROLIGA: "euroliga",
  LBA: "liga-italiana-lba",
  "LIGA ITALIANA (LBA)": "liga-italiana-lba",
  NBB: "nbb",
  "NBB CAIXA": "nbb",
  "LIGA OURO": "liga-ouro",
  "COPA SUPER 8": "copa-super-8",
  "SUPER 8": "copa-super-8",
  "LNB CHILE": "lnb-chile",
  "LIGA CHERY": "lnb-chile",
  "LIGA DOS": "liga-dos",
  LUB: "lub-uruguay",
  "LUB (URUGUAY)": "lub-uruguay",
  "LIGA DE ASCENSO": "liga-de-ascenso",
  LDA: "liga-de-ascenso",
  WBLA: "wbla",
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

export function resolveFixtureLeagueSlug(value: string): FixtureLeagueSlug | null {
  const slug = LEAGUE_ALIASES[value] ?? value;
  return COMPETITIONS.some((entry) => entry.leagueSlug === slug) ? (slug as FixtureLeagueSlug) : null;
}

export function resolveGridCompetitionLeague(
  competition: string | null | undefined,
): FixtureLeagueSlug | null {
  return GRID_COMPETITION_LEAGUES[normalizeCompetitionKey(competition ?? "")] ?? null;
}

export const FIXTURE_COMPETITION_ORDER = COMPETITIONS.map((entry) => entry.label).filter(
  (label, index, all) => all.indexOf(label) === index,
);
