import { eq } from "drizzle-orm";

import type { UserContext } from "@/lib/auth";
import {
  canConfirmAttendance,
  normalizeEncoderNumberPair,
  roleTracksEncoderNumber,
} from "@/lib/attendance";
import { stampUpdate } from "@/lib/audit";
import { findLinkedPerson } from "@/lib/data/linked-person";
import { db } from "@/lib/db/client";
import {
  assignments as assignmentsTable,
  matches as matchesTable,
  roles as rolesTable,
} from "@/lib/db/schema";

export type AttendanceResponse = "attending" | "declined";

export type AttendanceOutcome =
  | { ok: true; matchId: string }
  | { ok: false; reason: "not-linked" | "not-found" | "forbidden" };

type AssignmentForAttendance = {
  id: string;
  match_id: string;
  person_id: string | null;
  role_name: string | null;
  match: { kickoff_at: string; duration_minutes: number } | null;
};

// Shared ownership + window gate for every self-service write on an assignment
// (attendance response, encoder numbers). Resolves the caller's linked person,
// then re-checks that the assignment is theirs and the match has not ended.
async function loadOwnedAssignment(
  ctx: UserContext,
  assignmentId: string,
): Promise<
  | { ok: true; assignment: AssignmentForAttendance }
  | { ok: false; reason: "not-linked" | "not-found" | "forbidden" }
> {
  const { person } = await findLinkedPerson({
    profileId: ctx.profileId,
    email: ctx.email,
  });

  if (!person) {
    return { ok: false, reason: "not-linked" };
  }

  const assignmentRows = await db
    .select({
      id: assignmentsTable.id,
      match_id: assignmentsTable.matchId,
      person_id: assignmentsTable.personId,
      role_name: rolesTable.name,
      match: {
        kickoff_at: matchesTable.kickoffAt,
        duration_minutes: matchesTable.durationMinutes,
      },
    })
    .from(assignmentsTable)
    .leftJoin(matchesTable, eq(assignmentsTable.matchId, matchesTable.id))
    .leftJoin(rolesTable, eq(assignmentsTable.roleId, rolesTable.id))
    .where(eq(assignmentsTable.id, assignmentId))
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

  return { ok: true, assignment };
}

// Confirming attendance is deliberately NOT audited (PRD #7): no writeAudit call,
// so toggles never appear in the match history timeline.
export async function recordAttendanceConfirmation(
  ctx: UserContext,
  params: {
    assignmentId: string;
    response: AttendanceResponse | null;
    note?: string | null;
    encoderNumber1?: unknown;
    encoderNumber2?: unknown;
  },
): Promise<AttendanceOutcome> {
  const owned = await loadOwnedAssignment(ctx, params.assignmentId);

  if (!owned.ok) {
    return owned;
  }

  const { assignment } = owned;

  // Encoder numbers ride along with the confirmation for the two roles that
  // report them; any other role's payload is ignored outright. Callers that omit
  // the fields entirely leave whatever was already reported untouched.
  const encoderSubmitted =
    params.encoderNumber1 !== undefined || params.encoderNumber2 !== undefined;
  const tracksEncoder =
    encoderSubmitted && roleTracksEncoderNumber(assignment.role_name);
  const encoder = tracksEncoder
    ? normalizeEncoderNumberPair(params.encoderNumber1, params.encoderNumber2)
    : { encoderNumber1: null, encoderNumber2: null };

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
      ...(tracksEncoder
        ? {
            encoderNumber1: encoder.encoderNumber1,
            encoderNumber2: encoder.encoderNumber2,
          }
        : {}),
      updatedBy: stamped.updated_by,
      updatedAt: stamped.updated_at,
    })
    .where(eq(assignmentsTable.id, params.assignmentId));

  return { ok: true, matchId: assignment.match_id };
}

// Encoder numbers alone, so the person can add or correct them after they have
// already accepted the match. Same ownership + window gate; not audited, like
// the attendance columns.
export async function recordEncoderNumbers(
  ctx: UserContext,
  params: {
    assignmentId: string;
    encoderNumber1: unknown;
    encoderNumber2: unknown;
  },
): Promise<AttendanceOutcome> {
  const owned = await loadOwnedAssignment(ctx, params.assignmentId);

  if (!owned.ok) {
    return owned;
  }

  const { assignment } = owned;

  if (!roleTracksEncoderNumber(assignment.role_name)) {
    return { ok: false, reason: "forbidden" };
  }

  const encoder = normalizeEncoderNumberPair(
    params.encoderNumber1,
    params.encoderNumber2,
  );

  const stamped = stampUpdate(ctx, {});

  await db
    .update(assignmentsTable)
    .set({
      encoderNumber1: encoder.encoderNumber1,
      encoderNumber2: encoder.encoderNumber2,
      updatedBy: stamped.updated_by,
      updatedAt: stamped.updated_at,
    })
    .where(eq(assignmentsTable.id, params.assignmentId));

  return { ok: true, matchId: assignment.match_id };
}
