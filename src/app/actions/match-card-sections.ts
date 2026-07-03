"use server";

import { requireUserContext } from "@/lib/auth";
import { isDashboardPathAllowedForRole } from "@/lib/constants";
import {
  buildMatchCardSections,
  type MatchCardSection,
  type SectionMatchInput,
} from "@/lib/grid/match-card-sections";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type SectionsRow = SectionMatchInput & { id: string };

// On-demand detail sections for a single grid card. The collapsed card no longer
// serializes its production/cameras/talent/observations rows into the Flight
// payload; they are fetched here only when a card is expanded. Reads just the
// fields the sections render and is gated to the roles that may open /grid.
export async function getMatchCardSectionsAction(
  matchId: string,
): Promise<MatchCardSection[]> {
  const ctx = await requireUserContext();

  if (!isDashboardPathAllowedForRole("/grid", ctx.role)) {
    throw new Error("No tenes permisos para ver este partido.");
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("matches")
    .select(
      "id, transport, notes, owner:people!matches_owner_id_fkey(full_name), assignments(person_id, attendance_response, role:roles!assignments_role_id_fkey(name, category, sort_order), person:people!assignments_person_id_fkey(full_name))",
    )
    .eq("id", matchId)
    .maybeSingle<SectionsRow>();

  if (error) {
    throw error;
  }

  if (!data) {
    return [];
  }

  return buildMatchCardSections(data);
}
