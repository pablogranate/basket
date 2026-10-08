import { normalizeLeagueName } from "@/lib/league-grid-colors";

export type LeagueSnapshot = {
  id: string;
  slug: string;
  name: string;
};

// Grid "Liga" texts that differ from the league's own name, keyed by
// normalizeLeagueName. Texts equal to a league name resolve without an entry
// here. Anything else (e.g. "Grabacion Contenido") deliberately stays without
// a league.
const COMPETITION_LEAGUE_SLUGS: Record<string, string> = {
  "liga metro": "liga-metropolitana",
  "liga desarrollo": "liga-proximo",
  "liga proximo": "liga-proximo",
  "endesa acb": "liga-endesa-acb",
  "liga endesa": "liga-endesa-acb",
  sudamericana: "liga-sudamericana",
  "lpb ecuador": "liga-basquetpro-ecuador",
  "pre metropolina": "pre-metropolitana",
  "liga nacional / liga proximo": "liga-nacional",
};

export type CompetitionLeagueResolver = (
  competition: string | null | undefined,
) => string | null;

export function createCompetitionLeagueResolver(
  leagues: LeagueSnapshot[],
): CompetitionLeagueResolver {
  const idBySlug = new Map<string, string>();
  const idByName = new Map<string, string>();
  for (const league of leagues) {
    idBySlug.set(league.slug, league.id);
    idByName.set(normalizeLeagueName(league.name), league.id);
  }

  return (competition) => {
    const key = normalizeLeagueName(competition ?? "");
    if (!key) {
      return null;
    }
    const aliasSlug = COMPETITION_LEAGUE_SLUGS[key];
    if (aliasSlug) {
      return idBySlug.get(aliasSlug) ?? null;
    }
    return idByName.get(key) ?? null;
  };
}
