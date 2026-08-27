import { describe, expect, it } from "vitest";

import {
  getGridRedirectForCreatedMatch,
  parseCreateMatch,
  parseSetAttendanceConfirmation,
  parseUpdateMatch,
} from "@/lib/actions/parse/matches";

function form(entries: Record<string, string> = {}) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    formData.set(key, value);
  }
  return formData;
}

describe("parseCreateMatch", () => {
  it("parses the match fields and staff selections", () => {
    const result = parseCreateMatch(
      form({
        date: "2026-09-01",
        time: "19:30",
        timezone: "America/Bogota",
        productionCode: " P-123 ",
        competition: "Liga Nacional",
        productionMode: "estadio",
        status: "Confirmado",
        homeTeam: "  Boca  ",
        awayTeam: "Lanús",
        durationMinutes: "120",
        responsableId: "person-resp",
        camera1Id: "person-cam",
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.input.date).toBe("2026-09-01");
    expect(result.input.homeTeam).toBe("Boca");
    expect(result.input.awayTeam).toBe("Lanús");
    expect(result.input.productionCode).toBe("P-123");
    expect(result.input.durationMinutes).toBe(120);
    // ownerId mirrors the Responsable pick.
    expect(result.input.ownerId).toBe("person-resp");

    const byRole = new Map(
      result.input.staffSelections.map((s) => [s.roleName, s.personId]),
    );
    expect(byRole.get("Responsable")).toBe("person-resp");
    expect(byRole.get("Camara 1")).toBe("person-cam");
    expect(byRole.get("Relator")).toBeNull();
  });

  it("normalizes blanks, unknown statuses and defaults", () => {
    const result = parseCreateMatch(
      form({
        homeTeam: "Boca",
        awayTeam: "Lanús",
        status: "NoEsUnEstado",
        venue: "  ",
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.input.status).toBe("Pendiente");
    expect(result.input.venue).toBeNull();
    expect(result.input.productionCode).toBeNull();
    expect(result.input.durationMinutes).toBe(150);
    expect(result.input.ownerId).toBeNull();
  });
});

describe("parseUpdateMatch", () => {
  it("tracks which optional columns the form actually carried", () => {
    const withCode = parseUpdateMatch(
      form({
        matchId: "match-1",
        homeTeam: "Boca",
        awayTeam: "Lanús",
        productionCode: "",
      }),
    );

    expect(withCode.ok).toBe(true);
    if (!withCode.ok) return;
    expect(withCode.input.matchId).toBe("match-1");
    expect(withCode.input.hasProductionCode).toBe(true);
    expect(withCode.input.productionCode).toBeNull();
    expect(withCode.input.hasCommentaryPlan).toBe(false);
    expect(withCode.input.hasTransport).toBe(false);
  });

  it("keeps the values of present optional columns", () => {
    const result = parseUpdateMatch(
      form({
        matchId: "match-1",
        homeTeam: "Boca",
        awayTeam: "Lanús",
        commentaryPlan: "Relato completo",
        transport: " Combi ",
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.input.hasCommentaryPlan).toBe(true);
    expect(result.input.commentaryPlan).toBe("Relato completo");
    expect(result.input.hasTransport).toBe(true);
    expect(result.input.transport).toBe("Combi");
  });
});

describe("parseSetAttendanceConfirmation", () => {
  it("normalizes the response and captures encoder fields only when present", () => {
    const withEncoder = parseSetAttendanceConfirmation(
      form({
        assignmentId: "a-1",
        response: "attending",
        encoderNumber1: "12",
        encoderNumber2: "",
      }),
    );

    expect(withEncoder.ok).toBe(true);
    if (!withEncoder.ok) return;
    expect(withEncoder.input.response).toBe("attending");
    expect(withEncoder.input.encoder).toEqual({
      encoderNumber1: "12",
      encoderNumber2: "",
    });

    const withoutEncoder = parseSetAttendanceConfirmation(
      form({ assignmentId: "a-1", response: "otracosa" }),
    );

    expect(withoutEncoder.ok).toBe(true);
    if (!withoutEncoder.ok) return;
    expect(withoutEncoder.input.response).toBeNull();
    expect(withoutEncoder.input.encoder).toBeNull();
  });
});

describe("getGridRedirectForCreatedMatch", () => {
  it("builds a day-view grid URL and strips filters and notices", () => {
    const target = getGridRedirectForCreatedMatch({
      fallback: "/grid?view=month&q=boca&intent=success&notice=x",
      date: "2026-09-01",
      timezone: "America/Bogota",
    });

    const url = new URL(target, "http://localhost");
    expect(url.pathname).toBe("/grid");
    expect(url.searchParams.get("view")).toBe("day");
    expect(url.searchParams.get("date")).toBe("2026-09-01");
    expect(url.searchParams.get("timezone")).toBe("America/Bogota");
    expect(url.searchParams.get("q")).toBeNull();
    expect(url.searchParams.get("intent")).toBeNull();
    expect(url.searchParams.get("notice")).toBeNull();
  });
});
