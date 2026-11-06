"use client";

import { useEffect, useRef } from "react";
import { UniverSheetsCorePreset } from "@univerjs/preset-sheets-core";
import sheetsCoreEsES from "@univerjs/preset-sheets-core/locales/es-ES";
import { UniverSheetsDataValidationPreset } from "@univerjs/preset-sheets-data-validation";
import dataValidationEsES from "@univerjs/preset-sheets-data-validation/locales/es-ES";
import {
  createUniver,
  IUndoRedoService,
  LocaleType,
  mergeLocales,
} from "@univerjs/presets";
import "@univerjs/preset-sheets-core/lib/index.css";
import "@univerjs/preset-sheets-data-validation/lib/index.css";

import {
  createPlanillaMatchAction,
  deletePlanillaMatchesAction,
  savePlanillaEditsAction,
} from "@/app/actions/grid-planilla";
import {
  columnOrderFromLabels,
  findTodayRowIndex,
  peopleForRole,
  PLANILLA_COLUMNS,
  PLANILLA_FROZEN_COLUMNS,
  type PlanillaPerson,
  type PlanillaRow,
  resolveColumnOrder,
} from "@/lib/grid/planilla";
import {
  createPlanillaSync,
  type PlanillaRowMatch,
  type PlanillaStatus,
} from "@/lib/grid/planilla-sync";
import type { AttendanceState } from "@/lib/grid/attendance";
import { getGridLeagueColor } from "@/lib/league-grid-colors";

type GridPlanillaSheetProps = {
  rows: PlanillaRow[];
  people: PlanillaPerson[];
  leagues: string[];
  teams: string[];
  canEdit: boolean;
  year: number;
  timezone: string;
  todayKey: string;
  // localStorage key for this user's column order.
  columnOrderKey: string;
  onStatus: (status: PlanillaStatus) => void;
  onControls: (controls: PlanillaControls) => void;
  onDeleteRequest: (matches: PlanillaRowMatch[]) => void;
  onColumnsCustomized: (customized: boolean) => void;
  // The saved Partido under the cursor, or null on a blank or new row.
  onActiveMatch: (match: PlanillaRowMatch | null) => void;
};

// What could not be deleted, and why. Empty when every Partido went.
export type PlanillaDeleteOutcome = {
  failed: { match: PlanillaRowMatch; error: string }[];
  error?: string;
};

export type PlanillaControls = {
  confirmBulk: () => void;
  discardBulk: () => void;
  deleteMatches: (matches: PlanillaRowMatch[]) => Promise<PlanillaDeleteOutcome>;
};

// Blank rows under the month's Partidos: where new Partidos are typed.
const BLANK_ROWS = 40;
const SHEET_ID = "planilla";

// Columns map to fields: they can be reordered, never added or removed, and
// cells never shift between them.
const BLOCKED_COMMAND =
  /^sheet\.command\.(remove-col|insert-col|insert-multi-cols|delete-range-move|insert-range-move)/;

// What deletes a Partido: removing its row, or clearing whole rows (Delete,
// or right click > Borrar > Borrar todo with the rows selected).
const REMOVE_ROW_COMMANDS = new Set(["sheet.command.remove-row", "sheet.command.remove-row-by-range"]);
const CLEAR_COMMANDS = new Set([
  "sheet.command.clear-selection-content",
  "sheet.command.clear-selection-all",
]);
const MOVE_COLUMNS_MUTATION = "sheet.mutation.move-columns";
const ROW_RANGE = 1;

function readStoredOrder(key: string): string[] {
  try {
    const raw = window.localStorage.getItem(key);
    return resolveColumnOrder(raw ? JSON.parse(raw) : null);
  } catch {
    return resolveColumnOrder(null);
  }
}

function storeOrder(key: string, order: string[]) {
  try {
    window.localStorage.setItem(key, JSON.stringify(order));
  } catch {
    // Private mode: the order lasts until the page reloads.
  }
}

const DEFAULT_ORDER = PLANILLA_COLUMNS.map((column) => column.key);
const COLUMN_BY_KEY = new Map(PLANILLA_COLUMNS.map((column) => [column.key, column]));

// physicalOf[i] is where PLANILLA_COLUMNS[i] sits in the sheet.
function toPhysical(order: string[]) {
  return PLANILLA_COLUMNS.map((column) => order.indexOf(column.key));
}

type Palette = {
  foreground: string;
  muted: string;
  header: string;
  surface: string;
  divider: string;
  border: string;
  ok: string;
  warn: string;
  accent: string;
};

// Canvas cells can't read CSS variables, so the shared tokens are resolved once.
function readPalette(): Palette {
  const styles = getComputedStyle(document.documentElement);
  const token = (name: string) => styles.getPropertyValue(name).trim();
  return {
    foreground: token("--foreground"),
    muted: token("--muted"),
    header: token("--n-100"),
    surface: token("--surface"),
    divider: token("--n-700"),
    border: token("--border"),
    ok: token("--ok"),
    warn: token("--warn"),
    accent: token("--accent"),
  };
}

const TEXT_FORMAT = { n: { pattern: "@" } };
const CLIP = 2;
const WRAP = 3;
const MIDDLE = 2;
const THICK_BORDER = 13;
const LIGA_COLUMN = PLANILLA_COLUMNS.findIndex((column) => column.key === "liga");
const ID_COLUMN = PLANILLA_COLUMNS.findIndex((column) => column.kind === "id");

type CellLook = {
  attendance: AttendanceState;
  dayStart: boolean;
  league: string | null;
};

// Cells share style ids so a month of Partidos keeps a handful of style
// objects instead of one per cell.
function createStyles(palette: Palette) {
  const attendanceColor: Record<string, string> = {
    none: palette.foreground,
    attending: palette.ok,
    pending: palette.warn,
    declined: palette.accent,
  };
  const styles: Record<string, object> = {
    head: {
      ...TEXT_FORMAT,
      bl: 1,
      fs: 10,
      bg: { rgb: palette.header },
      cl: { rgb: palette.muted },
      vt: MIDDLE,
    },
    // The hidden id column must not wrap, or its uuid sets every row's height.
    id: { ...TEXT_FORMAT, fs: 10, tb: CLIP },
  };

  function idFor({ attendance, dayStart, league }: CellLook) {
    const state = attendance ?? "none";
    const leagueColor = getGridLeagueColor(league);
    const id = `${dayStart ? "d" : "r"}-${state}-${leagueColor?.background ?? ""}`;
    styles[id] ??= {
      ...TEXT_FORMAT,
      fs: 10,
      tb: WRAP,
      vt: MIDDLE,
      cl: { rgb: leagueColor?.text ?? attendanceColor[state] },
      bl: state === "none" && !leagueColor ? 0 : 1,
      ...(leagueColor ? { bg: { rgb: leagueColor.background } } : {}),
      ...(dayStart ? { bd: { t: { s: THICK_BORDER, cl: { rgb: palette.divider } } } } : {}),
    };
    return id;
  }

  return { styles, idFor };
}

function buildWorkbook(rows: PlanillaRow[], palette: Palette, order: string[]) {
  const columns = order.map((key) => COLUMN_BY_KEY.get(key)!);
  const { styles, idFor } = createStyles(palette);
  const rowCount = rows.length + 1 + BLANK_ROWS;
  const columnCount = PLANILLA_COLUMNS.length;
  const cellData: Record<number, Record<number, { v: string; t: 1; s: string }>> = {};

  cellData[0] = {};
  columns.forEach((column, index) => {
    cellData[0][index] = { v: column.label, t: 1, s: "head" };
  });

  rows.forEach((row, rowIndex) => {
    const cells: Record<number, { v: string; t: 1; s: string }> = {};
    columns.forEach((column, index) => {
      cells[index] = {
        v: row.values[column.key] ?? "",
        t: 1,
        s:
          column.kind === "id"
            ? "id"
            : idFor({
                attendance: row.attendance[column.key] ?? null,
                dayStart: row.dayStart,
                league: column.key === "liga" ? row.values.liga : null,
              }),
      };
    });
    cellData[rowIndex + 1] = cells;
  });

  const columnData: Record<number, { w: number; hd?: 0 | 1; s?: string }> = {};
  columns.forEach((column, index) => {
    columnData[index] = {
      w: column.width,
      hd: column.kind === "id" ? 1 : 0,
      s: column.kind === "id" ? "id" : idFor({ attendance: null, dayStart: false, league: null }),
    };
  });

  return {
    id: "planilla-workbook",
    name: "Planilla",
    sheetOrder: [SHEET_ID],
    styles,
    sheets: {
      [SHEET_ID]: {
        id: SHEET_ID,
        name: "Partidos",
        rowCount,
        columnCount,
        defaultRowHeight: 26,
        freeze: {
          xSplit: PLANILLA_FROZEN_COLUMNS,
          ySplit: 1,
          startRow: 1,
          startColumn: PLANILLA_FROZEN_COLUMNS,
        },
        rowData: { 0: { h: 30 } },
        columnData,
        cellData,
        gridlinesColor: palette.border,
      },
    },
  };
}

export function GridPlanillaSheet({
  rows,
  people,
  leagues,
  teams,
  canEdit,
  year,
  timezone,
  todayKey,
  columnOrderKey,
  onStatus,
  onControls,
  onDeleteRequest,
  onColumnsCustomized,
  onActiveMatch,
}: GridPlanillaSheetProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  // Mount once: later renders (after a save revalidates) must not rebuild the
  // sheet under the user's cursor.
  const initial = useRef({
    rows,
    people,
    leagues,
    teams,
    canEdit,
    year,
    timezone,
    todayKey,
    columnOrderKey,
    onStatus,
    onControls,
    onDeleteRequest,
    onColumnsCustomized,
    onActiveMatch,
  });

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }
    const {
      rows,
      people,
      leagues,
      teams,
      canEdit,
      year,
      timezone,
      todayKey,
      columnOrderKey,
      onStatus,
      onControls,
      onDeleteRequest,
      onColumnsCustomized,
      onActiveMatch,
    } = initial.current;

    const container = document.createElement("div");
    container.style.height = "100%";
    host.append(container);

    const { univer, univerAPI } = createUniver({
      locale: LocaleType.ES_ES,
      locales: {
        [LocaleType.ES_ES]: mergeLocales(sheetsCoreEsES, dataValidationEsES),
      },
      presets: [
        UniverSheetsCorePreset({
          container,
          header: false,
          toolbar: false,
          footer: false,
          formulaBar: true,
          // Fecha, Hora and ID are text on purpose: no "number stored as
          // text" marks or prompts. The text-format ones come from the numfmt
          // plugin, which reads the preset's top-level options.
          disableTextFormatMark: true,
          disableTextFormatAlert: true,
          sheets: { disableForceStringMark: true, disableForceStringAlert: true },
        }),
        UniverSheetsDataValidationPreset({ showEditOnDropdown: false }),
      ],
    });

    const palette = readPalette();
    let order = readStoredOrder(columnOrderKey);
    let physicalOf = toPhysical(order);
    onColumnsCustomized(order.join() !== DEFAULT_ORDER.join());
    const workbook = univerAPI.createWorkbook(buildWorkbook(rows, palette, order));
    const sheet = workbook.getActiveSheet();
    const bodyRows = rows.length + BLANK_ROWS;

    PLANILLA_COLUMNS.forEach((column, index) => {
      const list =
        column.kind === "role"
          ? peopleForRole(people, column.roleName).map((person) => person.name)
          : column.kind === "field" && column.input === "league"
            ? leagues
            : column.kind === "field" && column.input === "team"
              ? teams
              : column.kind === "field" && column.input === "list"
                ? [...(column.options ?? [])]
                : null;
      if (!list?.length) {
        return;
      }
      const rule = univerAPI
        .newDataValidation()
        .requireValueInList(list, false, true)
        .setAllowBlank(true)
        .setAllowInvalid(false)
        .setOptions({ renderMode: univerAPI.Enum.DataValidationRenderMode.ARROW })
        .build();
      sheet.getRange(1, physicalOf[index], bodyRows, 1).setDataValidation(rule);
    });

    if (!canEdit) {
      workbook.setEditable(false);
    }

    const columnCount = PLANILLA_COLUMNS.length;
    const sync = createPlanillaSync({
      rows,
      lookups: { people, leagues, teams, year },
      onStatus,
      server: {
        saveEdits: (edits) => savePlanillaEditsAction(edits),
        createMatch: (match) => createPlanillaMatchAction({ ...match, timezone }),
      },
      port: {
        readRows() {
          const maxRows = sheet.getMaxRows();
          if (maxRows <= 1) {
            return [];
          }
          // Back to PLANILLA_COLUMNS order, whatever order the user sees.
          return sheet
            .getRange(1, 0, maxRows - 1, columnCount)
            .getDisplayValues()
            .map((cells) => physicalOf.map((physical) => cells[physical] ?? ""));
        },
        writeCell(row, column, value) {
          // Typed as text, or Univer would turn "21:00" into a time number.
          sheet.getRange(row + 1, physicalOf[column]).setValue({ v: value, t: 1 });
        },
        clearAttendance(row, column) {
          sheet
            .getRange(row + 1, physicalOf[column])
            .setFontColor(palette.foreground)
            .setFontWeight("normal");
        },
      },
    });

    const clearUndo = () =>
      univer.__getInjector().get(IUndoRedoService).clearUndoRedo(workbook.getId());

    // The header row is not data: a paste or Delete over it is undone.
    const restoreHeader = () => {
      const labels = sheet.getRange(0, 0, 1, columnCount).getDisplayValues()[0] ?? [];
      PLANILLA_COLUMNS.forEach((column, index) => {
        if (labels[physicalOf[index]] !== column.label) {
          sheet.getRange(0, physicalOf[index]).setValue({ v: column.label, t: 1, s: "head" });
        }
      });
    };

    // A dragged column changes this user's view only: the new order is read
    // from the header and kept in their browser.
    const readColumnOrder = () => {
      const labels = sheet.getRange(0, 0, 1, columnCount).getDisplayValues()[0] ?? [];
      const next = columnOrderFromLabels(labels);
      if (!next || next.join() === order.join()) {
        return;
      }
      order = next;
      physicalOf = toPhysical(order);
      storeOrder(columnOrderKey, order);
      onColumnsCustomized(order.join() !== DEFAULT_ORDER.join());
    };

    // Whole rows the selection covers, 0-based below the header. Clearing
    // only some cells of a row is an edit, not a deletion: that returns null.
    const selectedRows = (wholeRowsOnly: boolean) => {
      const ranges = sheet.getSelection()?.getActiveRangeList() ?? [];
      const picked: number[] = [];
      for (const range of ranges) {
        const { startRow, endRow, startColumn, endColumn, rangeType } = range.getRange();
        const wholeRow =
          Number(rangeType) === ROW_RANGE || (startColumn <= 0 && endColumn >= columnCount - 1);
        if (wholeRowsOnly && !wholeRow) {
          return null;
        }
        for (let row = Math.max(startRow, 1); row <= endRow; row += 1) {
          picked.push(row - 1);
        }
      }
      return picked;
    };

    let removingRows = false;
    let activeMatchId: string | null = null;
    const deleteMatches = async (targets: PlanillaRowMatch[]): Promise<PlanillaDeleteOutcome> => {
      let result: Awaited<ReturnType<typeof deletePlanillaMatchesAction>>;
      try {
        result = await deletePlanillaMatchesAction(targets.map((target) => target.matchId));
      } catch {
        return { failed: [], error: "No se pudo conectar. Probá de nuevo." };
      }
      const deleted = new Set(result.deleted);

      if (deleted.size) {
        // Find the rows again: they may have moved while the dialog was open.
        const ids = sheet
          .getRange(1, physicalOf[ID_COLUMN], sheet.getMaxRows() - 1, 1)
          .getDisplayValues()
          .map(([id = ""]) => id.trim());
        const doomed = ids
          .flatMap((id, row) => (deleted.has(id) ? [row] : []))
          .sort((a, b) => b - a);
        removingRows = true;
        try {
          for (const row of doomed) {
            sheet.deleteRows(row + 1, 1);
            shownLeagues.splice(row, 1);
          }
        } finally {
          removingRows = false;
        }
        // Undo would bring back rows whose Partidos no longer exist.
        clearUndo();
        sync.forget([...deleted]);
        activeMatchId = null;
        onActiveMatch(null);
      }

      if (result.error) {
        return { failed: [], error: result.error };
      }
      const byId = new Map(targets.map((target) => [target.matchId, target]));
      const failed = result.failed.flatMap(({ matchId, error }) => {
        const match = byId.get(matchId);
        return match ? [{ match, error }] : [];
      });
      failed.forEach(({ match, error }) => sync.report(`${match.label}: ${error}`));
      return { failed };
    };

    // The row under the cursor names its Partido, so the page can link to its
    // ficha (Notificar, GRUPO, the full detail). Only the id cell is read until
    // the cursor reaches another Partido.
    let activeTimer: ReturnType<typeof setTimeout> | undefined;
    const reportActiveMatch = () => {
      clearTimeout(activeTimer);
      activeTimer = setTimeout(() => {
        const row = sheet.getSelection()?.getActiveRange()?.getRow() ?? 0;
        const id = row > 0 ? sheet.getRange(row, physicalOf[ID_COLUMN]).getDisplayValue().trim() : "";
        if (id === (activeMatchId ?? "")) {
          return;
        }
        const match = id ? (sync.matchesOnRows([row - 1])[0] ?? null) : null;
        activeMatchId = match?.matchId ?? null;
        onActiveMatch(match);
      }, 120);
    };

    onControls({
      confirmBulk: sync.confirmBulk,
      discardBulk: sync.discardBulk,
      deleteMatches,
    });

    // Liga cells take their league's colour, so a typed or pasted league
    // repaints its cell.
    const shownLeagues = rows.map((row) => row.values.liga ?? "");
    const repaintLeagues = () => {
      const ligaColumn = physicalOf[LIGA_COLUMN];
      const values = sheet.getRange(1, ligaColumn, sheet.getMaxRows() - 1, 1).getDisplayValues();
      values.forEach(([league = ""], index) => {
        if ((shownLeagues[index] ?? "") === league) {
          return;
        }
        shownLeagues[index] = league;
        const color = getGridLeagueColor(league);
        sheet
          .getRange(index + 1, ligaColumn)
          .setBackground(color?.background ?? palette.surface)
          .setFontColor(color?.text ?? palette.foreground)
          .setFontWeight(color ? "bold" : "normal");
      });
    };

    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        restoreHeader();
        sync.scan();
        repaintLeagues();
      }, 250);
    };

    // Row heights fit their text, and the sheet opens on today. Both need the
    // rendered sheet, and neither is something the user should be able to undo.
    const todayRow = findTodayRowIndex(rows, todayKey);
    let settled = false;
    const settle = () => {
      if (settled) {
        return;
      }
      settled = true;
      sheet.autoResizeRows(1, bodyRows);
      if (todayRow > 0) {
        sheet.scrollToCell(todayRow + 1, PLANILLA_FROZEN_COLUMNS);
      }
      clearUndo();
    };
    const RENDERED = univerAPI.Enum.LifecycleStages.Rendered;

    const subscriptions = [
      univerAPI.addEvent(univerAPI.Event.LifeCycleChanged, ({ stage }) => {
        if (stage >= RENDERED) {
          settle();
        }
      }),
      univerAPI.addEvent(univerAPI.Event.SheetValueChanged, schedule),
      univerAPI.addEvent(univerAPI.Event.SelectionChanged, reportActiveMatch),
      univerAPI.addEvent(univerAPI.Event.BeforeSheetEditStart, (event) => {
        if (event.row === 0) {
          event.cancel = true;
        }
      }),
      univerAPI.addEvent(univerAPI.Event.BeforeCommandExecute, (event) => {
        if (BLOCKED_COMMAND.test(event.id)) {
          event.cancel = true;
          sync.report("En la planilla no se agregan ni se quitan columnas.");
          return;
        }
        if (removingRows || !canEdit) {
          return;
        }
        const removing = REMOVE_ROW_COMMANDS.has(event.id);
        if (!removing && !CLEAR_COMMANDS.has(event.id)) {
          return;
        }
        const rowsPicked = selectedRows(!removing);
        if (!rowsPicked) {
          return;
        }
        const matches = sync.matchesOnRows(rowsPicked);
        if (matches.length) {
          event.cancel = true;
          onDeleteRequest(matches);
        } else if (removing) {
          // Blank rows stay: they are where new Partidos are typed.
          event.cancel = true;
        }
      }),
      univerAPI.addEvent(univerAPI.Event.CommandExecuted, (event) => {
        if (event.id === MOVE_COLUMNS_MUTATION) {
          readColumnOrder();
        }
      }),
    ];

    if (univerAPI.getCurrentLifecycleStage() >= RENDERED) {
      settle();
    }

    // Supr (or Backspace) on whole selected rows deletes their Partidos. It is
    // caught here, before Univer's own shortcut, which only fires when its
    // hidden editor holds the focus and is not reliable after a row header
    // click.
    let sheetActive = false;
    const onPointerDown = (event: PointerEvent) => {
      sheetActive = host.contains(event.target as Node);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        !sheetActive ||
        !canEdit ||
        (event.key !== "Delete" && event.key !== "Backspace") ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        workbook.isCellEditing()
      ) {
        return;
      }
      const rowsPicked = selectedRows(true);
      const matches = rowsPicked ? sync.matchesOnRows(rowsPicked) : [];
      if (!matches.length) {
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      onDeleteRequest(matches);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
      clearTimeout(timer);
      clearTimeout(activeTimer);
      subscriptions.forEach((subscription) => subscription.dispose());
      // Univer mounts its own React roots; disposing inside React's commit
      // would unmount them synchronously.
      queueMicrotask(() => {
        univer.dispose();
        container.remove();
      });
    };
  }, []);

  return <div ref={hostRef} className="h-full w-full" />;
}
