import { describe, expect, it } from "vitest";

import {
  buildFacetCounts,
  buildGridReportSummary,
  buildPersonDetail,
  EMPTY_REPORT_FILTERS,
  filterMatches,
  type ReportAssignmentRow,
  type ReportFilters,
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
    kickoffAt: "2026-07-14T20:00:00.000Z",
    competition: "Liga Nacional",
    homeTeam: "Boca Juniors",
    awayTeam: "River Plate",
    productionMode: "DeporTV",
    assignments,
    ...overrides,
  } satisfies ReportMatchRow;
}

function filters(overrides: Partial<ReportFilters> = {}): ReportFilters {
  return { ...EMPTY_REPORT_FILTERS, ...overrides };
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

describe("buildPersonDetail", () => {
  it("lists every match the person filled a slot in, sorted by kickoff", () => {
    const detail = buildPersonDetail(
      [
        match("m2", [assignment({ personId: "p1", roleName: "Camara 1" })], {
          kickoffAt: "2026-07-15T20:00:00.000Z",
          homeTeam: "Boca",
          awayTeam: "River",
          productionMode: "DeporTV",
        }),
        match("m1", [assignment({ personId: "p1", roleName: "Camara 2" })], {
          kickoffAt: "2026-07-14T20:00:00.000Z",
        }),
        match("m3", [assignment({ personId: "p2", roleName: "Encoder" })], {
          kickoffAt: "2026-07-16T20:00:00.000Z",
        }),
      ],
      "p1",
    );

    expect(detail).not.toBeNull();
    expect(detail?.matchCount).toBe(2);
    expect(detail?.assignmentCount).toBe(2);
    expect(detail?.matches.map((entry) => entry.id)).toEqual(["m1", "m2"]);
  });

  it("collapses multiple roles in one match into a single ordered entry", () => {
    const detail = buildPersonDetail(
      [
        match("m1", [
          assignment({ personId: "p1", roleName: "Camara 2", roleSortOrder: 130 }),
          assignment({ personId: "p1", roleName: "Camara 1", roleSortOrder: 120 }),
        ]),
      ],
      "p1",
    );

    expect(detail?.matchCount).toBe(1);
    expect(detail?.assignmentCount).toBe(2);
    expect(detail?.matches[0].roles).toEqual(["Camara 1", "Camara 2"]);
  });

  it("returns null when the person has no counted assignments in range", () => {
    const detail = buildPersonDetail(
      [match("m1", [assignment({ personId: "p2" })])],
      "p1",
    );

    expect(detail).toBeNull();
  });

  it("ignores empty slots the person never filled", () => {
    const detail = buildPersonDetail(
      [
        match("m1", [
          assignment({ personId: "p1" }),
          assignment({ personId: null, personName: null }),
        ]),
      ],
      "p1",
    );

    expect(detail?.assignmentCount).toBe(1);
  });
});

describe("filterMatches", () => {
  const rows = [
    match("m1", [assignment({ roleCategory: "Camaras" })], {
      competition: "Liga Nacional",
      homeTeam: "Boca Juniors",
      awayTeam: "River Plate",
      productionMode: "DeporTV",
    }),
    match("m2", [assignment({ roleCategory: "Transmision" })], {
      competition: "Liga Argentina",
      homeTeam: "Atenas",
      awayTeam: "Quimsa",
      productionMode: "Streaming",
    }),
    match("m3", [assignment({ roleCategory: "Camaras" })], {
      competition: "Liga Nacional",
      homeTeam: "Quimsa",
      awayTeam: "Boca Juniors",
      productionMode: null,
    }),
  ];

  it("returns everything when no dimension is set", () => {
    expect(filterMatches(rows, filters()).map((m) => m.id)).toEqual([
      "m1",
      "m2",
      "m3",
    ]);
  });

  it("filters OR-within a dimension (liga)", () => {
    expect(
      filterMatches(rows, filters({ ligas: ["Liga Nacional"] })).map(
        (m) => m.id,
      ),
    ).toEqual(["m1", "m3"]);
  });

  it("matches teams by involvement (home OR away)", () => {
    expect(
      filterMatches(rows, filters({ teams: ["Boca Juniors"] })).map(
        (m) => m.id,
      ),
    ).toEqual(["m1", "m3"]);
  });

  it("buckets null/blank production mode as Sin especificar", () => {
    expect(
      filterMatches(rows, filters({ modes: ["Sin especificar"] })).map(
        (m) => m.id,
      ),
    ).toEqual(["m3"]);
  });

  it("intersects AND-across dimensions", () => {
    expect(
      filterMatches(
        rows,
        filters({ ligas: ["Liga Nacional"], teams: ["Quimsa"] }),
      ).map((m) => m.id),
    ).toEqual(["m3"]);
  });

  it("scopes by función role and narrows assignments (coherent world)", () => {
    const scoped = filterMatches(
      [
        match("m1", [
          assignment({ personId: "p1", roleName: "Camara 1", roleCategory: "Camaras" }),
          assignment({
            personId: "p2",
            roleName: "Encoder",
            roleCategory: "Transmision",
          }),
        ]),
        match("m2", [
          assignment({ personId: "p3", roleName: "Encoder", roleCategory: "Transmision" }),
        ]),
      ],
      filters({ roles: ["Camara 1"] }),
    );

    expect(scoped.map((m) => m.id)).toEqual(["m1"]);
    // m1 keeps only its Camara 1 slot; the Encoder slot is dropped.
    expect(scoped[0].assignments.map((a) => a.roleName)).toEqual([
      "Camara 1",
    ]);

    const summary = buildGridReportSummary(scoped);
    expect(summary.funciones.categories.map((c) => c.category)).toEqual([
      "Camaras",
    ]);
    expect(summary.personas.map((p) => p.id)).toEqual(["p1"]);
  });
});

describe("buildFacetCounts", () => {
  const rows = [
    match("m1", [assignment({ roleCategory: "Camaras" })], {
      competition: "Liga Nacional",
      homeTeam: "Boca Juniors",
      awayTeam: "River Plate",
      productionMode: "DeporTV",
    }),
    match("m2", [assignment({ roleCategory: "Transmision" })], {
      competition: "Liga Argentina",
      homeTeam: "Atenas",
      awayTeam: "Boca Juniors",
      productionMode: "DeporTV",
    }),
    match("m3", [assignment({ roleCategory: "Camaras" })], {
      competition: "Liga Nacional",
      homeTeam: "Quimsa",
      awayTeam: "River Plate",
      productionMode: "Streaming",
    }),
  ];

  it("counts each option against the full range when nothing is filtered", () => {
    const facets = buildFacetCounts(rows, filters());
    expect(facets.ligas).toEqual([
      { value: "Liga Nacional", count: 2 },
      { value: "Liga Argentina", count: 1 },
    ]);
    expect(
      facets.teams.find((option) => option.value === "Boca Juniors")?.count,
    ).toBe(2);
    expect(
      facets.teams.find((option) => option.value === "River Plate")?.count,
    ).toBe(2);
  });

  it("computes each option with its own dimension cleared but others applied", () => {
    // Filter to DeporTV: only m1 and m2 are in scope. The liga facet clears the
    // liga dimension but keeps the mode filter, so it counts within {m1, m2}.
    const facets = buildFacetCounts(rows, filters({ modes: ["DeporTV"] }));
    expect(facets.ligas).toEqual([
      { value: "Liga Nacional", count: 1 },
      { value: "Liga Argentina", count: 1 },
    ]);
    // The mode facet keeps its own dimension cleared: full range counts.
    expect(facets.modes).toEqual([
      { value: "DeporTV", count: 2 },
      { value: "Streaming", count: 1 },
    ]);
  });

  it("keeps zero-count options in the list so they can be dimmed", () => {
    const facets = buildFacetCounts(rows, filters({ teams: ["Atenas"] }));
    // Atenas only played in m2 (Liga Argentina), so Liga Nacional facets to 0
    // but stays present.
    const nacional = facets.ligas.find((o) => o.value === "Liga Nacional");
    expect(nacional).toEqual({ value: "Liga Nacional", count: 0 });
  });
});
