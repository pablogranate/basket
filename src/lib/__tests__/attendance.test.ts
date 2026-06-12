import { describe, expect, it } from "vitest";

import {
  canConfirmAttendance,
  shouldResetAttendance,
  summarizeAttendance,
} from "@/lib/attendance";

const PERSON_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PERSON_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const NOW = new Date("2026-06-12T15:00:00-05:00");

describe("canConfirmAttendance", () => {
  it("allows the assigned person to confirm a match that has not ended", () => {
    expect(
      canConfirmAttendance({
        assignmentPersonId: PERSON_A,
        callerPersonId: PERSON_A,
        kickoffAt: "2026-06-12T19:30:00-05:00",
        durationMinutes: 120,
        now: NOW,
      }),
    ).toBe(true);
  });

  it("rejects a caller who is not the assigned person", () => {
    expect(
      canConfirmAttendance({
        assignmentPersonId: PERSON_A,
        callerPersonId: PERSON_B,
        kickoffAt: "2026-06-12T19:30:00-05:00",
        durationMinutes: 120,
        now: NOW,
      }),
    ).toBe(false);
  });

  it("rejects when the caller has no linked person", () => {
    expect(
      canConfirmAttendance({
        assignmentPersonId: PERSON_A,
        callerPersonId: null,
        kickoffAt: "2026-06-12T19:30:00-05:00",
        durationMinutes: 120,
        now: NOW,
      }),
    ).toBe(false);
  });

  it("rejects a match that has already ended", () => {
    expect(
      canConfirmAttendance({
        assignmentPersonId: PERSON_A,
        callerPersonId: PERSON_A,
        kickoffAt: "2026-06-11T19:30:00-05:00",
        durationMinutes: 120,
        now: NOW,
      }),
    ).toBe(false);
  });
});

describe("shouldResetAttendance", () => {
  it("resets when the assigned person changes", () => {
    expect(shouldResetAttendance(PERSON_A, PERSON_B)).toBe(true);
  });

  it("keeps attendance when the assigned person is unchanged", () => {
    expect(shouldResetAttendance(PERSON_A, PERSON_A)).toBe(false);
  });

  it("does not reset when an empty slot stays empty", () => {
    expect(shouldResetAttendance(null, null)).toBe(false);
  });
});

describe("summarizeAttendance", () => {
  it("counts confirmed against staffed assignments, ignoring empty slots", () => {
    const summary = summarizeAttendance([
      { person_id: PERSON_A, attendance_confirmed_at: "2026-06-11T10:00:00Z" },
      { person_id: PERSON_B, attendance_confirmed_at: null },
      { person_id: null, attendance_confirmed_at: null },
    ]);

    expect(summary).toEqual({ confirmed: 1, total: 2 });
  });

  it("returns zeroes for an empty roster", () => {
    expect(summarizeAttendance([])).toEqual({ confirmed: 0, total: 0 });
  });
});
