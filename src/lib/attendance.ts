import { getMatchEndIso } from "@/lib/date";

export function canConfirmAttendance(params: {
  assignmentPersonId: string | null;
  callerPersonId: string | null;
  kickoffAt: string;
  durationMinutes: number;
  now: Date;
}): boolean {
  if (!params.callerPersonId || params.assignmentPersonId !== params.callerPersonId) {
    return false;
  }

  const end = new Date(getMatchEndIso(params.kickoffAt, params.durationMinutes));

  return end >= params.now;
}

export function shouldResetAttendance(
  prevPersonId: string | null,
  nextPersonId: string | null,
): boolean {
  return prevPersonId !== nextPersonId;
}

export function summarizeAttendance(
  items: Array<{
    person_id: string | null;
    attendance_confirmed_at: string | null;
  }>,
): { confirmed: number; total: number } {
  const staffed = items.filter((item) => item.person_id !== null);

  return {
    confirmed: staffed.filter((item) => item.attendance_confirmed_at !== null)
      .length,
    total: staffed.length,
  };
}
