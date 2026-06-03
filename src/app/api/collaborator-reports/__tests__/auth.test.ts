import { afterEach, describe, expect, it, vi } from "vitest";

import { getUserContext } from "@/lib/auth";
import { getCollaboratorMatchData } from "@/lib/data/collaborators";
import { makeGuestContext, makeUserContext } from "@/test/fixtures/user-context";

vi.mock("@/lib/auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");
  return { ...actual, getUserContext: vi.fn() };
});

vi.mock("@/lib/data/collaborators", () => ({
  getCollaboratorMatchData: vi.fn(),
  // Real route uses isUuidLike to reject demo-mode ids; uuid-shaped ids pass.
  isUuidLike: (value: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value),
}));

const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_M = "22222222-2222-4222-8222-222222222222";

const mockedGetUserContext = vi.mocked(getUserContext);
const mockedGetCollaboratorMatchData = vi.mocked(getCollaboratorMatchData);

function buildRequest(assignmentId = UUID_A, matchId = UUID_M) {
  return new Request(
    "https://portal.basket-app.test/api/collaborator-reports",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assignmentId,
        matchId,
        draft: {
          incidentLevel: "sin",
          paid: "no",
          feedDetected: "no",
          problems: {
            internet: false,
            img: false,
            ocr: false,
            overlays: false,
            grafica: false,
          },
          signalLabel: "BP",
          aptoLineal: "no",
          testTime: "",
          testCheck: "no",
          startCheck: "no",
          graphicsCheck: "no",
          speedtestValue: "",
          pingValue: "",
          gpuValue: "",
          technicalObservations: "",
          buildingObservations: "",
          generalObservations: "",
          otherObservation: "",
          stObservation: "",
          clubObservation: "",
          speedtestAttachmentName: null,
          pingAttachmentName: null,
          gpuAttachmentName: null,
        },
      }),
    },
  );
}

describe("api/collaborator-reports POST auth", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when there is no session (withAuth seam)", async () => {
    mockedGetUserContext.mockResolvedValue(makeGuestContext());
    const { POST } = await import("../route");

    const response = await POST(buildRequest());

    expect(response.status).toBe(401);
    expect(mockedGetCollaboratorMatchData).not.toHaveBeenCalled();
  });

  it("returns 403 when authenticated but without access to the match", async () => {
    mockedGetUserContext.mockResolvedValue(
      makeUserContext({ userId: "collab-1", role: "collaborator" }),
    );
    mockedGetCollaboratorMatchData.mockResolvedValue({
      // No matching assignment + trialAccess -> per-match 403.
      assignmentsForMatch: [],
      trialAccess: true,
    } as never);
    const { POST } = await import("../route");

    const response = await POST(buildRequest());

    expect(response.status).toBe(403);
  });
});
