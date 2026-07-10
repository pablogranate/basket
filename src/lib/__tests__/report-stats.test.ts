import { describe, expect, it } from "vitest";

import {
  buildGridReportSummary,
  type ReportAssignmentRow,
  type ReportMatchRow,
} from "@/lib/grid/report-stats";

function assignment(overrides: Partial<ReportAssignmentRow> = {}) {
  return {
    personId: "p1",
    personName: "Ana García",
    roleName: "Camara 1",
    roleCategory: "Camaras",
    roleSortOrder: 120,
    ...overrides,
  } satisfies ReportAssignmentRow;
}

function match(
  id: string,
  assignments: ReportAssignmentRow[],
  overrides: Partial<Omit<ReportMatchRow, "id" | "assignments">> = {},
) {
  return {
    id,
    homeTeam: "Boca Juniors",
    awayTeam: "River Plate",
    productionMode: "DeporTV",
    assignments,
    ...overrides,
  } satisfies ReportMatchRow;
}

describe("buildGridReportSummary · funciones", () => {
  it("counts filled slots per role and subtotals per category", () => {
    const summary = buildGridReportSummary([
      match("m1", [
        assignment({ roleName: "Camara 1", roleSortOrder: 120 }),
        assignment({ personId: "p2", roleName: "Camara 2", roleSortOrder: 130 }),
        assignment({
          personId: "p3",
          roleName: "Encoder",
          roleCategory: "Transmision",
          roleSortOrder: 100,
        }),
      ]),
      match("m2", [assignment({ roleName: "Camara 1", roleSortOrder: 120 })]),
    ]);

    expect(summary.matchCount).toBe(2);
    expect(summary.funciones.total).toBe(4);
    expect(summary.funciones.categories).toEqual([
      {
        category: "Transmision",
        total: 1,
        roles: [{ name: "Encoder", count: 1 }],
      },
      {
        category: "Camaras",
        total: 3,
        roles: [
          { name: "Camara 1", count: 2 },
          { name: "Camara 2", count: 1 },
        ],
      },
    ]);
  });

  it("excludes slots without a person", () => {
    const summary = buildGridReportSummary([
      match("m1", [
        assignment(),
        assignment({ personId: null, personName: null, roleName: "Camara 2" }),
      ]),
    ]);

    expect(summary.funciones.total).toBe(1);
    expect(summary.funciones.categories).toEqual([
      {
        category: "Camaras",
        total: 1,
        roles: [{ name: "Camara 1", count: 1 }],
      },
    ]);
  });

  it("orders categories by the established order and roles by sort order", () => {
    const summary = buildGridReportSummary([
      match("m1", [
        assignment({ roleName: "Camara 3", roleSortOrder: 140 }),
        assignment({
          roleName: "Responsable",
          roleCategory: "Coordinacion",
          roleSortOrder: 10,
        }),
        assignment({
          roleName: "Relator",
          roleCategory: "Talento",
          roleSortOrder: 60,
        }),
      ]),
    ]);

    expect(
      summary.funciones.categories.map((category) => category.category),
    ).toEqual(["Coordinacion", "Talento", "Camaras"]);
  });

  it("places unknown categories after the established ones", () => {
    const summary = buildGridReportSummary([
      match("m1", [
        assignment({
          roleName: "Streaming",
          roleCategory: "Digital",
          roleSortOrder: 5,
        }),
        assignment({ roleName: "Camara 1" }),
      ]),
    ]);

    expect(
      summary.funciones.categories.map((category) => category.category),
    ).toEqual(["Camaras", "Digital"]);
  });

  it("returns an empty summary for an empty range", () => {
    const summary = buildGridReportSummary([]);

    expect(summary.matchCount).toBe(0);
    expect(summary.funciones).toEqual({ total: 0, categories: [] });
    expect(summary.personas).toEqual([]);
  });
});

describe("buildGridReportSummary · personas", () => {
  it("counts distinct matches, raw slots, and lists functions held", () => {
    const summary = buildGridReportSummary([
      match("m1", [
        assignment({ roleName: "Camara 1", roleSortOrder: 120 }),
        assignment({ roleName: "Camara 2", roleSortOrder: 130 }),
      ]),
      match("m2", [
        assignment({
          roleName: "Encoder",
          roleCategory: "Transmision",
          roleSortOrder: 100,
        }),
        assignment({
          personId: "p2",
          personName: "Bruno Díaz",
          roleName: "Camara 1",
          roleSortOrder: 120,
        }),
      ]),
    ]);

    expect(summary.personas).toEqual([
      {
        id: "p1",
        fullName: "Ana García",
        matchCount: 2,
        assignmentCount: 3,
        roles: ["Encoder", "Camara 1", "Camara 2"],
      },
      {
        id: "p2",
        fullName: "Bruno Díaz",
        matchCount: 1,
        assignmentCount: 1,
        roles: ["Camara 1"],
      },
    ]);
  });

  it("counts one match once for a person holding two roles in it", () => {
    const summary = buildGridReportSummary([
      match("m1", [
        assignment({ roleName: "Camara 1", roleSortOrder: 120 }),
        assignment({ roleName: "Camara 2", roleSortOrder: 130 }),
      ]),
    ]);

    expect(summary.personas).toEqual([
      {
        id: "p1",
        fullName: "Ana García",
        matchCount: 1,
        assignmentCount: 2,
        roles: ["Camara 1", "Camara 2"],
      },
    ]);
  });

  it("sorts by matches desc, then name", () => {
    const summary = buildGridReportSummary([
      match("m1", [
        assignment({ personId: "p2", personName: "Zulema Prado" }),
        assignment({ personId: "p3", personName: "Ana García", roleName: "Camara 2", roleSortOrder: 130 }),
      ]),
    ]);

    expect(summary.personas.map((person) => person.fullName)).toEqual([
      "Ana García",
      "Zulema Prado",
    ]);
  });

  it("ignores unfilled slots for personas", () => {
    const summary = buildGridReportSummary([
      match("m1", [assignment({ personId: null, personName: null })]),
    ]);

    expect(summary.personas).toEqual([]);
  });
});

describe("buildGridReportSummary · equipos", () => {
  it("splits local and visitante counts per team and sorts by total", () => {
    const summary = buildGridReportSummary([
      match("m1", [], { homeTeam: "Boca Juniors", awayTeam: "River Plate" }),
      match("m2", [], { homeTeam: "River Plate", awayTeam: "Boca Juniors" }),
      match("m3", [], { homeTeam: "Boca Juniors", awayTeam: "Atenas" }),
    ]);

    expect(summary.equipos).toEqual([
      { team: "Boca Juniors", local: 2, visitante: 1, total: 3 },
      { team: "River Plate", local: 1, visitante: 1, total: 2 },
      { team: "Atenas", local: 0, visitante: 1, total: 1 },
    ]);
  });

  it("gives a row to a team appearing only as visitante", () => {
    const summary = buildGridReportSummary([
      match("m1", [], { homeTeam: "Boca Juniors", awayTeam: "Quimsa" }),
    ]);

    expect(summary.equipos).toContainEqual({
      team: "Quimsa",
      local: 0,
      visitante: 1,
      total: 1,
    });
  });
});

describe("buildGridReportSummary · produccion", () => {
  it("counts matches per production mode and buckets null as Sin especificar", () => {
    const summary = buildGridReportSummary([
      match("m1", [], { productionMode: "DeporTV" }),
      match("m2", [], { productionMode: "DeporTV" }),
      match("m3", [], { productionMode: null }),
      match("m4", [], { productionMode: "  " }),
    ]);

    expect(summary.produccion).toEqual([
      { mode: "DeporTV", count: 2 },
      { mode: "Sin especificar", count: 2 },
    ]);
  });

  it("production counts sum to the match count", () => {
    const summary = buildGridReportSummary([
      match("m1", [], { productionMode: "DeporTV" }),
      match("m2", [], { productionMode: "Encoder" }),
      match("m3", [], { productionMode: null }),
    ]);

    const total = summary.produccion.reduce(
      (sum, entry) => sum + entry.count,
      0,
    );
    expect(total).toBe(summary.matchCount);
  });
});
