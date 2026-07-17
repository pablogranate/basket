import { afterEach, describe, expect, it, vi } from "vitest";

import { recordAttendanceConfirmation } from "@/lib/data/attendance";
import { findLinkedPerson } from "@/lib/data/linked-person";
import { makeUserContext } from "@/test/fixtures/user-context";

vi.mock("@/lib/data/linked-person", () => ({
  findLinkedPerson: vi.fn(),
}));

// The loader now talks to the domain DB through Drizzle. Mock the client so the
// authorization/stamp logic is exercised without a real connection.
const h = vi.hoisted(() => ({
  state: {
    assignment: null as unknown,
    setSpy: vi.fn(),
  },
}));

vi.mock("@/lib/db/client", () => ({
  db: {
    select: () => ({
      from: () => ({
        leftJoin: () => ({
          where: () => ({
            limit: async () => (h.state.assignment ? [h.state.assignment] : []),
          }),
        }),
      }),
    }),
    update: () => ({
      set: (payload: unknown) => {
        h.state.setSpy(payload);
        return { where: async () => undefined };
      },
    }),
  },
}));

const mockedFindLinkedPerson = vi.mocked(findLinkedPerson);

const ASSIGNMENT_ID = "11111111-1111-4111-8111-111111111111";
const PERSON_ME = "22222222-2222-4222-8222-222222222222";
const PERSON_OTHER = "33333333-3333-4333-8333-333333333333";
const FUTURE_KICKOFF = "2099-01-01T19:30:00-05:00";
const PAST_KICKOFF = "2020-01-01T19:30:00-05:00";

function stubAssignment(assignment: unknown) {
  h.state.assignment = assignment;
  return { setSpy: h.state.setSpy };
}

function collaboratorCtx() {
  return makeUserContext({ role: "collaborator", profileId: "profile-collab" });
}

describe("recordAttendanceConfirmation", () => {
  afterEach(() => {
    vi.clearAllMocks();
    h.state.assignment = null;
  });

  it("rejects a caller with no linked person and writes nothing", async () => {
    mockedFindLinkedPerson.mockResolvedValue({ person: null, linkedBy: null });
    const { setSpy } = stubAssignment({
      id: ASSIGNMENT_ID,
      match_id: "match-1",
      person_id: PERSON_ME,
      match: { kickoff_at: FUTURE_KICKOFF, duration_minutes: 120 },
    });

    const result = await recordAttendanceConfirmation(collaboratorCtx(), {
      assignmentId: ASSIGNMENT_ID,
      response: "attending",
    });

    expect(result.ok).toBe(false);
    expect(setSpy).not.toHaveBeenCalled();
  });

  it("rejects when the caller is not the assigned person and writes nothing", async () => {
    mockedFindLinkedPerson.mockResolvedValue({
      person: { id: PERSON_ME, full_name: "Yo", email: null, phone: null, active: true },
      linkedBy: "email",
    });
    const { setSpy } = stubAssignment({
      id: ASSIGNMENT_ID,
      match_id: "match-1",
      person_id: PERSON_OTHER,
      match: { kickoff_at: FUTURE_KICKOFF, duration_minutes: 120 },
    });

    const result = await recordAttendanceConfirmation(collaboratorCtx(), {
      assignmentId: ASSIGNMENT_ID,
      response: "attending",
    });

    expect(result.ok).toBe(false);
    expect(setSpy).not.toHaveBeenCalled();
  });

  it("lets a collaborator owner confirm an upcoming match", async () => {
    mockedFindLinkedPerson.mockResolvedValue({
      person: { id: PERSON_ME, full_name: "Yo", email: null, phone: null, active: true },
      linkedBy: "email",
    });
    const { setSpy } = stubAssignment({
      id: ASSIGNMENT_ID,
      match_id: "match-1",
      person_id: PERSON_ME,
      match: { kickoff_at: FUTURE_KICKOFF, duration_minutes: 120 },
    });

    const result = await recordAttendanceConfirmation(collaboratorCtx(), {
      assignmentId: ASSIGNMENT_ID,
      response: "attending",
    });

    expect(result.ok).toBe(true);
    expect(setSpy).toHaveBeenCalledTimes(1);
    const payload = setSpy.mock.calls[0][0];
    expect(payload.attendanceConfirmedAt).not.toBeNull();
  });

  it("records a decline with its note and leaves attendance_confirmed_at null", async () => {
    mockedFindLinkedPerson.mockResolvedValue({
      person: { id: PERSON_ME, full_name: "Yo", email: null, phone: null, active: true },
      linkedBy: "email",
    });
    const { setSpy } = stubAssignment({
      id: ASSIGNMENT_ID,
      match_id: "match-1",
      person_id: PERSON_ME,
      match: { kickoff_at: FUTURE_KICKOFF, duration_minutes: 120 },
    });

    const result = await recordAttendanceConfirmation(collaboratorCtx(), {
      assignmentId: ASSIGNMENT_ID,
      response: "declined",
      note: "Estoy enfermo",
    });

    expect(result.ok).toBe(true);
    const payload = setSpy.mock.calls[0][0];
    expect(payload.attendanceResponse).toBe("declined");
    expect(payload.attendanceNote).toBe("Estoy enfermo");
    expect(payload.attendanceConfirmedAt).toBeNull();
  });

  it("rejects confirming a match that has already ended and writes nothing", async () => {
    mockedFindLinkedPerson.mockResolvedValue({
      person: { id: PERSON_ME, full_name: "Yo", email: null, phone: null, active: true },
      linkedBy: "email",
    });
    const { setSpy } = stubAssignment({
      id: ASSIGNMENT_ID,
      match_id: "match-1",
      person_id: PERSON_ME,
      match: { kickoff_at: PAST_KICKOFF, duration_minutes: 120 },
    });

    const result = await recordAttendanceConfirmation(collaboratorCtx(), {
      assignmentId: ASSIGNMENT_ID,
      response: "attending",
    });

    expect(result.ok).toBe(false);
    expect(setSpy).not.toHaveBeenCalled();
  });
});
