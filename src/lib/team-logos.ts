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
  {
    match: ["lpb ecuador", "lpb fem ecuador"],
    folders: ["logos liga ecuador 500 x 500"],
  },
  {
    match: ["liga chery", "liga dos"],
    folders: ["logos liga chery chile 500 x 500", "logos liga dos chile 500 x 500"],
  },
  {
    match: ["liga italiana", "lba"],
    folders: ["logos liga italia 500 x 500"],
  },
  {
    match: ["liga endesa", "acb"],
    folders: ["logos liga endesa 500 x 500"],
  },
  {
    match: ["euroliga", "euroleague"],
    folders: ["logos euroliga 500 x 500"],
  },
  {
    match: ["nbb"],
    folders: ["logos liga brasil nbb 500 x 500"],
  },
  {
    match: ["interligas ldb", "ldb"],
    folders: ["logos liga brasil ldb 500 x 500"],
  },
];

// Free-typed grid entries that either name no club at all (regional
// placeholders, bracket slots) or name a club with no crest on disk. Without
// this the scorer hands them a neighbouring club's crest instead of the
// fallback initials.
const UNRESOLVABLE_QUERIES = new Set([
  "9 de julio salta",
  "a a conf",
  "argentina",
  "asociacion vecinal de pilar",
  "belgrano tuc",
  "este",
  "italiano",
  "nolting",
  "norte",
  "oeste",
  "recreativo parana",
  "santa fe",
  "sur",
]);

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
  "regatas rcia": ["regatas resistencia"],
  "regatas sn": ["regatas san nicolas"],
  "san lorenzo de almagro": ["san lorenzo"],
  "san martin de corrientes": ["san martin de corrientes"],
  "union de santa fe": ["union sf", "union santa fe"],
  "argentino de castelar": ["argentino castelar"],
  "argentino de marcos juarez": ["argentino mj"],
  "atenas de la plata": ["atenas la plata"],
  "atletico de rafaela": ["atl rafaela"],
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
  "belgrano de san nicolas": ["belgrano san nicolas"],
  "belgrano sn": ["belgrano san nicolas"],
  "capri de posadas": ["capri posadas", "capri"],
  "casa de padua": ["casa padua", "padua"],
  "centro espanol de plottier": ["centro espanol plottier", "centro español plottier"],
  "club atletico pilar": ["club atletico pilar"],
  "cultural de santa sylvina": ["cultural santa sylvina"],
  "deportivo plottier": ["dep plottier"],
  "deportivo roca": ["dep roca"],
  "don bosco de resistencia": ["don bosco resistencia"],
  "el ceibo": ["el ceibo san francisco", "el ceibo"],
  "defensores de hurlingham": ["defensores hurligham"],
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
  "universidad nacional de la matanza": ["universidad la matanza"],
  "union vecinal de munro": ["union vecinal munro"],
  "union y juventud de bandera": ["union y juventud bandera"],
  "urquiza se": ["urquiza santa elena"],
  "urquiza sj": ["urquiza san juan"],
  "olimpia vt": ["olimpia de venado tuerto"],
  "hindu rcia": ["hindu club resistencia"],
  "hindu resistencia": ["hindu club resistencia"],
  "independiente nqn": ["independiente neuquen"],
  "gimnasia sf": ["gimnasia santa fe"],
  "gimnasia r": ["gimnasia rosario"],
  "san lorenzo mc": ["san lorenzo monte caseros"],
  "petrolero argentino": ["petrolero argentino plaza huincul"],
  "a korn": ["alejandro korn"],
  "all boys sr": ["all boys santa rosa"],
  "all boys sta rosa": ["all boys santa rosa"],
  barca: ["barcelona"],
  "cd valdivia": ["club deportivo valdivia"],
  "cuidad campana": ["ciudad campana"],
  "cultural ss": ["cultural santa sylvina"],
  "dolomiti energia trentino": ["trento"],
  "don bosco rcia": ["don bosco resistencia"],
  "el ceibo sf": ["el ceibo san francisco"],
  "ferrocaril oeste arg": ["ferro"],
  "hapoel ibi tel aviv": ["hapoel tel aviv"],
  "pacifico nqn": ["pacifico neuquen"],
  "perfora ph": ["perfora plaza huincul"],
  "san martin mj": ["san martin marcos juarez"],
  "sanjustino sj": ["sanjustino san justo"],
  "santa paula g": ["santa paula de galvez"],
  "somisa sn": ["somisa san nicolas"],
  "sparta vm": ["sparta villa maria"],
  "union central vm": ["union central villa maria"],
};

// Scheduling noise the grid carries inside free-typed team names. Stripped
// before scoring so "Almagro (E) (DE SER NECESARIO)" still matches its crest
// instead of scraping past the threshold on a partial token overlap.
const QUERY_NOISE = /\b(de ser necesario|back up|backup|a conf|conf)\b/g;

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " y ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(QUERY_NOISE, " ")
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

type PreparedQuery = {
  normalizedQuery: string;
  queryTokens: string[];
};

function scoreEntry(
  entry: LogoEntry,
  { normalizedQuery, queryTokens }: PreparedQuery,
  competitionFolders: string[],
) {
  if (!normalizedQuery) {
    return Number.NEGATIVE_INFINITY;
  }

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

// Result memo: the logo index and TEAM_DIRECTORY are static per process, and
// each lookup is O(entries × queries) string scoring over ~754 files. Without
// it, a logo-dense render (196 teams) burns ~1s of main-thread CPU and stalls
// every concurrent request. The cap guards against unbounded growth from
// free-typed team names on grid/match screens.
// Minimum score for a crest to paint. Below it the query is either scheduling
// filler ("A CONF", "Ganador P1", event descriptions) or a club with no asset
// on disk — both used to scrape past the old 180 floor and paint a neighbouring
// club's crest. Every real club sits well above this once aliased.
const MIN_LOGO_MATCH_SCORE = 600;

const logoPathCache = new Map<string, string | null>();
const LOGO_PATH_CACHE_MAX = 4000;

export function getTeamLogoPath(params: {
  teamName: string;
  competition?: string | null;
}) {
  const normalizedTeam = normalizeText(params.teamName);
  const competitionFolders = getCompetitionFolderHints(params.competition);
  const cacheKey = `${normalizedTeam}::${competitionFolders.join("|")}`;
  const cached = logoPathCache.get(cacheKey);

  if (cached !== undefined) {
    return cached;
  }

  if (UNRESOLVABLE_QUERIES.has(normalizedTeam)) {
    logoPathCache.set(cacheKey, null);

    return null;
  }

  const aliases = TEAM_QUERY_ALIASES[normalizedTeam] ?? [];
  const preparedQueries: PreparedQuery[] = [params.teamName, ...aliases].map(
    (query) => ({
      normalizedQuery: normalizeText(query),
      queryTokens: tokenize(query),
    }),
  );

  let bestEntry: LogoEntry | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const entry of LOGO_ENTRIES) {
    for (const query of preparedQueries) {
      const score = scoreEntry(entry, query, competitionFolders);

      if (score > bestScore) {
        bestScore = score;
        bestEntry = entry;
      }
    }
  }

  const result =
    !bestEntry || bestScore < MIN_LOGO_MATCH_SCORE ? null : bestEntry.src;

  if (logoPathCache.size >= LOGO_PATH_CACHE_MAX) {
    logoPathCache.clear();
  }

  logoPathCache.set(cacheKey, result);

  return result;
}
