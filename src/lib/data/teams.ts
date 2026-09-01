import { eq } from "drizzle-orm";

import type { UserContext } from "@/lib/auth";
import { EXTERNAL_TEAM_LEAGUES } from "@/lib/club-catalog";
import { db } from "@/lib/db/client";
import { teams } from "@/lib/db/schema";
import type { TeamDirectoryItem, TeamDirectoryTab } from "@/lib/team-directory";
import {
  getTeamLeagueLabel,
  splitTeamCompetitions,
  TEAM_DIRECTORY_TAB_ORDER,
} from "@/lib/team-directory";

const DEFAULT_LEAGUE_URL = "https://www.laliganacional.com.ar/";

// Nested read mirroring the retired PostgREST embed: team -> club (one) and
// team -> memberships (many) -> league (one). Column subset kept identical.
const TEAM_DIRECTORY_QUERY = {
  columns: { id: true, slug: true, name: true, category: true },
  with: {
    club: {
      columns: {
        name: true,
        stadium: true,
        manager: true,
        website: true,
        instagram: true,
        logoUrl: true,
        officialUrl: true,
        shortName: true,
        city: true,
        province: true,
        managerPhone: true,
        managerEmail: true,
        pressManager: true,
        pressPhone: true,
        pressEmail: true,
      },
    },
    teamLeagueMemberships: {
      columns: { season: true },
      with: {
        league: { columns: { name: true, slug: true, sortOrder: true } },
      },
    },
  },
} as const;

type TeamDirectoryRow = {
  id: string;
  slug: string;
  name: string;
  category: string;
  club: {
    name: string;
    stadium: string | null;
    manager: string | null;
    website: string | null;
    instagram: string | null;
    logoUrl: string | null;
    officialUrl: string | null;
    shortName: string | null;
    city: string | null;
    province: string | null;
    managerPhone: string | null;
    managerEmail: string | null;
    pressManager: string | null;
    pressPhone: string | null;
    pressEmail: string | null;
  } | null;
  teamLeagueMemberships: Array<{
    season: string;
    league: {
      name: string;
      slug: string;
      sortOrder: number | null;
    } | null;
  }>;
};

// Reshape Drizzle's relation-keyed/camelCase result back to the snake_case
// embed shape the mappers were written against.
function toQueryRow(row: TeamDirectoryRow): TeamDirectoryQueryRow {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    category: row.category,
    clubs: row.club
      ? {
          name: row.club.name,
          stadium: row.club.stadium,
          manager: row.club.manager,
          website: row.club.website,
          instagram: row.club.instagram,
          logo_url: row.club.logoUrl,
          official_url: row.club.officialUrl,
          short_name: row.club.shortName,
          city: row.club.city,
          province: row.club.province,
          manager_phone: row.club.managerPhone,
          manager_email: row.club.managerEmail,
          press_manager: row.club.pressManager,
          press_phone: row.club.pressPhone,
          press_email: row.club.pressEmail,
        }
      : null,
    team_league_memberships: row.teamLeagueMemberships.map((entry) => ({
      season: entry.season,
      leagues: entry.league
        ? {
            name: entry.league.name,
            slug: entry.league.slug,
            sort_order: entry.league.sortOrder,
          }
        : null,
    })),
  };
}

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
    short_name: string | null;
    city: string | null;
    province: string | null;
    manager_phone: string | null;
    manager_email: string | null;
    press_manager: string | null;
    press_phone: string | null;
    press_email: string | null;
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
    short_name: club?.short_name ?? null,
    city: club?.city ?? null,
    province: club?.province ?? null,
    manager_phone: club?.manager_phone ?? null,
    manager_email: club?.manager_email ?? null,
    press_manager: club?.press_manager ?? null,
    press_phone: club?.press_phone ?? null,
    press_email: club?.press_email ?? null,
    leagueSortOrder: leagues[0]?.sort_order ?? Number.MAX_SAFE_INTEGER,
  };
}

export async function getTeamDirectory(
  ctx: UserContext,
): Promise<TeamDirectoryItem[]> {
  if (!ctx.userId) {
    return [];
  }

  let rows: TeamDirectoryRow[];
  try {
    rows = (await db.query.teams.findMany(
      TEAM_DIRECTORY_QUERY,
    )) as TeamDirectoryRow[];
  } catch (error) {
    console.error("[teams] failed to load team directory", error);
    return [];
  }

  return rows
    .map(toQueryRow)
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

  let row: TeamDirectoryRow | undefined;
  try {
    row = (await db.query.teams.findFirst({
      ...TEAM_DIRECTORY_QUERY,
      where: eq(teams.slug, slug),
    })) as TeamDirectoryRow | undefined;
  } catch (error) {
    console.error("[teams] failed to load team by slug", error);
    return null;
  }

  if (!row) {
    return null;
  }

  const { leagueSortOrder: _leagueSortOrder, ...team } = mapTeamRow(
    toQueryRow(row),
  );
  return team;
}

export function buildTeamDirectoryTabs(
  teams: TeamDirectoryItem[],
): TeamDirectoryTab[] {
  const counts = new Map<string, number>();
  const seenWithTeams: string[] = [];

  teams.forEach((team) => {
    splitTeamCompetitions(team.competition).forEach((league) => {
      if (!counts.has(league)) {
        seenWithTeams.push(league);
      }
      counts.set(league, (counts.get(league) ?? 0) + 1);
    });
  });

  // Core and external leagues always get a tab, even while empty, so teams
  // can be dragged into them from day one; leagues only known through team
  // memberships slot in between.
  const ordered: string[] = [];
  const seen = new Set<string>();
  const pushLeague = (league: string) => {
    if (!seen.has(league)) {
      seen.add(league);
      ordered.push(league);
    }
  };

  TEAM_DIRECTORY_TAB_ORDER.forEach(pushLeague);
  seenWithTeams.forEach(pushLeague);
  EXTERNAL_TEAM_LEAGUES.forEach(pushLeague);

  return ordered.map((league) => ({
    value: league,
    label: getTeamLeagueLabel(league),
    count: counts.get(league) ?? 0,
  }));
}
