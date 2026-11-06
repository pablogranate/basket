import {
  isPlanillaRowReadyToCreate,
  PLANILLA_COLUMNS,
  readPlanillaCell,
  readPlanillaNewRow,
  type PlanillaEdit,
  type PlanillaLookups,
  type PlanillaNewMatch,
  type PlanillaRow,
  type PlanillaValues,
} from "@/lib/grid/planilla";

// Keeps the Planilla and the database in step without knowing which
// spreadsheet draws it. After every change the sheet is read whole and diffed
// against what the database last accepted, so typing, pasting a block,
// fill-down and undo all arrive the same way. A rejected cell goes back to its
// saved value.

export type PlanillaSheetPort = {
  // Every row below the header, every column, as the user sees it.
  readRows(): string[][];
  writeCell(row: number, column: number, value: string): void;
  // A role cell changed person: its attendance color no longer applies.
  clearAttendance(row: number, column: number): void;
};

export type PlanillaSaveResult = { ok: true } | { ok: false; error: string };
export type PlanillaCreateResult =
  | { ok: true; matchId: string; newAssignments: number }
  | { ok: false; error: string };

export type PlanillaServer = {
  saveEdits(edits: PlanillaEdit[]): Promise<PlanillaSaveResult[]>;
  createMatch(match: PlanillaNewMatch): Promise<PlanillaCreateResult>;
};

export type PlanillaIssue = { id: number; message: string };

export type PlanillaStatus = {
  saving: boolean;
  savedAt: Date | null;
  saved: number;
  created: number;
  issues: PlanillaIssue[];
};

const PENDING_PREFIX = "nuevo:";
const MAX_ISSUES = 8;
const ID_COLUMN = 0;

function cellKey(matchId: string, columnKey: string) {
  return `${matchId}|${columnKey}`;
}

function toValues(cells: string[]): PlanillaValues {
  const values: PlanillaValues = {};
  PLANILLA_COLUMNS.forEach((column, index) => {
    if (column.kind !== "id") {
      values[column.key] = (cells[index] ?? "").trim();
    }
  });
  return values;
}

function matchLabel(values: PlanillaValues | undefined) {
  if (!values) {
    return "Partido";
  }
  return values.visitante ? `${values.local} vs ${values.visitante}` : values.local || "Partido";
}

export function createPlanillaSync(params: {
  port: PlanillaSheetPort;
  server: PlanillaServer;
  rows: PlanillaRow[];
  lookups: PlanillaLookups;
  onStatus: (status: PlanillaStatus) => void;
}) {
  const { port, server, lookups, onStatus } = params;
  const committed = new Map<string, PlanillaValues>(
    params.rows.map((row) => [row.matchId, { ...row.values }]),
  );
  const failedNewRows = new Set<string>();
  let busy = false;
  let issueId = 0;
  const status: PlanillaStatus = {
    saving: false,
    savedAt: null,
    saved: 0,
    created: 0,
    issues: [],
  };

  function emit() {
    onStatus({ ...status, issues: [...status.issues] });
  }

  function report(message: string) {
    issueId += 1;
    status.issues = [{ id: issueId, message }, ...status.issues].slice(0, MAX_ISSUES);
  }

  function findRow(rows: string[][], id: string) {
    return rows.findIndex((cells) => (cells[ID_COLUMN] ?? "").trim() === id);
  }

  function revert(matchId: string, columnKey: string) {
    const rows = port.readRows();
    const row = findRow(rows, matchId);
    const column = PLANILLA_COLUMNS.findIndex((item) => item.key === columnKey);
    if (row >= 0 && column >= 0) {
      port.writeCell(row, column, committed.get(matchId)?.[columnKey] ?? "");
    }
  }

  type PendingCell = { matchId: string; columnKey: string; display: string };
  type PendingCreate = { marker: string; signature: string; match: PlanillaNewMatch; display: PlanillaValues };

  function collect(): { edits: PlanillaEdit[]; cells: PendingCell[]; creates: PendingCreate[] } {
    const rows = port.readRows();
    const edits: PlanillaEdit[] = [];
    const cells: PendingCell[] = [];
    const creates: PendingCreate[] = [];
    const seen = new Set<string>();

    rows.forEach((rowCells, rowIndex) => {
      let id = (rowCells[ID_COLUMN] ?? "").trim();

      if (id.startsWith(PENDING_PREFIX)) {
        return;
      }

      // A copied row carries its Partido's id along: the second copy is a new
      // row, not a second view of the same Partido.
      if (id && (seen.has(id) || !committed.has(id))) {
        port.writeCell(rowIndex, ID_COLUMN, "");
        id = "";
      }

      if (id) {
        seen.add(id);
        const saved = committed.get(id)!;

        PLANILLA_COLUMNS.forEach((column, columnIndex) => {
          if (column.kind === "id") {
            return;
          }
          const current = (rowCells[columnIndex] ?? "").trim();
          const before = saved[column.key] ?? "";
          if (current === before) {
            return;
          }

          const result = readPlanillaCell(column, current, lookups);
          if (!result.ok) {
            report(`${matchLabel(saved)} · ${column.label}: ${result.error}`);
            port.writeCell(rowIndex, columnIndex, before);
            return;
          }
          if (result.display !== current) {
            port.writeCell(rowIndex, columnIndex, result.display);
          }
          if (result.display === before) {
            return;
          }
          edits.push({ ...result.edit, matchId: id });
          cells.push({ matchId: id, columnKey: column.key, display: result.display });
          if (column.kind === "role") {
            port.clearAttendance(rowIndex, columnIndex);
          }
        });
        return;
      }

      const values = toValues(rowCells);
      if (!isPlanillaRowReadyToCreate(values)) {
        return;
      }
      const signature = JSON.stringify(values);
      if (failedNewRows.has(signature)) {
        return;
      }
      const result = readPlanillaNewRow(values, lookups);
      if (!result.ok) {
        failedNewRows.add(signature);
        report(`Fila ${rowIndex + 2}: ${result.error}`);
        return;
      }
      const marker = `${PENDING_PREFIX}${crypto.randomUUID()}`;
      port.writeCell(rowIndex, ID_COLUMN, marker);
      creates.push({ marker, signature, match: result.match, display: result.display });
    });

    return { edits, cells, creates };
  }

  async function persist(work: ReturnType<typeof collect>) {
    if (work.edits.length) {
      let results: PlanillaSaveResult[];
      try {
        results = await server.saveEdits(work.edits);
      } catch {
        results = work.edits.map(() => ({ ok: false, error: "No se pudo guardar. Revisá la conexión." }));
      }

      work.cells.forEach((cell, index) => {
        const result = results[index] ?? { ok: false, error: "Sin respuesta del servidor." };
        const saved = committed.get(cell.matchId);
        if (result.ok && saved) {
          saved[cell.columnKey] = cell.display;
          status.saved += 1;
          return;
        }
        const column = PLANILLA_COLUMNS.find((item) => item.key === cell.columnKey);
        report(
          `${matchLabel(saved)} · ${column?.label ?? cell.columnKey}: ${
            result.ok ? "No se pudo guardar." : result.error
          }`,
        );
        revert(cell.matchId, cell.columnKey);
      });
    }

    for (const create of work.creates) {
      let result: PlanillaCreateResult;
      try {
        result = await server.createMatch(create.match);
      } catch {
        result = { ok: false, error: "No se pudo crear. Revisá la conexión." };
      }
      const rows = port.readRows();
      const row = findRow(rows, create.marker);

      if (result.ok) {
        committed.set(result.matchId, { ...create.display, matchId: result.matchId });
        if (row >= 0) {
          port.writeCell(row, ID_COLUMN, result.matchId);
        }
        status.created += 1;
        continue;
      }

      failedNewRows.add(create.signature);
      report(`${matchLabel(create.display)} (fila nueva): ${result.error}`);
      if (row >= 0) {
        port.writeCell(row, ID_COLUMN, "");
      }
    }
  }

  async function run() {
    const work = collect();
    if (!work.edits.length && !work.creates.length) {
      if (status.issues.length) {
        emit();
      }
      return;
    }

    busy = true;
    status.saving = true;
    emit();
    try {
      await persist(work);
    } finally {
      busy = false;
      status.saving = false;
      status.savedAt = new Date();
      emit();
    }
    // Whatever the user typed while the save was in flight.
    scan();
  }

  function scan() {
    // A scan during a save is dropped: the save rescans when it ends.
    if (!busy) {
      void run();
    }
  }

  return {
    scan,
    report(message: string) {
      report(message);
      emit();
    },
  };
}
