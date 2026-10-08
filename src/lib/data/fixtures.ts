import "server-only";

import { and, asc, eq, gte, lte } from "drizzle-orm";

import type { UserContext } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { fixtures as fixturesTable, matches as matchesTable } from "@/lib/db/schema";
import { addIsoDays, fixtureToday } from "@/lib/fixtures/window";

// ADR 0005: fixtures accumulate every season, so the page reads a bounded
// window (recent days collapsed, the next weeks open) with a row cap.
const DAYS_BEFORE = 21;
const DAYS_AFTER = 60;
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
  partido: { id: string; productionCode: string | null } | null;
};

export async function getFixturesAgenda(ctx: UserContext, now: Date) {
  void ctx;
  const today = fixtureToday(now);

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
    })
    .from(fixturesTable)
    .leftJoin(matchesTable, eq(matchesTable.fixtureId, fixturesTable.id))
    .where(
      and(
        gte(fixturesTable.matchDate, addIsoDays(today, -DAYS_BEFORE)),
        lte(fixturesTable.matchDate, addIsoDays(today, DAYS_AFTER)),
      ),
    )
    .orderBy(asc(fixturesTable.matchDate), asc(fixturesTable.matchTime), asc(fixturesTable.id))
    .limit(FIXTURE_ROW_LIMIT);

  const fixtures: FixtureListItem[] = rows.map(({ partidoId, productionCode, matchDate, ...fixture }) => ({
    ...fixture,
    matchDate: matchDate ?? today,
    partido: partidoId ? { id: partidoId, productionCode } : null,
  }));

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
