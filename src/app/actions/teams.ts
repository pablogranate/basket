"use server";

import { revalidatePath } from "next/cache";

import { requireEditor } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { splitTeamCompetitions } from "@/lib/team-directory";
import { ensureErrorMessage, maybeNull } from "@/lib/utils";

const FALLBACK_SEASON = "2025/26";

type SupabaseServerClient = Awaited<
  ReturnType<typeof createSupabaseServerClient>
>;

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

async function resolveCurrentSeason(supabase: SupabaseServerClient) {
  const seasonQuery = await supabase
    .from("team_league_memberships")
    .select("season")
    .order("season", { ascending: false })
    .limit(1)
    .maybeSingle();

  return seasonQuery.data?.season ?? FALLBACK_SEASON;
}

async function ensureLeague(supabase: SupabaseServerClient, name: string) {
  const slug = slugifyTeamValue(name);
  const existing = await supabase
    .from("leagues")
    .select("id, slug")
    .eq("slug", slug)
    .maybeSingle();

  if (existing.error) {
    throw existing.error;
  }

  if (existing.data) {
    return existing.data;
  }

  const inserted = await supabase
    .from("leagues")
    .insert({ name, slug })
    .select("id, slug")
    .single();

  if (inserted.error) {
    throw inserted.error;
  }

  return inserted.data;
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

async function ensureClub(
  supabase: SupabaseServerClient,
  fields: ClubFields,
) {
  const slug = slugifyTeamValue(fields.name);
  const existing = await supabase
    .from("clubs")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  if (existing.error) {
    throw existing.error;
  }

  if (!existing.data) {
    const inserted = await supabase
      .from("clubs")
      .insert({ ...fields, slug })
      .select("id")
      .single();

    if (inserted.error) {
      throw inserted.error;
    }

    return inserted.data.id;
  }

  // A "create" that lands on an existing club only fills gaps, never clears
  // data; full overwrites happen through the edit path.
  const patch: Partial<ClubFields> = {};

  for (const key of Object.keys(fields) as Array<keyof ClubFields>) {
    const value = fields[key];
    if (value !== null) {
      patch[key] = value;
    }
  }

  const updated = await supabase
    .from("clubs")
    .update(patch)
    .eq("id", existing.data.id);

  if (updated.error) {
    throw updated.error;
  }

  return existing.data.id;
}

async function ensureTeam(
  supabase: SupabaseServerClient,
  { clubId, name, category }: { clubId: string; name: string; category: string },
) {
  const existing = await supabase
    .from("teams")
    .select("id")
    .eq("club_id", clubId)
    .eq("category", category)
    .maybeSingle();

  if (existing.error) {
    throw existing.error;
  }

  if (existing.data) {
    return existing.data.id;
  }

  const slug =
    category === "mayores"
      ? slugifyTeamValue(name)
      : `${slugifyTeamValue(name)}-${category}`;

  const inserted = await supabase
    .from("teams")
    .insert({ club_id: clubId, name, slug, category })
    .select("id")
    .single();

  if (inserted.error) {
    throw inserted.error;
  }

  return inserted.data.id;
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

    const supabase = await createSupabaseServerClient();

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
      const editedTeam = await supabase
        .from("teams")
        .select("club_id")
        .eq("id", editedTeamId)
        .single();

      if (editedTeam.error) {
        throw editedTeam.error;
      }

      clubId = editedTeam.data.club_id;
      const clubUpdate = await supabase
        .from("clubs")
        .update(clubFields)
        .eq("id", clubId);

      if (clubUpdate.error) {
        throw clubUpdate.error;
      }
    } else {
      clubId = await ensureClub(supabase, clubFields);
    }

    const season = await resolveCurrentSeason(supabase);
    const selectedLeagueIdsForEditedTeam: string[] = [];

    for (const leagueName of leagueNames) {
      const league = await ensureLeague(supabase, leagueName);
      const category = resolveTeamCategory(league.slug);
      const teamId = await ensureTeam(supabase, { clubId, name, category });

      const membership = await supabase
        .from("team_league_memberships")
        .upsert(
          { team_id: teamId, league_id: league.id, season },
          { onConflict: "team_id,league_id,season", ignoreDuplicates: true },
        );

      if (membership.error) {
        throw membership.error;
      }

      if (editedTeamId && teamId === editedTeamId) {
        selectedLeagueIdsForEditedTeam.push(league.id);
      }
    }

    if (editedTeamId) {
      const teamUpdate = await supabase
        .from("teams")
        .update({ name })
        .eq("id", editedTeamId);

      if (teamUpdate.error) {
        throw teamUpdate.error;
      }

      // Switching league replaces the edited team's memberships for the
      // current season; leagues kept in the selection survive untouched.
      if (selectedLeagueIdsForEditedTeam.length) {
        const cleanup = await supabase
          .from("team_league_memberships")
          .delete()
          .eq("team_id", editedTeamId)
          .eq("season", season)
          .not(
            "league_id",
            "in",
            `(${selectedLeagueIdsForEditedTeam.join(",")})`,
          );

        if (cleanup.error) {
          throw cleanup.error;
        }
      }
    }

    revalidatePath("/teams");

    return { ok: true };
  } catch (error) {
    console.error("[teams] failed to upsert team", error);
    return { ok: false, error: ensureErrorMessage(error) };
  }
}
