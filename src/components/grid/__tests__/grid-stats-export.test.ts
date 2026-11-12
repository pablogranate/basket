import { describe, expect, it } from "vitest";

import {
  buildSheetName,
  buildStatsExportTables,
  buildStatsFileBaseName,
} from "@/components/grid/grid-stats-export";
import type { StatsExportSelection } from "@/components/grid/grid-stats-export";
import { buildGridReportSummary } from "@/lib/grid/report-stats";
import type { ReportMatchRow } from "@/lib/grid/report-stats";

const TIMEZONE = "America/Argentina/Buenos_Aires";

const MATCHES: ReportMatchRow[] = [
  {
    id: "m1",
    kickoffAt: "2026-10-02T22:00:00.000Z",
    competition: "Liga Nacional",
    homeTeam: "Boca",
    awayTeam: "River",
    productionMode: null,
    status: "Realizado",
    assignments: [
      {
        personId: "p1",
        personName: "Ana García",
        roleName: "Camara 1",
        roleCategory: "Camaras",
        roleSortOrder: 120,
      },
      {
        personId: "p2",
        personName: "Beto Paz",
        roleName: "Relator",
        roleCategory: "Talento",
        roleSortOrder: 60,
      },
    ],
  },
  {
    id: "m2",
    kickoffAt: "2026-10-03T22:00:00.000Z",
    competition: null,
    homeTeam: "Quimsa",
    awayTeam: "Instituto",
    productionMode: "Completa",
    status: "Confirmado",
    assignments: [
      {
        personId: "p1",
        personName: "Ana García",
        roleName: "Camara 2",
        roleCategory: "Camaras",
        roleSortOrder: 130,
      },
    ],
  },
];

function tables(selection: Partial<StatsExportSelection>) {
  return buildStatsExportTables({
    selection: {
      resumen: false,
      resumenScope: "current",
      ficha: false,
      planilla: false,
      ...selection,
    },
    summary: buildGridReportSummary(MATCHES),
    activeTab: "personas",
    matches: MATCHES,
    timezone: TIMEZONE,
  });
}

describe("buildStatsExportTables", () => {
  it("orders the blocks Resumen, Ficha, Planilla", () => {
    const labels = tables({
      resumen: true,
      resumenScope: "all",
      ficha: true,
      planilla: true,
    }).map((table) => table.tabLabel);

    expect(labels).toEqual([
      "Personas",
      "Equipos",
      "Producción",
      "Funciones",
      "Ficha por persona",
      "Planilla por partido",
    ]);
  });

  it("limits the Resumen to the active tab by default", () => {
    expect(tables({ resumen: true }).map((table) => table.tabLabel)).toEqual([
      "Personas",
    ]);
  });

  it("heads each person's matches in the Ficha with a group row", () => {
    const [ficha] = tables({ ficha: true });

    expect(ficha.rowKinds).toEqual(["group", "data", "data", "group", "data"]);
    expect(ficha.rows[0].slice(0, 2)).toEqual([
      "Ana García",
      "2 partidos · 2 asignaciones",
    ]);
    expect(ficha.rows[2].slice(1)).toEqual([
      "Sin especificar",
      "Quimsa",
      "Instituto",
      "Completa",
      "Confirmado",
      "Camara 2",
    ]);
  });

  it("gives the Planilla one column per filled role, in role order", () => {
    const [planilla] = tables({ planilla: true });

    expect(planilla.headers.slice(6)).toEqual(["Relator", "Camara 1", "Camara 2"]);
    expect(planilla.rows[0].slice(6)).toEqual(["Beto Paz", "Ana García", ""]);
    expect(planilla.rows[1].slice(6)).toEqual(["", "", "Ana García"]);
  });
});

describe("buildStatsFileBaseName", () => {
  it("names a single table after it and a bundle by range only", () => {
    const single = tables({ ficha: true });
    const bundle = tables({ resumen: true, ficha: true });

    expect(
      buildStatsFileBaseName({ tables: single, from: "2026-10-01", to: "2026-10-31" }),
    ).toBe("estadisticas-ficha-por-persona-2026-10-01-2026-10-31");
    expect(
      buildStatsFileBaseName({ tables: bundle, from: "2026-10-01", to: "2026-10-31" }),
    ).toBe("estadisticas-2026-10-01-2026-10-31");
  });
});

describe("buildSheetName", () => {
  it("strips forbidden characters, caps at 31 and keeps names unique", () => {
    const used = new Set<string>();
    const long = "Detalle · Ana María de los Ángeles [Prensa]";

    const first = buildSheetName(long, used);
    const second = buildSheetName(long, used);

    expect(first).toHaveLength(31);
    expect(first).not.toMatch(/[[\]]/);
    expect(second).not.toBe(first);
    expect(second.endsWith(" (2)")).toBe(true);
    expect(second.length).toBeLessThanOrEqual(31);
  });
});
