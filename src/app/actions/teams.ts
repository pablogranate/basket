"use server";

import { revalidatePath } from "next/cache";

import { and, desc, eq, notInArray } from "drizzle-orm";

import { requireEditor } from "@/lib/auth";
import { db } from "@/lib/db/client";
import {
  clubs as clubsTable,
  leagues as leaguesTable,
  teamLeagueMemberships as teamLeagueMembershipsTable,
  teams as teamsTable,
} from "@/lib/db/schema";
import { splitTeamCompetitions } from "@/lib/team-directory";
import { ensureErrorMessage, maybeNull } from "@/lib/utils";

const FALLBACK_SEASON = "2025/26";

function slugifyTeamValue(value: string) {
  return value
    .normalize("NFD")
    .replaceAll(/[̀-ͯ]/g, "")
    .replaceAll(/[^a-zA-Z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "")
    .toLowerCase();
}

function resolveTeamCategory(leagueSlug: string) {
  if (leagueSlug.includes("femenina")) {
    return "femenino";
  }

  if (leagueSlug.includes("proximo")) {
    return "proximo";
  }

  return "mayores";
}

async function resolveCurrentSeason() {
  const rows = await db
    .select({ season: teamLeagueMembershipsTable.season })
    .from(teamLeagueMembershipsTable)
    .orderBy(desc(teamLeagueMembershipsTable.season))
    .limit(1);

  return rows[0]?.season ?? FALLBACK_SEASON;
}

async function ensureLeague(name: string) {
  const slug = slugifyTeamValue(name);
  const existing = await db
    .select({ id: leaguesTable.id, slug: leaguesTable.slug })
    .from(leaguesTable)
    .where(eq(leaguesTable.slug, slug))
    .limit(1);

  if (existing[0]) {
    return existing[0];
  }

  const inserted = await db
    .insert(leaguesTable)
    .values({ name, slug })
    .returning({ id: leaguesTable.id, slug: leaguesTable.slug });

  return inserted[0];
}

type ClubFields = {
  name: string;
  stadium: string | null;
  manager: string | null;
  website: string | null;
  instagram: string | null;
  official_url: string | null;
  logo_url: string | null;
};

// Map the snake_case ClubFields to Drizzle (camelCase) column keys.
function clubFieldColumns(fields: ClubFields) {
  return {
    name: fields.name,
    stadium: fields.stadium,
    manager: fields.manager,
    website: fields.website,
    instagram: fields.instagram,
    officialUrl: fields.official_url,
    logoUrl: fields.logo_url,
  };
}

async function ensureClub(fields: ClubFields) {
  const slug = slugifyTeamValue(fields.name);
  const existing = await db
    .select({ id: clubsTable.id })
    .from(clubsTable)
    .where(eq(clubsTable.slug, slug))
    .limit(1);

  if (!existing[0]) {
    const inserted = await db
      .insert(clubsTable)
      .values({ ...clubFieldColumns(fields), slug })
      .returning({ id: clubsTable.id });

    return inserted[0].id;
  }

  // A "create" that lands on an existing club only fills gaps, never clears
  // data; full overwrites happen through the edit path.
  const columns = clubFieldColumns(fields);
  const patch: Partial<typeof clubsTable.$inferInsert> = {};

  for (const key of Object.keys(columns) as Array<keyof typeof columns>) {
    const value = columns[key];
    if (value !== null) {
      patch[key] = value;
    }
  }

  await db.update(clubsTable).set(patch).where(eq(clubsTable.id, existing[0].id));

  return existing[0].id;
}

async function ensureTeam({
  clubId,
  name,
  category,
}: {
  clubId: string;
  name: string;
  category: string;
}) {
  const existing = await db
    .select({ id: teamsTable.id })
    .from(teamsTable)
    .where(and(eq(teamsTable.clubId, clubId), eq(teamsTable.category, category)))
    .limit(1);

  if (existing[0]) {
    return existing[0].id;
  }

  const slug =
    category === "mayores"
      ? slugifyTeamValue(name)
      : `${slugifyTeamValue(name)}-${category}`;

  const inserted = await db
    .insert(teamsTable)
    .values({ clubId, name, slug, category })
    .returning({ id: teamsTable.id });

  return inserted[0].id;
}

export type UpsertTeamResult = {
  ok: boolean;
  error?: string;
};

export async function upsertTeamAction(
  formData: FormData,
): Promise<UpsertTeamResult> {
  try {
    await requireEditor();

    const editedTeamId = maybeNull(String(formData.get("teamId") ?? ""));
    const name = String(formData.get("officialName") ?? "").trim();
    const competition = String(formData.get("competition") ?? "").trim();
    const leagueNames = splitTeamCompetitions(competition);

    if (!name || !leagueNames.length) {
      return { ok: false, error: "Nombre oficial y liga son obligatorios." };
    }

    const clubFields: ClubFields = {
      name,
      stadium: maybeNull(String(formData.get("stadium") ?? "")),
      manager: maybeNull(String(formData.get("manager") ?? "")),
      website: maybeNull(String(formData.get("website") ?? "")),
      instagram: maybeNull(String(formData.get("instagram") ?? "")),
      official_url: maybeNull(String(formData.get("officialUrl") ?? "")),
      logo_url: maybeNull(String(formData.get("logoDataUrl") ?? "")),
    };

    let clubId: string;

    if (editedTeamId) {
      // Editing renames the club in place (slug stays stable); resolving the
      // club by name here would fork a duplicate club on any rename.
      const editedTeam = await db
        .select({ club_id: teamsTable.clubId })
        .from(teamsTable)
        .where(eq(teamsTable.id, editedTeamId))
        .limit(1);

      if (!editedTeam[0]) {
        throw new Error("No se encontró el equipo a editar.");
      }

      clubId = editedTeam[0].club_id;
      await db
        .update(clubsTable)
        .set(clubFieldColumns(clubFields))
        .where(eq(clubsTable.id, clubId));
    } else {
      clubId = await ensureClub(clubFields);
    }

    const season = await resolveCurrentSeason();
    const selectedLeagueIdsForEditedTeam: string[] = [];

    for (const leagueName of leagueNames) {
      const league = await ensureLeague(leagueName);
      const category = resolveTeamCategory(league.slug);
      const teamId = await ensureTeam({ clubId, name, category });

      await db
        .insert(teamLeagueMembershipsTable)
        .values({ teamId, leagueId: league.id, season })
        .onConflictDoNothing({
          target: [
            teamLeagueMembershipsTable.teamId,
            teamLeagueMembershipsTable.leagueId,
            teamLeagueMembershipsTable.season,
          ],
        });

      if (editedTeamId && teamId === editedTeamId) {
        selectedLeagueIdsForEditedTeam.push(league.id);
      }
    }

    if (editedTeamId) {
      await db
        .update(teamsTable)
        .set({ name })
        .where(eq(teamsTable.id, editedTeamId));

      // Switching league replaces the edited team's memberships for the
      // current season; leagues kept in the selection survive untouched.
      if (selectedLeagueIdsForEditedTeam.length) {
        await db
          .delete(teamLeagueMembershipsTable)
          .where(
            and(
              eq(teamLeagueMembershipsTable.teamId, editedTeamId),
              eq(teamLeagueMembershipsTable.season, season),
              notInArray(
                teamLeagueMembershipsTable.leagueId,
                selectedLeagueIdsForEditedTeam,
              ),
            ),
          );
      }
    }

    revalidatePath("/teams");

    return { ok: true };
  } catch (error) {
    console.error("[teams] failed to upsert team", error);
    return { ok: false, error: ensureErrorMessage(error) };
  }
}
