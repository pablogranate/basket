import type { FixtureRecord, ParsedFixtures } from "@/lib/fixtures/parse";
import { fixtureScheduleAt, emptyFixture } from "@/lib/fixtures/source-helpers";

// The Uruguayan federation (fubb.org.uy) runs on Genius Sports. Its calendar
// widget reads gapi.pixeles.club/ligas/fubb/api/bq/matchesnew?competitionId=N,
// public JSON grouped by phase. Each season of each league (LUB, LDA…) is a
// new competition id; the site lists its current ones as
// /set-competition?competition=<site id> links, and /calendario then names the
// Genius id in its <games-calendar competition-id="…"> widget.

type FubbCompetitor = { competitorName?: string | null; scoreString?: string | null };
type FubbMatch = {
  matchId: number;
  matchStatus: string;
  matchTimeUTC: string | null;
  competitors?: FubbCompetitor[];
  venue?: { venueName?: string | null } | null;
};
type FubbPhase = { name?: string | null; matches?: FubbMatch[] };

const SUSPENDED_STATUSES = new Set(["POSTPONED", "CANCELLED", "ABANDONED"]);

export function readFubbSiteCompetitions(html: string) {
  return [...new Set([...html.matchAll(/set-competition\?competition=(\d+)/g)].map(([, id]) => id!))];
}

export function readFubbGeniusCompetition(html: string) {
  return html.match(/competition-id="(\d+)"/)?.[1] ?? null;
}

export function readFubbPhases(body: unknown): FubbPhase[] | null {
  const phases = (body as { phases?: unknown } | null)?.phases;
  return Array.isArray(phases) ? (phases as FubbPhase[]) : null;
}

function score(value: string | null | undefined) {
  return value && /^\d+$/.test(value.trim()) ? Number(value) : null;
}

export function parseFubbPhases(
  phases: FubbPhase[],
  { competition, idPrefix }: { competition: string; idPrefix: string },
): ParsedFixtures {
  const fixtures: FixtureRecord[] = [];
  const errors: string[] = [];

  for (const phase of phases) {
    for (const match of phase.matches ?? []) {
      if (!match.matchTimeUTC) {
        continue;
      }
      const [home, away] = match.competitors ?? [];
      const finished = match.matchStatus === "COMPLETE";
      fixtures.push({
        ...emptyFixture(`${idPrefix}-${match.matchId}`, competition),
        phase: phase.name?.trim() || null,
        homeTeam: home?.competitorName?.trim() || null,
        awayTeam: away?.competitorName?.trim() || null,
        suspended: SUSPENDED_STATUSES.has(match.matchStatus),
        homePoints: finished ? score(home?.scoreString) : null,
        awayPoints: finished ? score(away?.scoreString) : null,
        venue: match.venue?.venueName ?? null,
        ...fixtureScheduleAt(`${match.matchTimeUTC.replace(" ", "T")}Z`),
      });
    }
  }

  return { fixtures, errors };
}
