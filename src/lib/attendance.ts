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

// Encoder number reporting (roles that stand next to the rack). Only
// "Responsable de cancha" (role `Responsable`) and `Soporte tecnico` are asked
// for it; every other role never sees the field and cannot write it.
export const ENCODER_NUMBER_ROLE_NAMES = ["Responsable", "Soporte tecnico"] as const;

export function roleTracksEncoderNumber(roleName: string | null | undefined): boolean {
  if (!roleName) {
    return false;
  }

  const normalized = roleName.trim().toLowerCase();

  return ENCODER_NUMBER_ROLE_NAMES.some(
    (name) => name.toLowerCase() === normalized,
  );
}

// Matches the 0031 CHECK constraint: 1..9999, integers only. Anything else
// (blank, zero, decimals, junk) degrades to null instead of throwing.
export function normalizeEncoderNumber(value: unknown): number | null {
  const raw = typeof value === "number" ? String(value) : String(value ?? "").trim();

  if (!/^\d{1,4}$/.test(raw)) {
    return null;
  }

  const parsed = Number(raw);

  return parsed >= 1 && parsed <= 9999 ? parsed : null;
}

// A pair of slots where the second is only meaningful with a first: a lone
// second encoder collapses into slot 1, and duplicates drop the repeat.
export function normalizeEncoderNumberPair(
  first: unknown,
  second: unknown,
): { encoderNumber1: number | null; encoderNumber2: number | null } {
  const one = normalizeEncoderNumber(first);
  const two = normalizeEncoderNumber(second);

  if (one === null) {
    return { encoderNumber1: two, encoderNumber2: null };
  }

  return { encoderNumber1: one, encoderNumber2: two === one ? null : two };
}

export function formatEncoderNumbers(
  first: number | null | undefined,
  second: number | null | undefined,
): string | null {
  const numbers = [first, second].filter(
    (value): value is number => typeof value === "number",
  );

  return numbers.length ? numbers.join(" · ") : null;
}
