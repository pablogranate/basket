import "server-only";

import { and, asc, eq, gte, lte } from "drizzle-orm";
import { formatInTimeZone } from "date-fns-tz";

import type { UserContext } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { fixtures as fixturesTable, matches as matchesTable } from "@/lib/db/schema";
import { DEFAULT_TIMEZONE } from "@/lib/constants";
import { compareFixtureSchedule, type FixtureSchedule } from "@/lib/fixtures/schedule";
import { fixtureMonthRange, fixtureToday } from "@/lib/fixtures/window";

// ADR 0005: fixtures accumulate every season, so the page reads one month at a
// time with a row cap.
export const FIXTURE_ROW_LIMIT = 1000;

export type FixtureListItem = {
  id: string;
  competition: string | null;
  category: string | null;
  phase: string | null;
  group: string | null;
  homeClub: string | null;
  homeTeam: string | null;
  awayClub: string | null;
  awayTeam: string | null;
  suspended: boolean;
  homePoints: number | null;
  awayPoints: number | null;
  matchDate: string;
  matchTime: string | null;
  venue: string | null;
  city: string | null;
  province: string | null;
  partido: FixturePartido | null;
};

// gridDate is the day the /grid day view files the Partido under (grid
// timezone); schedule is its kickoff in Argentine time, as CABB writes it.
export type FixturePartido = {
  id: string;
  productionCode: string | null;
  gridDate: string;
  schedule: FixtureSchedule;
  scheduleDiffers: boolean;
};

export async function getFixturesAgenda(ctx: UserContext, { now, month }: { now: Date; month: string }) {
  void ctx;
  const today = fixtureToday(now);
  const { from, to } = fixtureMonthRange(month);

  const rows = await db
    .select({
      id: fixturesTable.id,
      competition: fixturesTable.competition,
      category: fixturesTable.category,
      phase: fixturesTable.phase,
      group: fixturesTable.group,
      homeClub: fixturesTable.homeClub,
      homeTeam: fixturesTable.homeTeam,
      awayClub: fixturesTable.awayClub,
      awayTeam: fixturesTable.awayTeam,
      suspended: fixturesTable.suspended,
      homePoints: fixturesTable.homePoints,
      awayPoints: fixturesTable.awayPoints,
      matchDate: fixturesTable.matchDate,
      matchTime: fixturesTable.matchTime,
      venue: fixturesTable.venue,
      city: fixturesTable.city,
      province: fixturesTable.province,
      partidoId: matchesTable.id,
      productionCode: matchesTable.productionCode,
      kickoffAt: matchesTable.kickoffAt,
    })
    .from(fixturesTable)
    .leftJoin(matchesTable, eq(matchesTable.fixtureId, fixturesTable.id))
    .where(
      and(
        gte(fixturesTable.matchDate, from),
        lte(fixturesTable.matchDate, to),
      ),
    )
    .orderBy(asc(fixturesTable.matchDate), asc(fixturesTable.matchTime), asc(fixturesTable.id))
    .limit(FIXTURE_ROW_LIMIT);

  const fixtures: FixtureListItem[] = rows.map(
    ({ partidoId, productionCode, kickoffAt, matchDate, ...fixture }) => {
      const comparison = kickoffAt ? compareFixtureSchedule({ matchDate, matchTime: fixture.matchTime }, kickoffAt) : null;

      return {
        ...fixture,
        matchDate: matchDate ?? today,
        partido:
          partidoId && kickoffAt && comparison
            ? {
                id: partidoId,
                productionCode,
                gridDate: formatInTimeZone(kickoffAt, DEFAULT_TIMEZONE, "yyyy-MM-dd"),
                schedule: comparison.grid,
                scheduleDiffers: comparison.differs,
              }
            : null,
      };
    },
  );

  return { today, fixtures, truncated: rows.length === FIXTURE_ROW_LIMIT };
}

export async function getFixtureForMatch(ctx: UserContext, fixtureId: string) {
  void ctx;
  const [row] = await db
    .select({
      id: fixturesTable.id,
      competition: fixturesTable.competition,
      phase: fixturesTable.phase,
      group: fixturesTable.group,
      homeTeam: fixturesTable.homeTeam,
      awayTeam: fixturesTable.awayTeam,
      suspended: fixturesTable.suspended,
      homePoints: fixturesTable.homePoints,
      awayPoints: fixturesTable.awayPoints,
      matchDate: fixturesTable.matchDate,
      matchTime: fixturesTable.matchTime,
      venue: fixturesTable.venue,
      city: fixturesTable.city,
      province: fixturesTable.province,
      syncedAt: fixturesTable.syncedAt,
    })
    .from(fixturesTable)
    .where(eq(fixturesTable.id, fixtureId))
    .limit(1);

  return row ?? null;
}
