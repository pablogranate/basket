import "server-only";

import { readdirSync } from "node:fs";
import path from "node:path";

type LogoEntry = {
  src: string;
  folder: string;
  folderNormalized: string;
  baseName: string;
  baseNormalized: string;
  tokens: string[];
  rootPriority: number;
};

const LOGO_ROOTS = [
  {
    dir: path.join(process.cwd(), "public", "LogosPNG"),
    rootPriority: 2,
  },
  {
    dir: path.join(process.cwd(), "public", "Logos"),
    rootPriority: 1,
  },
] as const;
const STOPWORDS = new Set([
  "de",
  "del",
  "la",
  "las",
  "los",
  "y",
  "club",
  "atletico",
  "atletica",
  "basquet",
  "basket",
  "tenis",
  "football",
  "futbol",
  "fc",
  "bb",
  "bbc",
  "cd",
  "ca",
]);

const COMPETITION_FOLDER_HINTS: Array<{
  match: string[];
  folders: string[];
}> = [
  {
    match: ["liga nacional", "liga proximo", "liga nacional / liga proximo"],
    folders: ["logos liga nacional 500 x 500"],
  },
  {
    match: ["liga argentina", "contactos liga argentina offtube"],
    folders: ["logos liga argentina 500 x 500"],
  },
  {
    match: ["liga federal"],
    folders: ["logos liga federal"],
  },
  {
    match: ["liga metropolitana"],
    folders: [
      "logos liga metropolitana 500 x 500",
      "logos liga metroplitana 500 x 500",
    ],
  },
  {
    match: ["liga femenina", "liga metropolitana fem"],
    folders: ["logos liga femenina 500 x 500"],
  },
];

const TEAM_QUERY_ALIASES: Record<string, string[]> = {
  "argentino de junin": ["argentino"],
  "atenas de cordoba": ["atenas"],
  "boca juniors": ["boca"],
  "ferro carril oeste": ["ferro"],
  "gimnasia y esgrima de comodoro rivadavia": ["gimnasia cr", "gimnasia comodoro"],
  "la union de formosa": ["la union"],
  "obera tenis club": ["obera"],
  "racing de chivilcoy": ["racing ch", "racing"],
  "regatas corrientes": ["regatas"],
  "san lorenzo de almagro": ["san lorenzo"],
  "san martin de corrientes": ["san martin de corrientes"],
  "union de santa fe": ["union sf", "union santa fe"],
  "atletico san isidro": ["atletico san isidro"],
  "central entrerriano": ["central entriano", "central enterriano"],
  "club atletico estudiantes de tucuman": ["estudiantes tuc", "estudiantes tucuman"],
  "fusion riojana": ["fusion riojana"],
  "gimnasia y esgrima de la plata": [
    "gimnasia esgrima de la plata",
    "club gimnasia y esgrima la plata",
  ],
  "hindu club": ["hindu"],
  "hindu club de resistencia": ["hindu club resistencia", "hindu"],
  "huracan las heras": ["huracan las heras"],
  "jujuy basquet": ["jujuy basquet"],
  "la union de colon": ["la union c", "la union colon"],
  "pergamino basquet": ["pergamino"],
  "pico football club": ["pico"],
  "provincial de rosario": ["provincial"],
  "quilmes de mar del plata": ["quilmes"],
  "racing de avellaneda": ["racing ave", "racing avellaneda"],
  "rivadavia basquet": ["rivadavia"],
  "santa paula de galvez": ["santapaula", "santa paula"],
  "sportivo suardi": ["suardi", "sportivo suardi"],
  "tomas de rocamora": ["rocamora", "tomas de rocamora"],
  "union de mar del plata": ["union mdp", "union mar del plata"],
  "villa san martin de resistencia": ["villa san martin", "villa san martin resistencia"],
  "9 de julio de morteros": ["9 julio", "9 de julio"],
  "alma juniors de esperanza": ["alma jrs", "alma juniors"],
  "almagro de esperanza": ["almagro esperanza", "almagro"],
  "asociacion mitre": ["asoc mitre", "mitre"],
  "atletico rafaela": ["atl rafaela"],
  "atletico regina": ["atl regina"],
  "atletico sastre": ["atl sastre"],
  "atletico tostado": ["atl tostado"],
  "banda norte": ["banda norte rio iv", "banda norte"],
  "capri de posadas": ["capri posadas", "capri"],
  "casa de padua": ["casa padua", "padua"],
  "centro espanol de plottier": ["centro espanol plottier", "centro español plottier"],
  "club atletico pilar": ["club atletico pilar"],
  "cultural de santa sylvina": ["cultural santa sylvina"],
  "deportivo plottier": ["dep plottier"],
  "deportivo roca": ["dep roca"],
  "don bosco de resistencia": ["don bosco resistencia"],
  "el ceibo": ["el ceibo san francisco", "el ceibo"],
  "estudiantes de la plata": ["estudiantes la plata"],
  "estudiantes de olavarria": ["estudiantes olavarria"],
  "estudiantil porteño": ["estudiantil porteno", "estudiantil porteño"],
  gevp: ["club gei", "gevp", "gimnasia de villa del parque"],
  "gimnasia y esgrima de ituzaingo": ["gimnasia ituzaingo"],
  "gimnasia y esgrima de rosario": ["gimnasia rosario"],
  "gimnasia y esgrima de santa fe": ["gimnasia santa fe"],
  "hercules de charata": ["hercules charata"],
  "independiente de avellaneda": ["independiente avellaneda"],
  "independiente de general pico": ["independiente gral pico", "independiente general pico"],
  "independiente de neuquen": ["independiente neuquen"],
  "independiente de tandil": ["independiente tandil"],
  "independiente de oliva": ["independiente oliva", "independiente o"],
  "jose hernandez": ["jose hernandez"],
  "la armonia de colon": ["la armonia colon"],
  "los indios de moreno": ["los indios moreno"],
  "mitre de posadas": ["mitre posadas"],
  "montmartre de catamarca": ["montmartre"],
  moron: ["club moron", "moron"],
  "nautico avellaneda": ["nautico", "nautico rosario"],
  "nautico sportivo avellaneda": ["nautico", "nautico rosario"],
  "olimpia de venado tuerto": ["olimpia de venado tuerto", "olimpia"],
  "olimpico de la banda": ["olimpico", "olimpico la banda"],
  "peñarol de mar del plata": ["penarol", "penarol mdp", "peñarol"],
  "pacifico de neuquen": ["pacifico neuquen"],
  "presidente derqui": ["pte derqui", "presidente derqui"],
  "quique club de parana": ["quique parana", "quique"],
  "racing de olavarria": ["racing olavarria"],
  "red star de catamarca": ["red star catamarca"],
  "regatas de resistencia": ["regatas resistencia"],
  "regatas de san nicolas": ["regatas san nicolas"],
  "rivadavia juniors de santa fe": ["rivadavia jrs santa fe", "rivadavia juniors"],
  "river plate": ["river", "river plate"],
  "rosario central": ["rosario central santa fe", "rosario central"],
  "san lorenzo de monte caseros": ["san lorenzo monte caseros"],
  "san martin de marcos juarez": ["san martin marcos juarez"],
  sanjustino: ["sanjustino san justo", "sanjustino"],
  sionista: ["sionista parana", "sionista"],
  "somisa de san nicolas": ["somisa san nicolas"],
  "sportivo escobar": ["sp escobar", "sportivo escobar"],
  "sportivo pilar": ["sp pilar", "sportivo pilar"],
  "sparta de villa maria": ["sparta villa maria"],
  "talleres de tafi viejo": ["talleres"],
  "temperley de rosario": ["temperley"],
  "tokio de posadas": ["tokio posadas"],
  "club tres de febrero": ["3 de febrero", "tres de febrero"],
  "union de oncativo": ["union oncativo"],
  "union central de villa maria": ["union central villa maria"],
  "union vecinal de munro": ["union vecinal munro"],
  "union y juventud de bandera": ["union y juventud bandera"],
};

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " y ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function tokenize(value: string) {
  return normalizeText(value)
    .split(" ")
    .filter((token) => token && !STOPWORDS.has(token));
}

function toPublicPath(absoluteFilePath: string) {
  const relative = path.relative(path.join(process.cwd(), "public"), absoluteFilePath);
  return `/${relative
    .split(path.sep)
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/")}`;
}

function readLogoFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".")) {
      continue;
    }

    const absolutePath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...readLogoFiles(absolutePath));
      continue;
    }

    if (!/\.(png|jpe?g|webp|svg)$/i.test(entry.name)) {
      continue;
    }

    files.push(absolutePath);
  }

  return files;
}

const LOGO_ENTRIES: LogoEntry[] = LOGO_ROOTS.flatMap(({ dir, rootPriority }) =>
  readLogoFiles(dir).map((absolutePath) => {
    const baseName = path.basename(absolutePath, path.extname(absolutePath));
    const folder = path.basename(path.dirname(absolutePath));

    return {
      src: toPublicPath(absolutePath),
      folder,
      folderNormalized: normalizeText(folder),
      baseName,
      baseNormalized: normalizeText(baseName),
      tokens: tokenize(baseName),
      rootPriority,
    };
  }),
);

function getCompetitionFolderHints(competition?: string | null) {
  const normalizedCompetition = normalizeText(competition ?? "");

  if (!normalizedCompetition) {
    return [];
  }

  return COMPETITION_FOLDER_HINTS.find((entry) =>
    entry.match.some((match) => normalizedCompetition.includes(match)),
  )?.folders.map(normalizeText) ?? [];
}

function scoreEntry(
  entry: LogoEntry,
  query: string,
  competitionFolders: string[],
) {
  const normalizedQuery = normalizeText(query);

  if (!normalizedQuery) {
    return Number.NEGATIVE_INFINITY;
  }

  const queryTokens = tokenize(query);
  const sharedTokens = queryTokens.filter((token) => entry.tokens.includes(token));
  let score = 0;

  if (entry.baseNormalized === normalizedQuery) {
    score += 1200;
  }

  if (
    normalizedQuery.includes(entry.baseNormalized) ||
    entry.baseNormalized.includes(normalizedQuery)
  ) {
    score += 520;
  }

  if (queryTokens.length && entry.tokens.length) {
    score += sharedTokens.length * 120;

    if (entry.tokens.every((token) => queryTokens.includes(token))) {
      score += 180;
    }

    if (queryTokens.every((token) => entry.tokens.includes(token))) {
      score += 150;
    }

    score -= Math.abs(queryTokens.length - entry.tokens.length) * 8;
  }

  if (competitionFolders.some((folder) => entry.folderNormalized.includes(folder))) {
    score += 220;
  }

  score += entry.rootPriority * 12;

  return score;
}

export function getTeamInitials(name?: string | null) {
  const source = (name ?? "EQ").trim();
  const parts = source.split(/\s+/).filter(Boolean).slice(0, 2);

  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "EQ";
}

// Server-side pre-resolution for logo-dense screens. Resolves each distinct
// (teamName, competition) pair once and returns a plain, serializable record
// keyed exactly like ClientTeamLogoMark's cache key, so the client component can
// paint the crest from the initial markup instead of fetching /api/team-logo per
// instance on mount. Dedupes so the per-render cost stays O(distinct teams).
export function resolveTeamLogoMap(
  pairs: Array<{ teamName: string | null | undefined; competition?: string | null }>,
): Record<string, string | null> {
  const map: Record<string, string | null> = {};

  for (const { teamName, competition } of pairs) {
    if (!teamName?.trim()) {
      continue;
    }

    // Key verbatim on teamName (not trimmed) so it matches ClientTeamLogoMark's
    // cacheKey exactly; getTeamLogoPath normalizes internally.
    const key = `${teamName}::${competition ?? ""}`;

    if (key in map) {
      continue;
    }

    map[key] = getTeamLogoPath({ teamName, competition });
  }

  return map;
}

export function getTeamLogoPath(params: {
  teamName: string;
  competition?: string | null;
}) {
  const normalizedTeam = normalizeText(params.teamName);
  const aliases = TEAM_QUERY_ALIASES[normalizedTeam] ?? [];
  const searchQueries = [params.teamName, ...aliases];
  const competitionFolders = getCompetitionFolderHints(params.competition);

  let bestEntry: LogoEntry | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const entry of LOGO_ENTRIES) {
    for (const query of searchQueries) {
      const score = scoreEntry(entry, query, competitionFolders);

      if (score > bestScore) {
        bestScore = score;
        bestEntry = entry;
      }
    }
  }

  if (!bestEntry || bestScore < 180) {
    return null;
  }

  return bestEntry.src;
}
