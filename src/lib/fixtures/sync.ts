import "server-only";

import { and, eq, gte, inArray, isNotNull, lt, lte, max, notInArray, sql } from "drizzle-orm";

import { db, type DbExecutor } from "@/lib/db/client";
import { fixtures as fixturesTable, leagues as leaguesTable, matches as matchesTable } from "@/lib/db/schema";
import { isSameGame, planFixtureLinks, type LinkCandidate } from "@/lib/fixtures/link-plan";
import type { FixtureRecord } from "@/lib/fixtures/parse";
import { defaultFixtureSources, type FixtureSource } from "@/lib/fixtures/sources";
import { addIsoDays } from "@/lib/fixtures/window";

// Cross-process guard on top of the in-memory one: a CLI backfill and the cron
// never hit the official sites twice within this gap unless forced.
const MIN_GAP_MS = 30 * 60 * 1000;
const WRITE_CHUNK = 500;

type SourcedFixture = FixtureRecord & { source: string };

export type FixturesSyncResult = {
  skipped: boolean;
  reason: "in_progress" | "cooldown" | null;
  from: string;
  to: string;
  fetched: Record<string, number>;
  upserted: number;
  deleted: number;
  linked: number;
  warnings: string[];
  errors: string[];
};

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  const message = (error as { message?: unknown } | null)?.message;
  return typeof message === "string" && message ? message : String(error);
}

let running = false;

export async function getLastFixturesSync(): Promise<string | null> {
  const [row] = await db.select({ last: max(fixturesTable.syncedAt) }).from(fixturesTable);
  return row?.last ?? null;
}

async function upsertFixtures(tx: DbExecutor, records: SourcedFixture[], syncedAt: string) {
  for (const batch of chunk(records, WRITE_CHUNK)) {
    await tx
      .insert(fixturesTable)
      .values(batch.map((record) => ({ ...record, syncedAt })))
      .onConflictDoUpdate({
        target: fixturesTable.id,
        set: {
          competition: sql`excluded.competition`,
          category: sql`excluded.category`,
          phase: sql`excluded.phase`,
          group: sql`excluded."group"`,
          homeClub: sql`excluded.home_club`,
          homeTeam: sql`excluded.home_team`,
          awayClub: sql`excluded.away_club`,
          awayTeam: sql`excluded.away_team`,
          suspended: sql`excluded.suspended`,
          homePoints: sql`excluded.home_points`,
          awayPoints: sql`excluded.away_points`,
          matchDate: sql`excluded.match_date`,
          matchTime: sql`excluded.match_time`,
          venue: sql`excluded.venue`,
          court: sql`excluded.court`,
          city: sql`excluded.city`,
          province: sql`excluded.province`,
          source: sql`excluded.source`,
          syncedAt: sql`excluded.synced_at`,
        },
      });
  }
}

type FeedWindow = { sources: string[]; from: string; to: string; syncedAt: string };

// Games a feed no longer lists inside the fetched window: rows of the fully
// fetched feeds this run did not touch.
function goneFromFeeds({ sources, from, to, syncedAt }: FeedWindow) {
  return and(
    inArray(fixturesTable.source, sources),
    gte(fixturesTable.matchDate, from),
    lte(fixturesTable.matchDate, to),
    lt(fixturesTable.syncedAt, syncedAt),
  );
}

// A fixture a Partido still points at is kept: losing the link is worse than a
// stale row.
async function deleteRemovedFixtures(tx: DbExecutor, feeds: FeedWindow) {
  const linked = tx
    .select({ id: matchesTable.fixtureId })
    .from(matchesTable)
    .where(isNotNull(matchesTable.fixtureId));

  const removed = await tx
    .delete(fixturesTable)
    .where(and(goneFromFeeds(feeds), notInArray(fixturesTable.id, linked)))
    .returning({ id: fixturesTable.id });

  return removed.length;
}

// Partidos to (re)link: those without a fixture; those whose fixture left its
// feed (FeBAMBA lists a rescheduled game as a new row), which keep the old link
// when no new row matches; and those whose fixture names other teams (the
// Grilla reused the ID for another game), which lose a link that is wrong.
async function linkPartidos(tx: DbExecutor, { records, feeds }: { records: FixtureRecord[]; feeds: FeedWindow }) {
  const fixtureGone = feeds.sources.length
    ? sql<boolean>`coalesce(${goneFromFeeds(feeds)}, false)`
    : sql<boolean>`false`;

  // A day of slack on both ends: fixture dates are Argentine, kickoff_at is UTC.
  const partidos = await tx
    .select({
      id: matchesTable.id,
      productionCode: matchesTable.productionCode,
      competition: matchesTable.competition,
      leagueSlug: leaguesTable.slug,
      homeTeam: matchesTable.homeTeam,
      awayTeam: matchesTable.awayTeam,
      kickoffAt: matchesTable.kickoffAt,
      fixtureId: matchesTable.fixtureId,
      fixtureHomeTeam: fixturesTable.homeTeam,
      fixtureAwayTeam: fixturesTable.awayTeam,
      fixtureGone,
    })
    .from(matchesTable)
    .leftJoin(leaguesTable, eq(leaguesTable.id, matchesTable.leagueId))
    .leftJoin(fixturesTable, eq(fixturesTable.id, matchesTable.fixtureId))
    .where(
      and(
        isNotNull(matchesTable.productionCode),
        gte(matchesTable.kickoffAt, `${addIsoDays(feeds.from, -1)}T00:00:00Z`),
        lt(matchesTable.kickoffAt, `${addIsoDays(feeds.to, 2)}T00:00:00Z`),
      ),
    );

  const isOtherGame = (partido: (typeof partidos)[number]) =>
    partido.fixtureId !== null &&
    !isSameGame({ homeTeam: partido.fixtureHomeTeam, awayTeam: partido.fixtureAwayTeam }, partido);
  const otherGame = partidos.filter(isOtherGame);
  const candidates: LinkCandidate[] = partidos.filter(
    (partido) => partido.fixtureId === null || partido.fixtureGone || isOtherGame(partido),
  );

  const released = new Set(otherGame.map((partido) => partido.fixtureId));
  const alreadyLinked = new Set<string>();
  for (const ids of chunk(records.map((record) => record.id), WRITE_CHUNK)) {
    const rows = await tx
      .select({ id: matchesTable.fixtureId })
      .from(matchesTable)
      .where(inArray(matchesTable.fixtureId, ids));
    rows.forEach((row) => row.id && !released.has(row.id) && alreadyLinked.add(row.id));
  }

  const plan = planFixtureLinks({
    fixtures: records.filter((record) => !alreadyLinked.has(record.id)),
    candidates,
  });

  // Freed first: the right Partido may take the fixture a wrong one held.
  if (otherGame.length) {
    await tx
      .update(matchesTable)
      .set({ fixtureId: null })
      .where(inArray(matchesTable.id, otherGame.map((partido) => partido.id)));
  }

  let linked = 0;
  for (const link of plan.links) {
    const updated = await tx
      .update(matchesTable)
      .set({ fixtureId: link.fixtureId })
      .where(eq(matchesTable.id, link.matchId))
      .returning({ id: matchesTable.id });
    linked += updated.length;
  }

  const relinked = new Set(plan.links.map((link) => link.matchId));
  const unlinkedWarnings = otherGame
    .filter((partido) => !relinked.has(partido.id))
    .map((partido) => `desvinculado ${partido.productionCode} ${partido.homeTeam} vs ${partido.awayTeam}: ${partido.fixtureId} es otro partido`);

  return { linked, warnings: [...plan.warnings, ...unlinkedWarnings] };
}

export async function runFixturesSync({
  from,
  to,
  force = false,
  sources = defaultFixtureSources(),
}: {
  from: string;
  to: string;
  force?: boolean;
  sources?: FixtureSource[];
}): Promise<FixturesSyncResult> {
  const result: FixturesSyncResult = {
    skipped: false,
    reason: null,
    from,
    to,
    fetched: {},
    upserted: 0,
    deleted: 0,
    linked: 0,
    warnings: [],
    errors: [],
  };

  if (running) {
    return { ...result, skipped: true, reason: "in_progress" };
  }
  running = true;

  try {
    if (!force) {
      const last = await getLastFixturesSync();
      if (last && Date.now() - new Date(last).getTime() < MIN_GAP_MS) {
        return { ...result, skipped: true, reason: "cooldown" };
      }
    }

    const syncedAt = new Date().toISOString();
    const records = new Map<string, SourcedFixture>();
    const complete: string[] = [];

    // One feed at a time: never two concurrent sessions against a site.
    for (const source of sources) {
      try {
        const parsed = await source.load({ from, to });
        // A feed that no longer parses is broken, not just noisy.
        if (parsed.errors.length) {
          result.errors.push(...parsed.errors.map((error) => `${source.key}: ${error}`));
        }
        const inWindow = parsed.fixtures.filter(
          (record) => record.matchDate !== null && record.matchDate >= from && record.matchDate <= to,
        );
        // An empty parse with errors means the page changed shape, not that
        // every game left the feed.
        if (parsed.fixtures.length > 0 || parsed.errors.length === 0) {
          complete.push(source.key);
        }
        inWindow.forEach((record) => records.set(record.id, { ...record, source: source.key }));
        result.fetched[source.key] = inWindow.length;
      } catch (error) {
        result.errors.push(`${source.key}: ${toErrorMessage(error)}`);
      }
    }

    const fetched = [...records.values()];
    if (fetched.length === 0) {
      return result;
    }

    await db.transaction(async (tx) => {
      await upsertFixtures(tx, fetched, syncedAt);
      result.upserted = fetched.length;

      // A failed feed says nothing about what left it.
      const feeds = { sources: complete, from, to, syncedAt };

      // Linking first lets a rescheduled game's old row go once no Partido
      // points at it.
      const links = await linkPartidos(tx, { records: fetched, feeds });
      result.linked = links.linked;
      result.warnings.push(...links.warnings);

      if (complete.length) {
        result.deleted = await deleteRemovedFixtures(tx, feeds);
      }
    });

    return result;
  } finally {
    running = false;
  }
}
