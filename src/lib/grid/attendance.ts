export type AttendanceState = "attending" | "declined" | "pending" | null;

// Resolve the attendance color state for a staffed assignment slot. Empty slots
// (no person assigned) return null so the caller leaves them uncolored.
export function getAttendanceState(
  attendanceResponse: string | null,
  personId: string | null,
): AttendanceState {
  if (!personId) {
    return null;
  }

  if (attendanceResponse === "attending") {
    return "attending";
  }

  if (attendanceResponse === "declined") {
    return "declined";
  }

  return "pending";
}

const ATTENDANCE_TEXT_CLASS: Record<
  Exclude<AttendanceState, null>,
  string
> = {
  attending: "text-[#15803d]",
  declined: "text-[#dc2626]",
  pending: "text-[#b45309]",
};

// Tailwind text-color token for an attendance state. Empty string when there is
// nothing to color (null state) so it composes cleanly through cn(...).
export function getAttendanceTextClass(state: AttendanceState): string {
  return state ? ATTENDANCE_TEXT_CLASS[state] : "";
}
