import type { FixtureRecord, ParsedFixtures } from "@/lib/fixtures/parse";
import { fixtureScheduleAt, emptyFixture } from "@/lib/fixtures/source-helpers";

// Euroleague's live API (api-live.euroleague.net/v2/competitions/E/seasons/
// E<year>/games) lists the whole season. `gameStatus` stays "Confirmed" after
// a game ends, so `played` is the finished flag. Unconfirmed kickoffs keep only
// their local date.

type EuroleagueTeam = { club?: { name?: string }; score?: number | null };
type EuroleagueGame = {
  identifier: string;
  utcDate: string | null;
  localDate: string | null;
  confirmedHour?: boolean;
  played: boolean;
  roundName?: string | null;
  phaseType?: { name?: string | null } | null;
  local: EuroleagueTeam;
  road: EuroleagueTeam;
  venue?: { name?: string | null } | null;
};

export function euroleagueSeasonCode(isoDate: string) {
  const [year, month] = isoDate.split("-").map(Number);
  return `E${month! >= 7 ? year : year! - 1}`;
}

export function parseEuroleagueGames(body: unknown, { competition }: { competition: string }): ParsedFixtures {
  const games = (body as { data?: unknown } | null)?.data;
  if (!Array.isArray(games)) {
    return { fixtures: [], errors: ["La API de Euroleague cambio de formato."] };
  }

  const fixtures: FixtureRecord[] = [];
  const errors: string[] = [];

  for (const game of games as EuroleagueGame[]) {
    const schedule =
      game.confirmedHour === false && game.localDate
        ? { matchDate: game.localDate.slice(0, 10), matchTime: null }
        : game.utcDate
          ? fixtureScheduleAt(game.utcDate)
          : null;
    if (!schedule) {
      errors.push(`Partido ${game.identifier} sin fecha.`);
      continue;
    }

    fixtures.push({
      ...emptyFixture(`el-${game.identifier}`, competition),
      phase: game.roundName ?? null,
      group: game.phaseType?.name ?? null,
      homeTeam: game.local.club?.name?.trim() || null,
      awayTeam: game.road.club?.name?.trim() || null,
      homePoints: game.played ? (game.local.score ?? null) : null,
      awayPoints: game.played ? (game.road.score ?? null) : null,
      venue: game.venue?.name ?? null,
      ...schedule,
    });
  }

  return { fixtures, errors };
}
