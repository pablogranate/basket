"use server";

import { asc, eq } from "drizzle-orm";

import { requireUserContext } from "@/lib/auth";
import { RESPONSIBLE_DISPLAY_LABEL, isDashboardPathAllowedForRole } from "@/lib/constants";
import { db } from "@/lib/db/client";
import {
  assignments as assignmentsTable,
  matches as matchesTable,
  people as peopleTable,
  roles as rolesTable,
} from "@/lib/db/schema";
import { getRoleDisplayName } from "@/lib/display";
import { getAttendanceState, type AttendanceState } from "@/lib/grid/attendance";

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

  const matchRows = await db
    .select({
      id: matchesTable.id,
      owner: {
        id: peopleTable.id,
        full_name: peopleTable.fullName,
        phone: peopleTable.phone,
        email: peopleTable.email,
      },
    })
    .from(matchesTable)
    .leftJoin(peopleTable, eq(matchesTable.ownerId, peopleTable.id))
    .where(eq(matchesTable.id, matchId))
    .limit(1);

  const matchRow = matchRows[0];

  if (!matchRow) {
    return [];
  }

  const assignmentRows = await db
    .select({
      person_id: assignmentsTable.personId,
      attendance_response: assignmentsTable.attendanceResponse,
      role: {
        name: rolesTable.name,
        category: rolesTable.category,
        sort_order: rolesTable.sortOrder,
      },
      person: {
        id: peopleTable.id,
        full_name: peopleTable.fullName,
        phone: peopleTable.phone,
        email: peopleTable.email,
      },
    })
    .from(assignmentsTable)
    .innerJoin(rolesTable, eq(assignmentsTable.roleId, rolesTable.id))
    .leftJoin(peopleTable, eq(assignmentsTable.personId, peopleTable.id))
    .where(eq(assignmentsTable.matchId, matchId))
    .orderBy(asc(rolesTable.sortOrder), asc(assignmentsTable.id));

  const data: ContactsRow = {
    id: matchRow.id,
    owner: matchRow.owner?.id ? matchRow.owner : null,
    assignments: assignmentRows.map((row) => ({
      person_id: row.person_id,
      attendance_response: row.attendance_response,
      role: row.role,
      person: row.person?.id ? row.person : null,
    })),
  };

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
