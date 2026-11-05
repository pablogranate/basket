import {
  resolveFixtureCompetition,
  resolveFixtureLeagueSlug,
  resolveGridCompetitionLeague,
  type FixtureLeagueSlug,
} from "@/lib/fixtures/competitions";
import { argentineSchedule, compareFixtureSchedule } from "@/lib/fixtures/schedule";

export type LinkFixture = {
  id: string;
  competition: string | null;
  homeTeam: string | null;
  awayTeam: string | null;
  matchDate: string | null;
  matchTime: string | null;
};

export type LinkCandidate = {
  id: string;
  productionCode: string | null;
  competition: string | null;
  leagueSlug: string | null;
  homeTeam: string;
  awayTeam: string;
  kickoffAt: string;
};

export type FixtureLink = {
  matchId: string;
  fixtureId: string;
};

export type FixtureLinkPlan = {
  links: FixtureLink[];
  warnings: string[];
};

// Grid notes such as "LANUS (Partido de la semana)" or "QUIMSA (DE SER
// NECESARIO)" are not part of the team name; codes such as "(CH)" are.
const NOTE_PARENTHETICAL = /\([^)]*(SEMANA|NECESARIO)[^)]*\)/g;

export function normalizeTeamName(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replaceAll(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replaceAll(NOTE_PARENTHETICAL, "")
    .replaceAll(/[^A-Z0-9]/g, "");
}

// Words that name a club's kind, not the club: "CLUB ATLETICO SAN MIGUEL" is
// "SAN MIGUEL".
const GENERIC_WORDS = new Set([
  "CLUB",
  "ATLETICO",
  "ATLETICA",
  "DEPORTIVO",
  "DEPORTIVA",
  "ASOCIACION",
  "SOCIAL",
  "Y",
  "DE",
  "DEL",
  "LA",
  "EL",
  "LOS",
  "LAS",
]);

function teamWords(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replaceAll(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replaceAll(NOTE_PARENTHETICAL, "")
    .split(/[^A-Z0-9]+/)
    .filter((word) => word && !GENERIC_WORDS.has(word));
}

// "D" for DEFENSOR, "U" for UNIVERSIDAD, "FSA" for FORMOSA.
function isAbbreviation(short: string, long: string) {
  if (long.startsWith(short)) {
    return true;
  }
  if (short.length > 4 || short[0] !== long[0]) {
    return false;
  }
  let at = 0;
  for (const letter of long) {
    if (letter === short[at]) {
      at += 1;
    }
  }
  return at === short.length;
}

function wordsMatch(a: string, b: string) {
  return a.length <= b.length ? isAbbreviation(a, b) : isAbbreviation(b, a);
}

// The grid and the feeds name clubs differently ("Club Atlético Peñarol" and
// "PEÑAROL", "Defensor Sporting" and "D SPORTING"): every word of the shorter
// name matches one of the other, and at least one whole word is shared. City
// codes count, so "SAN MARTIN (C)" is not "SAN MARTIN (SJ)".
export function isSameTeam(a: string | null | undefined, b: string | null | undefined) {
  if (normalizeTeamName(a) === normalizeTeamName(b)) {
    return Boolean(normalizeTeamName(a));
  }
  const [fewer, more] = [teamWords(a), teamWords(b)].sort((x, y) => x.length - y.length) as [string[], string[]];
  return (
    fewer.length > 0 &&
    fewer.every((word) => more.some((other) => wordsMatch(word, other))) &&
    fewer.some((word) => word.length >= 3 && more.includes(word))
  );
}

type Teams = { homeTeam: string | null; awayTeam: string | null };

export function isSameGame(a: Teams, b: Teams) {
  return isSameTeam(a.homeTeam, b.homeTeam) && isSameTeam(a.awayTeam, b.awayTeam);
}

function isExactGame(a: Teams, b: Teams) {
  return (
    normalizeTeamName(a.homeTeam) === normalizeTeamName(b.homeTeam) &&
    normalizeTeamName(a.awayTeam) === normalizeTeamName(b.awayTeam)
  );
}

// Leagues without their own row (Copa del Rey, Primera FEB…) are filed under
// the catch-all "Exterior" league; their competition text names them.
const CATCH_ALL_LEAGUES = new Set(["exterior"]);

function candidateLeague(candidate: LinkCandidate): FixtureLeagueSlug | null {
  if (candidate.leagueSlug && !CATCH_ALL_LEAGUES.has(candidate.leagueSlug)) {
    return resolveFixtureLeagueSlug(candidate.leagueSlug);
  }
  return resolveGridCompetitionLeague(candidate.competition);
}

function describe(candidate: LinkCandidate) {
  const code = candidate.productionCode ? `${candidate.productionCode} ` : "";
  return `${code}${candidate.homeTeam} vs ${candidate.awayTeam}`;
}

export function planFixtureLinks({
  fixtures,
  candidates,
}: {
  fixtures: LinkFixture[];
  candidates: LinkCandidate[];
}): FixtureLinkPlan {
  const fixturesByDay = new Map<string, LinkFixture[]>();

  for (const fixture of fixtures) {
    const league = resolveFixtureCompetition(fixture.competition).leagueSlug;
    if (!league || !fixture.matchDate) {
      continue;
    }
    const key = [league, fixture.matchDate].join("|");
    const bucket = fixturesByDay.get(key) ?? [];
    bucket.push(fixture);
    fixturesByDay.set(key, bucket);
  }

  const proposals = new Map<string, Array<{ candidate: LinkCandidate; fixture: LinkFixture }>>();
  const warnings: string[] = [];

  for (const candidate of candidates) {
    const league = candidateLeague(candidate);
    if (!league) {
      continue;
    }

    const { date } = argentineSchedule(candidate.kickoffAt);
    // Same names first: a near name only counts when no game has the same ones.
    const sameDay = fixturesByDay.get([league, date].join("|")) ?? [];
    const exact = sameDay.filter((fixture) => isExactGame(fixture, candidate));
    const matches = exact.length ? exact : sameDay.filter((fixture) => isSameGame(fixture, candidate));

    if (matches.length === 0) {
      warnings.push(`sin partido oficial para ${describe(candidate)} (${league}, ${date})`);
      continue;
    }
    if (matches.length > 1) {
      warnings.push(`varios partidos oficiales para ${describe(candidate)}: ${matches.map((fixture) => fixture.id).join(", ")}`);
      continue;
    }

    const fixture = matches[0]!;
    const bucket = proposals.get(fixture.id) ?? [];
    bucket.push({ candidate, fixture });
    proposals.set(fixture.id, bucket);
  }

  const links: FixtureLink[] = [];

  for (const [fixtureId, claims] of proposals) {
    if (claims.length > 1) {
      warnings.push(`partido oficial ${fixtureId} coincide con varios partidos: ${claims.map(({ candidate }) => describe(candidate)).join(" / ")}`);
      continue;
    }

    const { candidate, fixture } = claims[0]!;
    links.push({ matchId: candidate.id, fixtureId });

    const { grid, differs } = compareFixtureSchedule(fixture, candidate.kickoffAt);
    if (differs) {
      warnings.push(`horario distinto en ${describe(candidate)}: grilla ${grid.time}, oficial ${fixture.matchTime}`);
    }
  }

  return { links, warnings };
}
