import { eq } from "drizzle-orm";

import type { UserContext } from "@/lib/auth";
import { buildClubLogoSrc, clubLogoVersionSql } from "@/lib/club-logo";
import { db } from "@/lib/db/client";
import { clubs, teams } from "@/lib/db/schema";
import { listLeagues, type League } from "@/lib/leagues/leagues";
import type { TeamDirectoryItem, TeamDirectoryTab } from "@/lib/team-directory";
import {
  buildTeamPickerCatalog,
  EMPTY_TEAM_PICKER_CATALOG,
  pickLatestSeasonEntries,
  type TeamPickerCatalog,
} from "@/lib/team-picker";
import {
  getTeamLeagueLabel,
  splitTeamCompetitions,
} from "@/lib/team-directory";
import { slugifyTeamValue } from "@/lib/teams/slug";

const DEFAULT_LEAGUE_URL = "https://www.laliganacional.com.ar/";

// Nested read mirroring the retired PostgREST embed: team -> club (one) and
// team -> memberships (many) -> league (one). The crest itself is never read
// here, only its version: cards load it from /api/club-logo instead.
const TEAM_DIRECTORY_QUERY = {
  columns: { id: true, slug: true, name: true, category: true },
  with: {
    club: {
      columns: {
        id: true,
        name: true,
        stadium: true,
        manager: true,
        website: true,
        instagram: true,
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
      // Callback form so the column resolves against the relation's alias.
      extras: (club: typeof clubs._.columns) => ({
        logoVersion: clubLogoVersionSql(club.logoUrl, club.updatedAt).as(
          "logo_version",
        ),
      }),
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
    id: string;
    name: string;
    stadium: string | null;
    manager: string | null;
    website: string | null;
    instagram: string | null;
    logoVersion: string | null;
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
          logo_src: buildClubLogoSrc(row.club.id, row.club.logoVersion),
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
    logo_src: string | null;
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
  return pickLatestSeasonEntries(row.team_league_memberships)
    .map((entry) => entry.leagues)
    .filter((league) => league !== null)
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
    logo_src: club?.logo_src ?? null,
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

// Just the names, for pickers that never show the rest of the directory.
export async function getTeamPickerCatalog(
  ctx: UserContext,
): Promise<TeamPickerCatalog> {
  if (!ctx.userId) {
    return EMPTY_TEAM_PICKER_CATALOG;
  }

  try {
    const rows = await db.query.teams.findMany({
      columns: { id: true, name: true },
      with: {
        teamLeagueMemberships: {
          columns: { season: true },
          with: {
            league: {
              columns: { slug: true, name: true, color: true, sortOrder: true },
            },
          },
        },
      },
    });

    return buildTeamPickerCatalog(
      rows.map((row) => ({
        id: row.id,
        name: row.name,
        memberships: row.teamLeagueMemberships,
      })),
    );
  } catch (error) {
    console.error("[teams] failed to load the team picker catalog", error);
    return EMPTY_TEAM_PICKER_CATALOG;
  }
}

export async function getTeamDirectoryLeagues(
  ctx: UserContext,
): Promise<League[]> {
  if (!ctx.userId) {
    return [];
  }

  try {
    return await listLeagues();
  } catch (error) {
    console.error("[teams] failed to load the leagues", error);
    return [];
  }
}

// A league gets a tab when it is marked for /teams (even while empty, so
// teams can be dragged into it) or when it has teams. Tabs follow
// leagues.sort_order.
export function buildTeamDirectoryTabs(
  teams: TeamDirectoryItem[],
  leagues: Pick<League, "name" | "slug" | "sortOrder" | "inTeamDirectory">[],
): TeamDirectoryTab[] {
  const counts = new Map<string, number>();

  teams.forEach((team) => {
    splitTeamCompetitions(team.competition).forEach((league) => {
      counts.set(league, (counts.get(league) ?? 0) + 1);
    });
  });

  const listed = leagues.filter(
    (league) => league.inTeamDirectory || counts.has(league.name),
  );
  const known = new Set(listed.map((league) => league.name));
  const unknown = [...counts.keys()]
    .filter((name) => !known.has(name))
    .map((name) => ({ name, slug: slugifyTeamValue(name), sortOrder: null }));

  const ordered = [...listed, ...unknown].sort(
    (left, right) =>
      (left.sortOrder ?? Number.MAX_SAFE_INTEGER) -
        (right.sortOrder ?? Number.MAX_SAFE_INTEGER) ||
      left.name.localeCompare(right.name, "es"),
  );
  // Tabs are keyed by name; two rows sharing one show as the first.
  const seen = new Set<string>();

  return ordered
    .filter((league) => !seen.has(league.name) && Boolean(seen.add(league.name)))
    .map((league) => ({
      value: league.name,
      slug: league.slug,
      label: getTeamLeagueLabel(league.name),
      count: counts.get(league.name) ?? 0,
    }));
}
