import {
  isFixtureLeagueSlug,
  resolveFixtureCompetition,
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

function candidateLeague(candidate: LinkCandidate): FixtureLeagueSlug | null {
  if (candidate.leagueSlug) {
    return isFixtureLeagueSlug(candidate.leagueSlug) ? candidate.leagueSlug : null;
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
  const fixturesByKey = new Map<string, LinkFixture[]>();

  for (const fixture of fixtures) {
    const league = resolveFixtureCompetition(fixture.competition).leagueSlug;
    if (!league || !fixture.matchDate) {
      continue;
    }
    const key = [league, fixture.matchDate, normalizeTeamName(fixture.homeTeam), normalizeTeamName(fixture.awayTeam)].join("|");
    const bucket = fixturesByKey.get(key) ?? [];
    bucket.push(fixture);
    fixturesByKey.set(key, bucket);
  }

  const proposals = new Map<string, Array<{ candidate: LinkCandidate; fixture: LinkFixture }>>();
  const warnings: string[] = [];

  for (const candidate of candidates) {
    const league = candidateLeague(candidate);
    if (!league) {
      continue;
    }

    const { date } = argentineSchedule(candidate.kickoffAt);
    const key = [league, date, normalizeTeamName(candidate.homeTeam), normalizeTeamName(candidate.awayTeam)].join("|");
    const matches = fixturesByKey.get(key) ?? [];

    if (matches.length === 0) {
      warnings.push(`sin partido CABB para ${describe(candidate)} (${league}, ${date})`);
      continue;
    }
    if (matches.length > 1) {
      warnings.push(`varios partidos CABB para ${describe(candidate)}: ${matches.map((fixture) => fixture.id).join(", ")}`);
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
      warnings.push(`partido CABB ${fixtureId} coincide con varios partidos: ${claims.map(({ candidate }) => describe(candidate)).join(" / ")}`);
      continue;
    }

    const { candidate, fixture } = claims[0]!;
    links.push({ matchId: candidate.id, fixtureId });

    const { grid, differs } = compareFixtureSchedule(fixture, candidate.kickoffAt);
    if (differs) {
      warnings.push(`horario distinto en ${describe(candidate)}: grilla ${grid.time}, CABB ${fixture.matchTime}`);
    }
  }

  return { links, warnings };
}
