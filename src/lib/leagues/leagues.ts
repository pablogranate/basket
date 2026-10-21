import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { leagues as leaguesTable } from "@/lib/db/schema";
import { isSameLeagueName, parseLeagueName } from "@/lib/leagues/league-name";
import { slugifyTeamValue } from "@/lib/teams/slug";

// A Liga is identified by its slug, which never changes; its name is what
// people read and can be renamed from /teams.
export type League = {
  id: string;
  name: string;
  slug: string;
  sortOrder: number | null;
  inTeamDirectory: boolean;
};

export type LeagueResult =
  | { ok: true; league: League }
  | { ok: false; error: string };

const LEAGUE_COLUMNS = {
  id: leaguesTable.id,
  name: leaguesTable.name,
  slug: leaguesTable.slug,
  sortOrder: leaguesTable.sortOrder,
  inTeamDirectory: leaguesTable.inTeamDirectory,
};

export async function listLeagues(): Promise<League[]> {
  return db.select(LEAGUE_COLUMNS).from(leaguesTable);
}

// Texts saved before a rename still carry the old name; its slug finds the
// same league.
function matchLeague(all: League[], name: string) {
  return (
    all.find((league) => isSameLeagueName(league.name, name)) ??
    all.find((league) => league.slug === slugifyTeamValue(name)) ??
    null
  );
}

export async function findLeagueByName(name: string) {
  return matchLeague(await listLeagues(), name);
}

export async function findLeaguesByNames(names: string[]) {
  const all = await listLeagues();
  return names
    .map((name) => matchLeague(all, name))
    .filter((league): league is League => league !== null);
}

function pickFreeSlug(all: League[], name: string) {
  const base = slugifyTeamValue(name) || "liga";
  const taken = new Set(all.map((league) => league.slug));
  let slug = base;

  for (let suffix = 2; taken.has(slug); suffix += 1) {
    slug = `${base}-${suffix}`;
  }

  return slug;
}

async function insertLeague(
  all: League[],
  name: string,
  inTeamDirectory: boolean,
): Promise<League> {
  const lastPosition = Math.max(0, ...all.map((league) => league.sortOrder ?? 0));
  const [league] = await db
    .insert(leaguesTable)
    .values({
      name,
      slug: pickFreeSlug(all, name),
      sortOrder: lastPosition + 1,
      inTeamDirectory,
    })
    .returning(LEAGUE_COLUMNS);

  return league;
}

// For team writes that name a league: reuse it, or add it on the fly.
export async function ensureLeague(name: string): Promise<League> {
  const all = await listLeagues();
  return matchLeague(all, name) ?? insertLeague(all, name, false);
}

// A league that already exists but has no /teams tab (one only the Grilla
// uses, say) gets its tab instead of a duplicate.
export async function createLeague(rawName: string): Promise<LeagueResult> {
  const parsed = parseLeagueName(rawName);
  if (!parsed.ok) {
    return parsed;
  }

  const all = await listLeagues();
  const existing = all.find((league) => isSameLeagueName(league.name, parsed.name));

  if (existing?.inTeamDirectory) {
    return { ok: false, error: `Ya existe la liga ${existing.name}.` };
  }

  if (existing) {
    await db
      .update(leaguesTable)
      .set({ inTeamDirectory: true, updatedAt: new Date().toISOString() })
      .where(eq(leaguesTable.id, existing.id));
    return { ok: true, league: { ...existing, inTeamDirectory: true } };
  }

  return { ok: true, league: await insertLeague(all, parsed.name, true) };
}

export async function renameLeague({
  currentName,
  name,
}: {
  currentName: string;
  name: string;
}): Promise<LeagueResult> {
  const parsed = parseLeagueName(name);
  if (!parsed.ok) {
    return parsed;
  }

  const all = await listLeagues();
  const league = matchLeague(all, currentName);

  if (!league) {
    return { ok: false, error: "No se encontró la liga." };
  }

  const clash = all.find(
    (other) => other.id !== league.id && isSameLeagueName(other.name, parsed.name),
  );

  if (clash) {
    return { ok: false, error: `Ya existe la liga ${clash.name}.` };
  }

  if (league.name === parsed.name) {
    return { ok: true, league };
  }

  await db
    .update(leaguesTable)
    .set({ name: parsed.name, updatedAt: new Date().toISOString() })
    .where(eq(leaguesTable.id, league.id));

  return { ok: true, league: { ...league, name: parsed.name } };
}

// Positions are 1-based in the given order; names without a league get one.
export async function setLeagueOrder(names: string[]) {
  const ordered: League[] = [];
  for (const name of names) {
    ordered.push(await ensureLeague(name));
  }

  await db.transaction(async (tx) => {
    for (const [index, league] of ordered.entries()) {
      await tx
        .update(leaguesTable)
        .set({ sortOrder: index + 1, updatedAt: new Date().toISOString() })
        .where(eq(leaguesTable.id, league.id));
    }
  });
}
