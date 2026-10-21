import { normalizeText } from "@/lib/utils";

// The ficha's "Club" picker: every equipo grouped by the leagues it plays in
// this season. A team in two leagues is one id listed in both; a team in none
// (an equipo incompleto, or one that left every league) goes under "Sin liga",
// last, since people can still be linked to it.

export type TeamPickerLeague = {
  slug: string;
  name: string;
  color: string | null;
};

export type TeamPickerTeam = {
  id: string;
  name: string;
  leagueSlugs: string[];
};

export type TeamPickerCatalog = {
  leagues: TeamPickerLeague[];
  teams: TeamPickerTeam[];
};

export type TeamPickerGroup = {
  league: TeamPickerLeague;
  teams: TeamPickerTeam[];
};

export type TeamPickerSourceRow = {
  id: string;
  name: string;
  memberships: Array<{
    season: string;
    league: (TeamPickerLeague & { sortOrder: number | null }) | null;
  }>;
};

export const NO_LEAGUE: TeamPickerLeague = {
  slug: "sin-liga",
  name: "Sin liga",
  color: null,
};

export const EMPTY_TEAM_PICKER_CATALOG: TeamPickerCatalog = {
  leagues: [],
  teams: [],
};

// Seasons are "2025/26"-style strings, so the latest one sorts last.
export function pickLatestSeasonEntries<Entry extends { season: string }>(
  entries: Entry[],
): Entry[] {
  if (!entries.length) {
    return [];
  }

  const latestSeason = entries.reduce(
    (max, entry) => (entry.season > max ? entry.season : max),
    entries[0].season,
  );

  return entries.filter((entry) => entry.season === latestSeason);
}

export function buildTeamPickerCatalog(
  rows: TeamPickerSourceRow[],
): TeamPickerCatalog {
  const leaguesBySlug = new Map<
    string,
    TeamPickerLeague & { sortOrder: number | null }
  >();
  const teams: TeamPickerTeam[] = [];

  for (const row of rows) {
    const name = row.name.trim();
    const currentLeagues = pickLatestSeasonEntries(row.memberships)
      .map((membership) => membership.league)
      .filter((league) => league !== null);

    if (!name) {
      continue;
    }

    for (const league of currentLeagues) {
      leaguesBySlug.set(league.slug, league);
    }

    teams.push({
      id: row.id,
      name,
      leagueSlugs: currentLeagues.length
        ? currentLeagues.map((league) => league.slug)
        : [NO_LEAGUE.slug],
    });
  }

  const hasUnaffiliatedTeams = teams.some((team) =>
    team.leagueSlugs.includes(NO_LEAGUE.slug),
  );

  const leagues = Array.from(leaguesBySlug.values())
    .sort(
      (left, right) =>
        (left.sortOrder ?? Number.MAX_SAFE_INTEGER) -
          (right.sortOrder ?? Number.MAX_SAFE_INTEGER) ||
        left.name.localeCompare(right.name, "es"),
    )
    .map(({ slug, name, color }) => ({ slug, name, color }));

  return {
    leagues: hasUnaffiliatedTeams ? [...leagues, NO_LEAGUE] : leagues,
    teams: teams.sort((left, right) => left.name.localeCompare(right.name, "es")),
  };
}

// The leagues to show (one, or all when leagueSlug is null), each with its
// teams whose name matches the query, ignoring case and accents. Leagues with
// no match are left out.
export function searchTeamPicker(
  catalog: TeamPickerCatalog,
  { leagueSlug, query }: { leagueSlug: string | null; query: string },
): TeamPickerGroup[] {
  const needle = normalizeText(query);
  const leagues = leagueSlug
    ? catalog.leagues.filter((league) => league.slug === leagueSlug)
    : catalog.leagues;

  return leagues
    .map((league) => ({
      league,
      teams: catalog.teams.filter(
        (team) =>
          team.leagueSlugs.includes(league.slug) &&
          normalizeText(team.name).includes(needle),
      ),
    }))
    .filter((group) => group.teams.length > 0);
}

export function countTeamsInLeague(
  catalog: TeamPickerCatalog,
  leagueSlug: string,
) {
  return catalog.teams.filter((team) => team.leagueSlugs.includes(leagueSlug))
    .length;
}

// The leagues a picked team is listed under, in catalog order. Empty for a
// team the catalog does not hold.
export function getTeamPickerLeagues(
  catalog: TeamPickerCatalog,
  teamId: string,
): TeamPickerLeague[] {
  const team = catalog.teams.find((entry) => entry.id === teamId);

  if (!team) {
    return [];
  }

  return catalog.leagues.filter((league) =>
    team.leagueSlugs.includes(league.slug),
  );
}
