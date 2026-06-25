"use server";

import { requireUserContext } from "@/lib/auth";
import { RESPONSIBLE_DISPLAY_LABEL, isDashboardPathAllowedForRole } from "@/lib/constants";
import { getRoleDisplayName } from "@/lib/display";
import { getAttendanceState, type AttendanceState } from "@/lib/grid/attendance";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type MatchContact = {
  personId: string;
  name: string;
  roles: string[];
  phone: string | null;
  email: string | null;
  attendance: AttendanceState;
};

type ContactPerson = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
};

type ContactAssignment = {
  person_id: string | null;
  attendance_response: string | null;
  role: { name: string; category: string; sort_order: number } | null;
  person: ContactPerson | null;
};

type ContactsRow = {
  id: string;
  owner: ContactPerson | null;
  assignments: ContactAssignment[] | null;
};

type Accumulated = MatchContact & { sortKey: number };

// On-demand contact roster for a single match card. Reads only the fields the
// contacts modal renders (no audit/history graph) and is gated to the same
// roles that may open /grid, since it returns staff phone/email (PII).
export async function getMatchContactsAction(
  matchId: string,
): Promise<MatchContact[]> {
  const ctx = await requireUserContext();

  if (!isDashboardPathAllowedForRole("/grid", ctx.role)) {
    throw new Error("No tenes permisos para ver estos contactos.");
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("matches")
    .select(
      "id, owner:people!matches_owner_id_fkey(id, full_name, phone, email), assignments(person_id, attendance_response, role:roles!assignments_role_id_fkey(name, category, sort_order), person:people!assignments_person_id_fkey(id, full_name, phone, email))",
    )
    .eq("id", matchId)
    .maybeSingle<ContactsRow>();

  if (error) {
    throw error;
  }

  if (!data) {
    return [];
  }

  const byPerson = new Map<string, Accumulated>();

  for (const assignment of data.assignments ?? []) {
    const person = assignment.person;

    if (!person) {
      continue;
    }

    const roleLabel = getRoleDisplayName(assignment.role?.name ?? "");
    const sortKey = assignment.role?.sort_order ?? Number.MAX_SAFE_INTEGER;
    const existing = byPerson.get(person.id);

    if (existing) {
      if (roleLabel && !existing.roles.includes(roleLabel)) {
        existing.roles.push(roleLabel);
      }
      existing.sortKey = Math.min(existing.sortKey, sortKey);
      continue;
    }

    byPerson.set(person.id, {
      personId: person.id,
      name: person.full_name,
      roles: roleLabel ? [roleLabel] : [],
      phone: person.phone,
      email: person.email,
      attendance: getAttendanceState(assignment.attendance_response, person.id),
      sortKey,
    });
  }

  // Owner leads the list as the match's responsable, unless they already appear
  // as an assignment (then the role-bearing row wins).
  if (data.owner && !byPerson.has(data.owner.id)) {
    byPerson.set(data.owner.id, {
      personId: data.owner.id,
      name: data.owner.full_name,
      roles: [RESPONSIBLE_DISPLAY_LABEL],
      phone: data.owner.phone,
      email: data.owner.email,
      attendance: null,
      sortKey: -1,
    });
  }

  return [...byPerson.values()]
    .sort((left, right) => {
      if (left.sortKey !== right.sortKey) {
        return left.sortKey - right.sortKey;
      }
      return left.name.localeCompare(right.name, "es");
    })
    .map((contact) => ({
      personId: contact.personId,
      name: contact.name,
      roles: contact.roles,
      phone: contact.phone,
      email: contact.email,
      attendance: contact.attendance,
    }));
}
