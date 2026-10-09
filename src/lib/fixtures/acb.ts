import type { FixtureRecord, ParsedFixtures } from "@/lib/fixtures/parse";
import { fixtureScheduleAt, emptyFixture, readFlightPayload, readJsonAfter } from "@/lib/fixtures/source-helpers";

// acb.com renders its calendar with Next.js: the whole season sits in the
// page's flight payload as a `teams` array and a `rounds` array whose matches
// point at teams by reference ("$30:props:data:teams:14"). There is no public
// API behind it.

type AcbTeam = { fullName?: string; shortName?: string };
type AcbMatch = {
  id: number;
  homeTeam: unknown;
  awayTeam: unknown;
  homeTeamScore: number | null;
  awayTeamScore: number | null;
  startDateTime: string | null;
  matchStatus: string;
  seasonStartYear?: number;
};
type AcbRound = { roundNumber: number; matches: AcbMatch[] };

const TEAM_REF = /:teams:(\d+)$/;
// Unscheduled playoff games carry a placeholder date (the season's last day).
const SKIPPED_STATUSES = new Set(["UNSCHEDULED"]);
const KNOCKOUT_ROUNDS: Record<number, string> = { 4: "Cuartos de final", 2: "Semifinales", 1: "Final" };

function teamName(teams: AcbTeam[], ref: unknown) {
  const index = typeof ref === "string" ? ref.match(TEAM_REF)?.[1] : undefined;
  const team = typeof ref === "object" && ref !== null ? (ref as AcbTeam) : index === undefined ? undefined : teams[Number(index)];
  return team?.fullName?.trim() || team?.shortName?.trim() || null;
}

function roundLabel(round: AcbRound, isLeague: boolean) {
  if (isLeague) {
    return `Jornada ${round.roundNumber}`;
  }
  return KNOCKOUT_ROUNDS[round.matches.length] ?? `Ronda ${round.roundNumber}`;
}

export function parseAcbCalendar(
  html: string,
  { competition, isLeague }: { competition: string; isLeague: boolean },
): ParsedFixtures {
  const payload = readFlightPayload(html);
  const roundsAt = payload.indexOf('"rounds":[');
  if (roundsAt < 0) {
    return { fixtures: [], errors: ["No se encontro el calendario en la pagina de acb.com."] };
  }

  const rounds = readJsonAfter(payload, '"rounds":[', roundsAt);
  const teams = readJsonAfter(payload, '"teams":[', roundsAt);
  if (!Array.isArray(rounds) || !Array.isArray(teams)) {
    return { fixtures: [], errors: ["El calendario de acb.com cambio de formato."] };
  }

  const fixtures: FixtureRecord[] = [];
  const errors: string[] = [];

  for (const round of rounds as AcbRound[]) {
    for (const match of round.matches ?? []) {
      if (SKIPPED_STATUSES.has(match.matchStatus)) {
        continue;
      }
      if (!match.startDateTime) {
        errors.push(`Partido ${match.id} sin fecha.`);
        continue;
      }

      const finished = match.matchStatus === "FINALIZED";
      const season = match.seasonStartYear ? ` ${match.seasonStartYear}/${match.seasonStartYear + 1}` : "";
      fixtures.push({
        ...emptyFixture(`acb-${match.id}`, `${competition}${season}`),
        phase: roundLabel(round, isLeague),
        homeTeam: teamName(teams as AcbTeam[], match.homeTeam),
        awayTeam: teamName(teams as AcbTeam[], match.awayTeam),
        suspended: match.matchStatus === "POSTPONED",
        homePoints: finished ? match.homeTeamScore : null,
        awayPoints: finished ? match.awayTeamScore : null,
        ...fixtureScheduleAt(match.startDateTime),
      });
    }
  }

  return { fixtures, errors };
}
