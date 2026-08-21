import { describe, expect, it } from "vitest";

import {
  canConfirmAttendance,
  formatEncoderNumbers,
  normalizeEncoderNumber,
  normalizeEncoderNumberPair,
  roleTracksEncoderNumber,
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

describe("roleTracksEncoderNumber", () => {
  it("accepts the two on-site roles that see the encoder rack", () => {
    expect(roleTracksEncoderNumber("Responsable")).toBe(true);
    expect(roleTracksEncoderNumber("Soporte tecnico")).toBe(true);
  });

  it("is case and whitespace tolerant", () => {
    expect(roleTracksEncoderNumber("  soporte tecnico ")).toBe(true);
  });

  it("rejects every other role and empty values", () => {
    expect(roleTracksEncoderNumber("Realizador")).toBe(false);
    expect(roleTracksEncoderNumber("Encoder")).toBe(false);
    expect(roleTracksEncoderNumber(null)).toBe(false);
    expect(roleTracksEncoderNumber("")).toBe(false);
  });
});

describe("normalizeEncoderNumber", () => {
  it("accepts 1..9999 integers", () => {
    expect(normalizeEncoderNumber("12")).toBe(12);
    expect(normalizeEncoderNumber(" 9999 ")).toBe(9999);
    expect(normalizeEncoderNumber(7)).toBe(7);
  });

  it("rejects blanks, zero, decimals and junk", () => {
    expect(normalizeEncoderNumber("")).toBeNull();
    expect(normalizeEncoderNumber("   ")).toBeNull();
    expect(normalizeEncoderNumber("0")).toBeNull();
    expect(normalizeEncoderNumber("12.5")).toBeNull();
    expect(normalizeEncoderNumber("10000")).toBeNull();
    expect(normalizeEncoderNumber("-3")).toBeNull();
    expect(normalizeEncoderNumber("abc")).toBeNull();
    expect(normalizeEncoderNumber(null)).toBeNull();
  });
});

describe("normalizeEncoderNumberPair", () => {
  it("keeps both slots when both are valid", () => {
    expect(normalizeEncoderNumberPair("12", "34")).toEqual({
      encoderNumber1: 12,
      encoderNumber2: 34,
    });
  });

  it("collapses a lone second encoder into the first slot", () => {
    expect(normalizeEncoderNumberPair("", "34")).toEqual({
      encoderNumber1: 34,
      encoderNumber2: null,
    });
  });

  it("drops a duplicated second encoder", () => {
    expect(normalizeEncoderNumberPair("12", "12")).toEqual({
      encoderNumber1: 12,
      encoderNumber2: null,
    });
  });

  it("clears both slots when nothing usable was reported", () => {
    expect(normalizeEncoderNumberPair("", "")).toEqual({
      encoderNumber1: null,
      encoderNumber2: null,
    });
  });
});

describe("formatEncoderNumbers", () => {
  it("joins the reported numbers and skips the empty slot", () => {
    expect(formatEncoderNumbers(12, 34)).toBe("12 · 34");
    expect(formatEncoderNumbers(12, null)).toBe("12");
    expect(formatEncoderNumbers(null, null)).toBeNull();
  });
});
