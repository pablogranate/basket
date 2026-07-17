import { eq } from "drizzle-orm";

import type { UserContext } from "@/lib/auth";
import { canConfirmAttendance } from "@/lib/attendance";
import { stampUpdate } from "@/lib/audit";
import { findLinkedPerson } from "@/lib/data/linked-person";
import { db } from "@/lib/db/client";
import { assignments as assignmentsTable, matches as matchesTable } from "@/lib/db/schema";

export type AttendanceResponse = "attending" | "declined";

export type AttendanceOutcome =
  | { ok: true; matchId: string }
  | { ok: false; reason: "not-linked" | "not-found" | "forbidden" };

type AssignmentForAttendance = {
  id: string;
  match_id: string;
  person_id: string | null;
  match: { kickoff_at: string; duration_minutes: number } | null;
};

// Confirming attendance is deliberately NOT audited (PRD #7): no writeAudit call,
// so toggles never appear in the match history timeline.
export async function recordAttendanceConfirmation(
  ctx: UserContext,
  params: {
    assignmentId: string;
    response: AttendanceResponse | null;
    note?: string | null;
  },
): Promise<AttendanceOutcome> {
  const { person } = await findLinkedPerson({
    email: ctx.email,
    profileName: ctx.profile?.full_name ?? null,
  });

  if (!person) {
    return { ok: false, reason: "not-linked" };
  }

  const assignmentRows = await db
    .select({
      id: assignmentsTable.id,
      match_id: assignmentsTable.matchId,
      person_id: assignmentsTable.personId,
      match: {
        kickoff_at: matchesTable.kickoffAt,
        duration_minutes: matchesTable.durationMinutes,
      },
    })
    .from(assignmentsTable)
    .leftJoin(matchesTable, eq(assignmentsTable.matchId, matchesTable.id))
    .where(eq(assignmentsTable.id, params.assignmentId))
    .limit(1);

  const row = assignmentRows[0];
  const assignment: AssignmentForAttendance | null = row
    ? { ...row, match: row.match?.kickoff_at ? row.match : null }
    : null;

  if (!assignment || !assignment.match) {
    return { ok: false, reason: "not-found" };
  }

  const allowed = canConfirmAttendance({
    assignmentPersonId: assignment.person_id,
    callerPersonId: person.id,
    kickoffAt: assignment.match.kickoff_at,
    durationMinutes: assignment.match.duration_minutes,
    now: new Date(),
  });

  if (!allowed) {
    return { ok: false, reason: "forbidden" };
  }

  // attendance_confirmed_at stays the "will attend" signal (set only when
  // attending); pending leaves it NULL. attendance_note is the optional note the
  // person leaves alongside their confirmation; cleared when there is no response.
  const stamped = stampUpdate(ctx, {
    attendance_response: params.response,
    attendance_confirmed_at:
      params.response === "attending" ? new Date().toISOString() : null,
    attendance_note: params.response ? params.note?.trim() || null : null,
  });

  await db
    .update(assignmentsTable)
    .set({
      attendanceResponse: stamped.attendance_response,
      attendanceConfirmedAt: stamped.attendance_confirmed_at,
      attendanceNote: stamped.attendance_note,
      updatedBy: stamped.updated_by,
      updatedAt: stamped.updated_at,
    })
    .where(eq(assignmentsTable.id, params.assignmentId));

  return { ok: true, matchId: assignment.match_id };
}
