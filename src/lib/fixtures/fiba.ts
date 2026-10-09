import type { FixtureRecord, ParsedFixtures } from "@/lib/fixtures/parse";
import { fixtureScheduleAt, emptyFixture, readFlightPayload, readJsonAfter } from "@/lib/fixtures/source-helpers";

// fiba.basketball event pages (/en/events/<slug>/games) are Next.js; the flight
// payload holds a `games` array. Games without a set time keep their local
// date only.

type FibaTeam = { officialName?: string | null; shortName?: string | null; code?: string | null } | null;
type FibaGame = {
  gameId: number;
  statusCode?: string | null;
  isPostponed?: boolean;
  gameDateTime?: string | null;
  gameDateTimeUTC?: string | null;
  hasTimeGameDateTime?: boolean;
  teamA: FibaTeam;
  teamB: FibaTeam;
  teamAScore?: number | null;
  teamBScore?: number | null;
  venueName?: string | null;
  hostCity?: string | null;
  windowName?: string | null;
  round?: { roundName?: string | null } | null;
  groupPairingCode?: string | null;
};

const STATUS_FINISHED = "VALID";

function fibaTeamName(team: FibaTeam) {
  return team?.officialName?.trim() || team?.shortName?.trim() || null;
}

export function parseFibaEventGames(
  html: string,
  { competition, teamCode }: { competition: string; teamCode?: string },
): ParsedFixtures {
  const payload = readFlightPayload(html);
  const gamesAt = payload.indexOf('"games":[{"gameId"');
  const games = gamesAt < 0 ? null : readJsonAfter(payload, '"games":[', gamesAt);
  if (!Array.isArray(games)) {
    return { fixtures: [], errors: ["No se encontraron los partidos en la pagina de FIBA."] };
  }

  const fixtures: FixtureRecord[] = [];
  const errors: string[] = [];

  for (const game of games as FibaGame[]) {
    if (teamCode && game.teamA?.code !== teamCode && game.teamB?.code !== teamCode) {
      continue;
    }
    const schedule =
      game.hasTimeGameDateTime === false && game.gameDateTime
        ? { matchDate: game.gameDateTime.slice(0, 10), matchTime: null }
        : game.gameDateTimeUTC
          ? fixtureScheduleAt(`${game.gameDateTimeUTC}Z`)
          : null;
    if (!schedule) {
      errors.push(`Partido ${game.gameId} sin fecha.`);
      continue;
    }

    const finished = game.statusCode === STATUS_FINISHED;
    fixtures.push({
      ...emptyFixture(`fiba-${game.gameId}`, competition),
      phase: [game.windowName, game.round?.roundName].filter(Boolean).join(" | ") || null,
      group: game.groupPairingCode && /^[A-Z]$/.test(game.groupPairingCode) ? `Grupo ${game.groupPairingCode}` : null,
      homeTeam: fibaTeamName(game.teamA),
      awayTeam: fibaTeamName(game.teamB),
      suspended: game.isPostponed === true,
      homePoints: finished ? (game.teamAScore ?? null) : null,
      awayPoints: finished ? (game.teamBScore ?? null) : null,
      venue: game.venueName ?? null,
      city: game.hostCity ?? null,
      ...schedule,
    });
  }

  return { fixtures, errors };
}
