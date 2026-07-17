"use server";

import { asc, eq } from "drizzle-orm";

import { requireUserContext } from "@/lib/auth";
import { isDashboardPathAllowedForRole } from "@/lib/constants";
import { db } from "@/lib/db/client";
import {
  assignments as assignmentsTable,
  matches as matchesTable,
  people as peopleTable,
  roles as rolesTable,
} from "@/lib/db/schema";
import {
  buildMatchCardSections,
  type MatchCardSection,
} from "@/lib/grid/match-card-sections";

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

  const matchRows = await db
    .select({
      id: matchesTable.id,
      transport: matchesTable.transport,
      notes: matchesTable.notes,
      owner: { full_name: peopleTable.fullName },
    })
    .from(matchesTable)
    .leftJoin(peopleTable, eq(matchesTable.ownerId, peopleTable.id))
    .where(eq(matchesTable.id, matchId))
    .limit(1);

  const match = matchRows[0];

  if (!match) {
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
      person: { full_name: peopleTable.fullName },
    })
    .from(assignmentsTable)
    .innerJoin(rolesTable, eq(assignmentsTable.roleId, rolesTable.id))
    .leftJoin(peopleTable, eq(assignmentsTable.personId, peopleTable.id))
    .where(eq(assignmentsTable.matchId, matchId))
    .orderBy(asc(rolesTable.sortOrder), asc(assignmentsTable.id));

  return buildMatchCardSections({
    transport: match.transport,
    notes: match.notes,
    owner: match.owner?.full_name ? match.owner : null,
    assignments: assignmentRows.map((row) => ({
      person_id: row.person_id,
      attendance_response: row.attendance_response,
      role: row.role,
      person: row.person?.full_name ? row.person : null,
    })),
  });
}
