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
  });
});
