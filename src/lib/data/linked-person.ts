import type { PersonRow } from "@/lib/database.types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { normalizeText } from "@/lib/utils";

export type LinkedPerson = Pick<
  PersonRow,
  "id" | "full_name" | "email" | "phone" | "active"
>;

// Resolves the active `people` row behind a logged-in user, first by exact
// email then by normalized full name. Shared by mi-jornada (collaborators) and
// attendance confirmation (PRD #7). Kept in its own small module so attendance
// does not pull in the entire collaborators data graph.
export async function findLinkedPerson(params: {
  email: string | null;
  profileName: string | null;
}) {
  const supabase = await createSupabaseServerClient();

  if (params.email) {
    const byEmail = await supabase
      .from("people")
      .select("id, full_name, email, phone, active")
      .eq("email", params.email)
      .eq("active", true)
      .maybeSingle();

    if (byEmail.error) {
      throw byEmail.error;
    }

    if (byEmail.data) {
      return {
        person: byEmail.data as LinkedPerson,
        linkedBy: "email" as const,
      };
    }
  }

  if (!params.profileName) {
    return {
      person: null,
      linkedBy: null,
    };
  }

  const candidates = await supabase
    .from("people")
    .select("id, full_name, email, phone, active")
    .eq("active", true)
    .ilike("full_name", `%${params.profileName.trim()}%`);

  if (candidates.error) {
    throw candidates.error;
  }

  const profileName = normalizeText(params.profileName);
  const matched =
    ((candidates.data ?? []) as LinkedPerson[]).find(
      (person) => normalizeText(person.full_name) === profileName,
    ) ?? null;

  return {
    person: matched,
    linkedBy: matched ? ("name" as const) : null,
  };
}
