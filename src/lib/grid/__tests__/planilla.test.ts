import { describe, expect, it, vi } from "vitest";

import {
  columnOrderFromLabels,
  findTodayRowIndex,
  parseDateCell,
  parseTimeCell,
  PLANILLA_COLUMNS,
  readPlanillaCell,
  readPlanillaNewRow,
  resolveColumnOrder,
  type PlanillaEdit,
  type PlanillaLookups,
  type PlanillaRow,
} from "@/lib/grid/planilla";
import {
  createPlanillaSync,
  PLANILLA_BULK_LIMIT,
  type PlanillaServer,
  type PlanillaStatus,
} from "@/lib/grid/planilla-sync";

const ANA = "11111111-1111-4111-8111-111111111111";
const LUIS = "22222222-2222-4222-8222-222222222222";
const MATCH = "33333333-3333-4333-8333-333333333333";

const lookups: PlanillaLookups = {
  people: [
    { id: ANA, name: "Ana Pérez", functions: ["Realizador", "Camara"] },
    { id: LUIS, name: "Luis Gómez", functions: ["Relator"] },
  ],
  leagues: ["Liga Nacional", "Liga Argentina"],
  teams: ["Boca", "River", "Racing", "Quimsa", "Olímpico"],
  year: 2026,
};

function column(key: string) {
  const found = PLANILLA_COLUMNS.find((item) => item.key === key);
  if (!found) {
    throw new Error(key);
  }
  return found;
}

describe("parseDateCell", () => {
  it("reads day/month with the Planilla's year and full dates", () => {
    expect(parseDateCell("5/11", 2026)).toBe("2026-11-05");
    expect(parseDateCell("05/11/26", 2026)).toBe("2026-11-05");
    expect(parseDateCell("5-11-2027", 2026)).toBe("2027-11-05");
  });

  it("rejects impossible dates", () => {
    expect(parseDateCell("31/11/2026", 2026)).toBeNull();
    expect(parseDateCell("mañana", 2026)).toBeNull();
  });
});

describe("findTodayRowIndex", () => {
  const day = (dayKey: string): PlanillaRow => ({ ...savedRow, dayKey });

  it("opens on today, or on the next day with Partidos", () => {
    const rows = [day("2026-11-04"), day("2026-11-06"), day("2026-11-06"), day("2026-11-09")];
    expect(findTodayRowIndex(rows, "2026-11-06")).toBe(1);
    expect(findTodayRowIndex(rows, "2026-11-07")).toBe(3);
    expect(findTodayRowIndex(rows, "2026-11-10")).toBe(-1);
  });
});

describe("column order", () => {
  const keys = PLANILLA_COLUMNS.map((item) => item.key);

  it("keeps a stored order that is a full permutation of the columns", () => {
    const moved = [...keys.slice(1), keys[0]];
    expect(resolveColumnOrder(moved)).toEqual(moved);
  });

  it("falls back to the default order when the stored one is stale", () => {
    expect(resolveColumnOrder(null)).toEqual(keys);
    expect(resolveColumnOrder(keys.slice(1))).toEqual(keys);
    expect(resolveColumnOrder([...keys.slice(1), "borrada"])).toEqual(keys);
  });

  it("reads the order from the header labels", () => {
    const labels = PLANILLA_COLUMNS.map((item) => item.label).reverse();
    expect(columnOrderFromLabels(labels)).toEqual([...keys].reverse());
    expect(columnOrderFromLabels(["pegado", ...labels.slice(1)])).toBeNull();
  });
});

describe("parseTimeCell", () => {
  it("accepts the shorthand producers type", () => {
    expect(parseTimeCell("21")).toBe("21:00");
    expect(parseTimeCell("2130")).toBe("21:30");
    expect(parseTimeCell("9.05")).toBe("09:05");
  });

  it("rejects out-of-range times", () => {
    expect(parseTimeCell("25:00")).toBeNull();
  });
});

describe("readPlanillaCell", () => {
  it("resolves a person by name ignoring case and accents", () => {
    const result = readPlanillaCell(column("role:Realizador"), "ana perez", lookups);
    expect(result).toEqual({
      ok: true,
      display: "Ana Pérez",
      edit: { kind: "role", roleName: "Realizador", personId: ANA },
    });
  });

  it("rejects a person without the role's function", () => {
    const result = readPlanillaCell(column("role:Relator"), "Ana Pérez", lookups);
    expect(result.ok).toBe(false);
  });

  it("clears a role with an empty cell", () => {
    const result = readPlanillaCell(column("role:Relator"), "", lookups);
    expect(result).toMatchObject({ ok: true, edit: { personId: null } });
  });

  it("only takes known leagues and list options", () => {
    expect(readPlanillaCell(column("liga"), "liga nacional", lookups)).toMatchObject({
      ok: true,
      display: "Liga Nacional",
    });
    expect(readPlanillaCell(column("liga"), "Liga Inventada", lookups).ok).toBe(false);
    expect(readPlanillaCell(column("modo"), "encoder", lookups)).toMatchObject({
      ok: true,
      display: "Encoder",
    });
  });

  it("does not let Local go blank", () => {
    expect(readPlanillaCell(column("local"), " ", lookups).ok).toBe(false);
  });

  it("only takes teams from Equipos, written as the catalog spells them", () => {
    expect(readPlanillaCell(column("visitante"), "QUIMSA", lookups)).toMatchObject({
      ok: true,
      display: "Quimsa",
      edit: { kind: "field", field: "awayTeam", value: "Quimsa" },
    });
    expect(readPlanillaCell(column("local"), "Equipo Inventado", lookups).ok).toBe(false);
  });
});

describe("readPlanillaNewRow", () => {
  it("builds a Partido from a complete row", () => {
    const result = readPlanillaNewRow(
      {
        fecha: "12/11",
        hora: "21",
        liga: "Liga Nacional",
        local: "Boca",
        visitante: "River",
        "role:Realizador": "Ana Pérez",
      },
      lookups,
    );
    expect(result).toMatchObject({
      ok: true,
      match: {
        date: "2026-11-12",
        time: "21:00",
        competition: "Liga Nacional",
        homeTeam: "Boca",
        awayTeam: "River",
        staff: [{ roleName: "Realizador", personId: ANA }],
      },
    });
  });

  it("rejects a row whose team is not in Equipos", () => {
    const result = readPlanillaNewRow(
      { fecha: "12/11", hora: "21", local: "Boca", visitante: "Nadie FC" },
      lookups,
    );
    expect(result.ok).toBe(false);
  });

  it("rejects the row when any cell is invalid", () => {
    const result = readPlanillaNewRow(
      { fecha: "12/11", hora: "21", local: "Boca", visitante: "River", "role:Relator": "Nadie" },
      lookups,
    );
    expect(result.ok).toBe(false);
  });
});

// A grid of strings standing in for Univer.
function fakeSheet(initial: string[][]) {
  const cells = initial.map((row) => [...row]);
  return {
    cells,
    port: {
      readRows: () => cells.map((row) => [...row]),
      writeCell: (row: number, columnIndex: number, value: string) => {
        cells[row] ??= PLANILLA_COLUMNS.map(() => "");
        cells[row][columnIndex] = value;
      },
      clearAttendance: vi.fn(),
    },
  };
}

function rowCells(values: Record<string, string>) {
  return PLANILLA_COLUMNS.map((item) => values[item.key] ?? "");
}

const savedRow: PlanillaRow = {
  matchId: MATCH,
  values: rowCells({
    matchId: MATCH,
    fecha: "12/11/2026",
    hora: "21:00",
    local: "Boca",
    visitante: "River",
  }).reduce<Record<string, string>>((values, value, index) => {
    values[PLANILLA_COLUMNS[index].key] = value;
    return values;
  }, {}),
  attendance: {},
  dayKey: "2026-11-12",
  dayStart: false,
};

function setup(server: PlanillaServer, rows: PlanillaRow[] = [savedRow]) {
  const sheet = fakeSheet([
    ...rows.map((row) => PLANILLA_COLUMNS.map((item) => row.values[item.key] ?? "")),
    rowCells({}),
  ]);
  const statuses: PlanillaStatus[] = [];
  const sync = createPlanillaSync({
    port: sheet.port,
    server,
    rows,
    lookups,
    onStatus: (status) => statuses.push(status),
  });
  const indexOf = (key: string) => PLANILLA_COLUMNS.findIndex((item) => item.key === key);
  return { sheet, sync, statuses, indexOf };
}

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("createPlanillaSync", () => {
  it("saves a changed cell and normalizes what the user typed", async () => {
    const saveEdits = vi.fn(async (edits: PlanillaEdit[]) => edits.map(() => ({ ok: true as const })));
    const { sheet, sync, indexOf } = setup({ saveEdits, createMatch: vi.fn() });

    sheet.cells[0][indexOf("hora")] = "2130";
    sync.scan();
    await settle();

    expect(saveEdits).toHaveBeenCalledWith([
      { kind: "field", field: "kickoffTime", value: "21:30", matchId: MATCH },
    ]);
    expect(sheet.cells[0][indexOf("hora")]).toBe("21:30");

    sync.scan();
    await settle();
    expect(saveEdits).toHaveBeenCalledTimes(1);
  });

  it("puts back the saved value when the server rejects the cell", async () => {
    const saveEdits = vi.fn(async () => [{ ok: false as const, error: "No." }]);
    const { sheet, sync, statuses, indexOf } = setup({ saveEdits, createMatch: vi.fn() });

    sheet.cells[0][indexOf("local")] = "Racing";
    sync.scan();
    await settle();

    expect(sheet.cells[0][indexOf("local")]).toBe("Boca");
    expect(statuses.at(-1)?.issues[0].message).toContain("No.");
  });

  it("reverts an invalid cell without calling the server", async () => {
    const saveEdits = vi.fn();
    const { sheet, sync, indexOf } = setup({ saveEdits, createMatch: vi.fn() });

    sheet.cells[0][indexOf("role:Relator")] = "Ana Pérez";
    sync.scan();
    await settle();

    expect(saveEdits).not.toHaveBeenCalled();
    expect(sheet.cells[0][indexOf("role:Relator")]).toBe("");
  });

  it("creates a Partido from a completed blank row and stores its id", async () => {
    const NEW_ID = "44444444-4444-4444-8444-444444444444";
    const createMatch = vi.fn(async () => ({ ok: true as const, matchId: NEW_ID, newAssignments: 0 }));
    const { sheet, sync, indexOf } = setup({ saveEdits: vi.fn(), createMatch });

    sheet.cells[1] = rowCells({ fecha: "13/11", hora: "20", local: "Quimsa", visitante: "Olímpico" });
    sync.scan();
    await settle();

    expect(createMatch).toHaveBeenCalledTimes(1);
    expect(sheet.cells[1][indexOf("matchId")]).toBe(NEW_ID);

    sync.scan();
    await settle();
    expect(createMatch).toHaveBeenCalledTimes(1);
  });

  it("treats a pasted copy of an existing row as a new Partido", async () => {
    const createMatch = vi.fn(async () => ({ ok: false as const, error: "ID repetido" }));
    const { sheet, sync, indexOf } = setup({ saveEdits: vi.fn(), createMatch });

    sheet.cells[1] = [...sheet.cells[0]];
    sync.scan();
    await settle();

    expect(createMatch).toHaveBeenCalledTimes(1);
    expect(sheet.cells[1][indexOf("matchId")]).toBe("");

    sync.scan();
    await settle();
    expect(createMatch).toHaveBeenCalledTimes(1);
  });

  it("holds a change bigger than the bulk limit until the user decides", async () => {
    const rows = Array.from({ length: PLANILLA_BULK_LIMIT + 5 }, (_, index) => {
      const id = `55555555-5555-4555-8555-${String(index).padStart(12, "0")}`;
      return {
        ...savedRow,
        matchId: id,
        values: { ...savedRow.values, matchId: id, "role:Realizador": "Ana Pérez" },
      };
    });
    const saveEdits = vi.fn(async (edits: PlanillaEdit[]) => edits.map(() => ({ ok: true as const })));
    const { sheet, sync, statuses, indexOf } = setup({ saveEdits, createMatch: vi.fn() }, rows);

    rows.forEach((_, index) => {
      sheet.cells[index][indexOf("role:Realizador")] = "";
    });
    sync.scan();
    await settle();

    expect(saveEdits).not.toHaveBeenCalled();
    expect(statuses.at(-1)?.bulk).toEqual({ cells: rows.length, partidos: rows.length });

    sync.discardBulk();
    expect(sheet.cells.slice(0, rows.length).every((row) => row[indexOf("role:Realizador")] === "Ana Pérez")).toBe(true);

    rows.forEach((_, index) => {
      sheet.cells[index][indexOf("role:Realizador")] = "";
    });
    sync.scan();
    await settle();
    sync.confirmBulk();
    await settle();

    expect(saveEdits).toHaveBeenCalledTimes(1);
    expect(saveEdits.mock.calls[0][0]).toHaveLength(rows.length);
  });

  it("names the saved Partidos on the selected rows and skips blank ones", () => {
    const { sync } = setup({ saveEdits: vi.fn(), createMatch: vi.fn() });
    expect(sync.matchesOnRows([1, 0, 0])).toEqual([
      { row: 0, matchId: MATCH, label: "12/11/2026 21:00 · Boca vs River" },
    ]);
  });
});
