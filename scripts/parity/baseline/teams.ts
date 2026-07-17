import type { UserContext } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { TeamDirectoryItem, TeamDirectoryTab } from "@/lib/team-directory";
import { getTeamLeagueLabel, splitTeamCompetitions } from "@/lib/team-directory";

const DEFAULT_LEAGUE_URL = "https://www.laliganacional.com.ar/";

const TEAM_DIRECTORY_SELECT = `
  id,
  slug,
  name,
  category,
  clubs (
    name,
    stadium,
    manager,
    website,
    instagram,
    logo_url,
    official_url
  ),
  team_league_memberships (
    season,
    leagues (
      name,
      slug,
      sort_order
    )
  )
` as const;

type TeamDirectoryQueryRow = {
  id: string;
  slug: string;
  name: string;
  category: string;
  clubs: {
    name: string;
    stadium: string | null;
    manager: string | null;
    website: string | null;
    instagram: string | null;
    logo_url: string | null;
    official_url: string | null;
  } | null;
  team_league_memberships: Array<{
    season: string;
    leagues: {
      name: string;
      slug: string;
      sort_order: number | null;
    } | null;
  }>;
};

function pickCurrentLeagues(row: TeamDirectoryQueryRow) {
  const seasons = row.team_league_memberships.map((entry) => entry.season);

  if (!seasons.length) {
    return [];
  }

  const latestSeason = seasons.reduce((max, season) =>
    season > max ? season : max,
  );

  return row.team_league_memberships
    .filter((entry) => entry.season === latestSeason && entry.leagues)
    .map((entry) => entry.leagues!)
    .sort(
      (left, right) =>
        (left.sort_order ?? Number.MAX_SAFE_INTEGER) -
        (right.sort_order ?? Number.MAX_SAFE_INTEGER),
    );
}

function mapTeamRow(row: TeamDirectoryQueryRow): TeamDirectoryItem & {
  leagueSortOrder: number;
} {
  const leagues = pickCurrentLeagues(row);
  const competition = leagues.map((league) => league.name).join(" / ");
  const club = row.clubs;

  return {
    id: row.id,
    slug: row.slug,
    official_name: row.name,
    competition,
    stadium: club?.stadium ?? null,
    manager: club?.manager ?? null,
    website: club?.website ?? null,
    instagram: club?.instagram ?? null,
    official_url: club?.official_url ?? DEFAULT_LEAGUE_URL,
    incident_count: 0,
    logo_data_url: club?.logo_url ?? null,
    leagueSortOrder: leagues[0]?.sort_order ?? Number.MAX_SAFE_INTEGER,
  };
}

export async function getTeamDirectory(
  ctx: UserContext,
): Promise<TeamDirectoryItem[]> {
  if (!ctx.userId) {
    return [];
  }

  const supabase = await createSupabaseServerClient();
  const query = await supabase.from("teams").select(TEAM_DIRECTORY_SELECT);

  if (query.error) {
    console.error("[teams] failed to load team directory", query.error);
    return [];
  }

  return (query.data as TeamDirectoryQueryRow[])
    .map(mapTeamRow)
    .sort((left, right) => {
      if (left.leagueSortOrder !== right.leagueSortOrder) {
        return left.leagueSortOrder - right.leagueSortOrder;
      }

      return left.official_name.localeCompare(right.official_name, "es");
    })
    .map(({ leagueSortOrder: _leagueSortOrder, ...team }) => team);
}

export async function getTeamFromDbBySlug(
  ctx: UserContext,
  slug: string,
): Promise<TeamDirectoryItem | null> {
  if (!ctx.userId) {
    return null;
  }

  const supabase = await createSupabaseServerClient();
  const query = await supabase
    .from("teams")
    .select(TEAM_DIRECTORY_SELECT)
    .eq("slug", slug)
    .maybeSingle();

  if (query.error) {
    console.error("[teams] failed to load team by slug", query.error);
    return null;
  }

  if (!query.data) {
    return null;
  }

  const { leagueSortOrder: _leagueSortOrder, ...team } = mapTeamRow(
    query.data as TeamDirectoryQueryRow,
  );
  return team;
}

export function buildTeamDirectoryTabs(
  teams: TeamDirectoryItem[],
): TeamDirectoryTab[] {
  const counts = new Map<string, number>();
  const firstSeen: string[] = [];

  teams.forEach((team) => {
    splitTeamCompetitions(team.competition).forEach((league) => {
      if (!counts.has(league)) {
        firstSeen.push(league);
      }
      counts.set(league, (counts.get(league) ?? 0) + 1);
    });
  });

  return firstSeen.map((league) => ({
    value: league,
    label: getTeamLeagueLabel(league),
    count: counts.get(league) ?? 0,
  }));
}
