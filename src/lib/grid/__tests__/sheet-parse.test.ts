import { describe, expect, it } from "vitest";

import { parseTab, parseTabPeriod, resolveSyncTabs } from "@/lib/grid/sheet-parse";

const HEADER =
  "DÍA,LIGA,LOCAL,VISITANTE,HORA,PRODUCCIÓN,ID,RELATOS/COMENTARIOS,TRANSPORTE,OBSERVACIÓN," +
  "RESPONSABLE EN CANCHA,REALIZADOR,CÁMARA 1,RELATOR";

function csv(...rows: string[]) {
  return [HEADER, ...rows].join("\n");
}

describe("parseTab", () => {
  it("normalizes accented and uppercased headers", () => {
    const entries = parseTab(
      "Agosto 26",
      csv("Sábado 15,Liga A,Boca,River,20:00,Full,P1,Dúo,Combi,Nota,Pedro,Ana,Caro,Luis"),
    );

    expect(entries).toHaveLength(1);
    expect(entries[0].match).toMatchObject({
      competition: "Liga A",
      home_team: "Boca",
      away_team: "River",
      production_mode: "Full",
      production_code: "P1",
      commentary_plan: "Dúo",
      transport: "Combi",
      notes: "Nota\nCombi",
    });
    expect(entries[0].responsable).toBe("Pedro");
    expect(entries[0].assignments).toEqual([
      { roleName: "Responsable", personName: "Pedro" },
      { roleName: "Realizador", personName: "Ana" },
      { roleName: "Camara 1", personName: "Caro" },
      { roleName: "Relator", personName: "Luis" },
    ]);
  });

  it("carries the day marker forward until the next marker", () => {
    const entries = parseTab(
      "Agosto 26",
      csv(
        "Sábado 15,Liga A,Boca,River,20:00,,,,,,,,,",
        ",Liga A,Colón,Unión,18:00,,,,,,,,,",
        "Domingo 16,Liga A,Lanús,Banfield,17:00,,,,,,,,,",
        ",Liga A,Gimnasia,Estudiantes,21:30,,,,,,,,,",
      ),
    );

    const days = entries.map((entry) => new Date(entry.match.kickoff_at).toISOString());
    expect(days).toEqual([
      "2026-08-15T23:00:00.000Z",
      "2026-08-15T21:00:00.000Z",
      "2026-08-16T20:00:00.000Z",
      "2026-08-17T00:30:00.000Z",
    ]);
  });

  it("builds the kickoff instant in ART, padding single-digit hours", () => {
    const entries = parseTab("Agosto 26", csv("15,Liga A,Boca,River,9:30,,,,,,,,,"));
    expect(entries[0].match.kickoff_at).toBe("2026-08-15T12:30:00.000Z");
  });

  it("defaults an unparseable hora to midnight ART", () => {
    const entries = parseTab("Agosto 26", csv("15,Liga A,Boca,River,a confirmar,,,,,,,,,"));
    expect(entries[0].match.kickoff_at).toBe("2026-08-15T03:00:00.000Z");
  });

  it("skips spacer rows with a blank Local (ADR 0001)", () => {
    const entries = parseTab(
      "Agosto 26",
      csv("15,Liga A,,River,20:00,,,,,,,,,", ",Liga A,Boca,River,20:00,,,,,,,,,"),
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].match.home_team).toBe("Boca");
  });

  it("skips rows before any day marker appears", () => {
    const entries = parseTab("Agosto 26", csv(",Liga A,Boca,River,20:00,,,,,,,,,"));
    expect(entries).toHaveLength(0);
  });
});

describe("parseTabPeriod", () => {
  it("reads month and year from a tab name", () => {
    expect(parseTabPeriod("Septiembre 26")).toEqual({ month: 9, year: 2026 });
  });

  it("rejects an unparseable tab name", () => {
    expect(() => parseTabPeriod("Hoja 1")).toThrow('pestaña "Hoja 1"');
  });
});

describe("resolveSyncTabs", () => {
  it("lists every month tab the rolling window touches", () => {
    expect(resolveSyncTabs(new Date("2026-08-20T15:00:00.000Z"))).toEqual([
      "Agosto 26",
      "Septiembre 26",
    ]);
  });

  it("rolls over the year boundary", () => {
    expect(resolveSyncTabs(new Date("2026-12-20T15:00:00.000Z"))).toEqual([
      "Diciembre 26",
      "Enero 27",
    ]);
  });

  it("never reaches back before the format cutover (ADR 0003)", () => {
    expect(resolveSyncTabs(new Date("2026-06-29T15:00:00.000Z"))).toEqual(["Julio 26"]);
  });
});
