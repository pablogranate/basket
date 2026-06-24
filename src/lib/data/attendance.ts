import type { UserContext } from "@/lib/auth";
import { canConfirmAttendance } from "@/lib/attendance";
import { stampUpdate } from "@/lib/audit";
import { findLinkedPerson } from "@/lib/data/linked-person";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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

  const supabase = await createSupabaseServerClient();

  const assignmentResult = await supabase
    .from("assignments")
    .select(
      "id, match_id, person_id, match:matches!assignments_match_id_fkey(kickoff_at, duration_minutes)",
    )
    .eq("id", params.assignmentId)
    .maybeSingle();

  const assignment = assignmentResult.data as AssignmentForAttendance | null;

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
  // attending); declined/pending leave it NULL. attendance_note only persists
  // for a decline.
  const updateResult = await supabase
    .from("assignments")
    .update(
      stampUpdate(ctx, {
        attendance_response: params.response,
        attendance_confirmed_at:
          params.response === "attending" ? new Date().toISOString() : null,
        attendance_note:
          params.response === "declined" ? params.note?.trim() || null : null,
      }),
    )
    .eq("id", params.assignmentId);

  if (updateResult.error) {
    throw updateResult.error;
  }

  return { ok: true, matchId: assignment.match_id };
}
