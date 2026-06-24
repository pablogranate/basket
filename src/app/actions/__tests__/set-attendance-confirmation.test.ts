import { afterEach, describe, expect, it, vi } from "vitest";

import { recordAttendanceConfirmation } from "@/lib/data/attendance";
import { findLinkedPerson } from "@/lib/data/linked-person";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { makeUserContext } from "@/test/fixtures/user-context";

vi.mock("@/lib/data/linked-person", () => ({
  findLinkedPerson: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));

const mockedFindLinkedPerson = vi.mocked(findLinkedPerson);
const mockedCreateClient = vi.mocked(createSupabaseServerClient);

const ASSIGNMENT_ID = "11111111-1111-4111-8111-111111111111";
const PERSON_ME = "22222222-2222-4222-8222-222222222222";
const PERSON_OTHER = "33333333-3333-4333-8333-333333333333";
const FUTURE_KICKOFF = "2099-01-01T19:30:00-05:00";
const PAST_KICKOFF = "2020-01-01T19:30:00-05:00";

function stubClient(assignment: unknown) {
  const updateSpy = vi.fn(
    (_payload: {
      attendance_confirmed_at: string | null;
      attendance_response: string | null;
      attendance_note: string | null;
    }) => ({
      eq: () => Promise.resolve({ error: null }),
    }),
  );

  const client = {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: assignment, error: null }),
        }),
      }),
      update: updateSpy,
    }),
  };

  mockedCreateClient.mockResolvedValue(client as never);
  return { updateSpy };
}

function collaboratorCtx() {
  return makeUserContext({ role: "collaborator", profileId: "profile-collab" });
}

describe("recordAttendanceConfirmation", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("rejects a caller with no linked person and writes nothing", async () => {
    mockedFindLinkedPerson.mockResolvedValue({ person: null, linkedBy: null });
    const { updateSpy } = stubClient({
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
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("rejects when the caller is not the assigned person and writes nothing", async () => {
    mockedFindLinkedPerson.mockResolvedValue({
      person: { id: PERSON_ME, full_name: "Yo", email: null, phone: null, active: true },
      linkedBy: "email",
    });
    const { updateSpy } = stubClient({
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
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("lets a collaborator owner confirm an upcoming match", async () => {
    mockedFindLinkedPerson.mockResolvedValue({
      person: { id: PERSON_ME, full_name: "Yo", email: null, phone: null, active: true },
      linkedBy: "email",
    });
    const { updateSpy } = stubClient({
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
    expect(updateSpy).toHaveBeenCalledTimes(1);
    const payload = updateSpy.mock.calls[0][0];
    expect(payload.attendance_confirmed_at).not.toBeNull();
  });

  it("records a decline with its note and leaves attendance_confirmed_at null", async () => {
    mockedFindLinkedPerson.mockResolvedValue({
      person: { id: PERSON_ME, full_name: "Yo", email: null, phone: null, active: true },
      linkedBy: "email",
    });
    const { updateSpy } = stubClient({
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
    const payload = updateSpy.mock.calls[0][0];
    expect(payload.attendance_response).toBe("declined");
    expect(payload.attendance_note).toBe("Estoy enfermo");
    expect(payload.attendance_confirmed_at).toBeNull();
  });

  it("rejects confirming a match that has already ended and writes nothing", async () => {
    mockedFindLinkedPerson.mockResolvedValue({
      person: { id: PERSON_ME, full_name: "Yo", email: null, phone: null, active: true },
      linkedBy: "email",
    });
    const { updateSpy } = stubClient({
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
    expect(updateSpy).not.toHaveBeenCalled();
  });
});
