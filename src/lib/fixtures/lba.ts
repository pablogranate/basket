import type { FixtureRecord, ParsedFixtures } from "@/lib/fixtures/parse";
import { emptyFixture, zonedSchedule } from "@/lib/fixtures/source-helpers";

// legabasket.it reads its calendar from internal JSON routes. The current
// season's championships (regular season, later playoffs) are listed in the
// /calendario page data; get-championships-calendar-by-id returns one round
// (`d`) or one team's season (`t_id`). Kickoffs carry Italy's offset, and
// 00:00 means the time is not set yet.

type LbaChampionship = { id: number; year: number; ctype_code?: string };
type LbaMatch = {
  id: number;
  game_status: string;
  match_datetime: string | null;
  h_team_id: number;
  h_team_name: string | null;
  v_team_id: number;
  v_team_name: string | null;
  home_final_score: number | null;
  visitor_final_score: number | null;
  day_name: string | null;
  plant_name?: string | null;
  town_name?: string | null;
};

const ITALY_TIMEZONE = "Europe/Rome";
const STATUS_FINISHED = "2";
const NEXT_DATA = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/;

export function readLbaCurrentChampionships(html: string): number[] {
  const raw = html.match(NEXT_DATA)?.[1];
  if (!raw) {
    return [];
  }
  const data = JSON.parse(raw) as {
    props?: { pageProps?: { allCompetitionsBySeriesId?: { competitions?: LbaChampionship[] } } };
  };
  const championships = data.props?.pageProps?.allCompetitionsBySeriesId?.competitions ?? [];
  const latest = Math.max(...championships.map((championship) => championship.year));
  return championships.filter((championship) => championship.year === latest).map((championship) => championship.id);
}

export function readLbaMatches(body: unknown): LbaMatch[] | null {
  const matches = (body as { matches?: unknown } | null)?.matches;
  return Array.isArray(matches) ? (matches as LbaMatch[]) : null;
}

export function lbaTeamIds(matches: LbaMatch[]) {
  return [...new Set(matches.flatMap((match) => [match.h_team_id, match.v_team_id]))];
}

export function parseLbaMatches(matches: LbaMatch[], { competition }: { competition: string }): ParsedFixtures {
  const fixtures: FixtureRecord[] = [];
  const errors: string[] = [];

  for (const match of matches) {
    const kickoff = match.match_datetime?.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
    if (!kickoff) {
      errors.push(`Partido ${match.id} sin fecha.`);
      continue;
    }

    const [, date = "", time = ""] = kickoff;
    const finished = match.game_status === STATUS_FINISHED;
    fixtures.push({
      ...emptyFixture(`lba-${match.id}`, competition),
      phase: match.day_name ?? null,
      homeTeam: match.h_team_name?.trim() || null,
      awayTeam: match.v_team_name?.trim() || null,
      homePoints: finished ? match.home_final_score : null,
      awayPoints: finished ? match.visitor_final_score : null,
      venue: match.plant_name ?? null,
      city: match.town_name ?? null,
      ...zonedSchedule({ date, time: time === "00:00" ? null : time, timeZone: ITALY_TIMEZONE }),
    });
  }

  return { fixtures, errors };
}
