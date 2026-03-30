import { CLUB_CATALOG } from "@/lib/club-catalog";

export type TeamDirectoryItem = {
  id: string;
  slug: string;
  official_name: string;
  competition: string;
  stadium: string | null;
  manager: string | null;
  website: string | null;
  instagram: string | null;
  official_url: string | null;
  incident_count: number;
  logo_data_url?: string | null;
};

const LEAGUE_URL = "https://www.laliganacional.com.ar/";

export const TEAM_DIRECTORY_TAB_ORDER = [
  "Liga Nacional",
  "Liga Próximo",
  "Liga Argentina",
  "Liga Federal",
  "Liga Femenina",
  "Liga Metropolitana",
] as const;

const TEAM_DIRECTORY_OVERRIDES: Record<
  string,
  Partial<Omit<TeamDirectoryItem, "id" | "slug" | "official_name" | "competition">>
> = {
  "Atenas de Córdoba::Liga Nacional / Liga Próximo": {
    stadium: "Estructuras Pretensa Atenas",
    website: "https://www.atenas.com.ar/",
    instagram: "https://www.instagram.com/atenascordobaoficial/",
  },
  "Boca Juniors::Liga Nacional / Liga Próximo": {
    stadium: "Luis Conde",
    manager: "Responsable por asignar",
    website: "https://www.bocajuniors.com.ar/",
    instagram: "https://www.instagram.com/bocajrs/",
  },
  "Instituto de Córdoba::Liga Nacional / Liga Próximo": {
    stadium: "Ángel Sandrín",
    instagram: "https://www.instagram.com/institutobasket/",
  },
  "Obras Basket::Liga Nacional / Liga Próximo": {
    stadium: "El Templo del Rock",
    website: "https://www.obrasbasket.com/",
    instagram: "https://www.instagram.com/obrasbasket/",
  },
  "Quimsa::Liga Nacional / Liga Próximo": {
    stadium: "Ciudad",
    instagram: "https://www.instagram.com/quimsabasquetoficial/",
  },
  "Regatas Corrientes::Liga Nacional / Liga Próximo": {
    stadium: "José Jorge Contte",
    instagram: "https://www.instagram.com/regatasctes/",
  },
  "San Lorenzo de Almagro::Liga Nacional / Liga Próximo": {
    stadium: "Pando",
    instagram: "https://www.instagram.com/cslabasquet/",
  },
  "Unión de Santa Fe::Liga Nacional / Liga Próximo": {
    stadium: "Ángel Malvicino",
  },
  "Bochas Sport Club::Liga Argentina": {
    stadium: "Bochas Sport Club",
  },
  "Pergamino Básquet::Liga Argentina": {
    stadium: "Ricardo Dorado Merlo",
  },
  "Villa San Martín de Resistencia::Liga Argentina": {
    stadium: "Villa San Martín",
  },
};

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replaceAll(/[\u0300-\u036f]/g, "")
    .replaceAll(/[^a-zA-Z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "")
    .toLowerCase();
}

function buildId(name: string, competition: string) {
  return `${name}::${competition}`;
}

function getDefaultLeagueUrl(competition: string) {
  if (competition.startsWith("Liga") || competition === "ABB") {
    return LEAGUE_URL;
  }

  return LEAGUE_URL;
}

function buildTeamDirectory() {
  const entries = CLUB_CATALOG.flatMap(({ competition, clubs }) =>
    clubs.map((club) => {
      const key = buildId(club, competition);
      const overrides = TEAM_DIRECTORY_OVERRIDES[key] ?? {};

      return {
        id: key,
        slug: slugify(`${club}-${competition}`),
        official_name: club,
        competition,
        stadium: overrides.stadium ?? null,
        manager: overrides.manager ?? null,
        website: overrides.website ?? null,
        instagram: overrides.instagram ?? null,
        official_url: overrides.official_url ?? getDefaultLeagueUrl(competition),
        incident_count: overrides.incident_count ?? 0,
      } satisfies TeamDirectoryItem;
    }),
  );

  return entries.sort((left, right) => {
    const leftPrimaryLeague = splitTeamCompetitions(left.competition)[0] ?? left.competition;
    const rightPrimaryLeague =
      splitTeamCompetitions(right.competition)[0] ?? right.competition;
    const leagueIndexLeft = TEAM_DIRECTORY_TAB_ORDER.indexOf(
      leftPrimaryLeague as (typeof TEAM_DIRECTORY_TAB_ORDER)[number],
    );
    const leagueIndexRight = TEAM_DIRECTORY_TAB_ORDER.indexOf(
      rightPrimaryLeague as (typeof TEAM_DIRECTORY_TAB_ORDER)[number],
    );

    if (leagueIndexLeft !== leagueIndexRight) {
      return (
        (leagueIndexLeft === -1 ? Number.MAX_SAFE_INTEGER : leagueIndexLeft) -
        (leagueIndexRight === -1 ? Number.MAX_SAFE_INTEGER : leagueIndexRight)
      );
    }

    return left.official_name.localeCompare(right.official_name, "es");
  });
}

export const TEAM_DIRECTORY = buildTeamDirectory();

export const TEAM_DIRECTORY_LEAGUES = TEAM_DIRECTORY_TAB_ORDER.filter((league) =>
  TEAM_DIRECTORY.some((team) => splitTeamCompetitions(team.competition).includes(league)),
);

function normalizeLeagueName(value: string) {
  return value
    .normalize("NFD")
    .replaceAll(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function getTeamLeagueColorSet(league: string) {
  const normalizedLeague = normalizeLeagueName(league);

  if (normalizedLeague.includes("liga nacional")) {
    return {
      accent: "#d61b46",
      soft: "#fff1f4",
      canvas: "#fff5f7",
    };
  }

  if (normalizedLeague.includes("liga argentina")) {
    return {
      accent: "#2b6be7",
      soft: "#eef5ff",
      canvas: "#f4f8ff",
    };
  }

  if (normalizedLeague.includes("liga federal")) {
    return {
      accent: "#e67b18",
      soft: "#fff4ea",
      canvas: "#fff7ef",
    };
  }

  if (
    normalizedLeague.includes("liga proximo") ||
    normalizedLeague.includes("liga próximo")
  ) {
    return {
      accent: "#2f9d57",
      soft: "#eef9f1",
      canvas: "#f5fbf6",
    };
  }

  if (normalizedLeague.includes("liga femenina")) {
    return {
      accent: "#d73cb8",
      soft: "#fff0fb",
      canvas: "#fff6fd",
    };
  }

  if (normalizedLeague.includes("liga metropolitana")) {
    return {
      accent: "#5f78a7",
      soft: "#f1f5fb",
      canvas: "#f7faff",
    };
  }

  return {
    accent: "#64748b",
    soft: "#f5f7fb",
    canvas: "#fafafa",
  };
}

export function getTeamLeagueAccentColor(league: string) {
  return getTeamLeagueColorSet(league).accent;
}

export function getTeamLeagueCanvasTone(league: string) {
  return getTeamLeagueColorSet(league).canvas;
}

export function getTeamVenueByName(teamName?: string | null) {
  const normalizedName = normalizeLeagueName(teamName ?? "");

  if (!normalizedName) {
    return null;
  }

  const directMatch = TEAM_DIRECTORY.find(
    (team) => normalizeLeagueName(team.official_name) === normalizedName,
  );

  if (directMatch?.stadium) {
    return directMatch.stadium;
  }

  return null;
}

export function getTeamCompetitionByName(teamName?: string | null) {
  const normalizedName = normalizeLeagueName(teamName ?? "");

  if (!normalizedName) {
    return null;
  }

  const directMatch = TEAM_DIRECTORY.find(
    (team) => normalizeLeagueName(team.official_name) === normalizedName,
  );

  if (directMatch?.competition) {
    return directMatch.competition;
  }

  return null;
}

const LEAGUE_SHORT_LABELS: Record<string, string> = {
  "Liga Nacional": "Liga Nacional",
  "Liga Próximo": "Liga Próximo",
  "Liga Nacional / Liga Próximo": "Liga Nacional / Liga Próximo",
  "Liga Argentina": "Liga Argentina",
  "Liga Federal": "Liga Federal",
  "Liga Femenina": "Liga Femenina",
  "Liga Metropolitana": "Metropolitana",
};

export function getTeamDirectoryData(params?: {
  query?: string;
  league?: string;
}) {
  const query = params?.query?.trim().toLowerCase() ?? "";
  const league = params?.league?.trim() ?? "";

  return TEAM_DIRECTORY.filter((team) => {
    if (league && !splitTeamCompetitions(team.competition).includes(league)) {
      return false;
    }

    if (!query) {
      return true;
    }

    return [
      team.official_name,
      team.competition,
      team.stadium ?? "",
      team.manager ?? "",
    ]
      .join(" ")
      .toLowerCase()
      .includes(query);
  });
}

export function getTeamDirectoryTabs() {
  const counts = TEAM_DIRECTORY.reduce<Map<string, number>>((map, team) => {
    splitTeamCompetitions(team.competition).forEach((league) => {
      map.set(league, (map.get(league) ?? 0) + 1);
    });
    return map;
  }, new Map());

  return TEAM_DIRECTORY_LEAGUES.map((league) => ({
    value: league,
    label: LEAGUE_SHORT_LABELS[league] ?? league,
    count: counts.get(league) ?? 0,
  }));
}

export function getTeamBySlug(slug: string) {
  return TEAM_DIRECTORY.find((team) => team.slug === slug) ?? null;
}

export function getTeamLeagueLabel(league: string) {
  return LEAGUE_SHORT_LABELS[league] ?? league;
}

export function splitTeamCompetitions(competition: string) {
  return competition
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);
}
