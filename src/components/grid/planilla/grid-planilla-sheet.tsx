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
  savePlanillaEditsAction,
} from "@/app/actions/grid-planilla";
import {
  findTodayRowIndex,
  peopleForRole,
  PLANILLA_COLUMNS,
  PLANILLA_FROZEN_COLUMNS,
  type PlanillaPerson,
  type PlanillaRow,
} from "@/lib/grid/planilla";
import { createPlanillaSync, type PlanillaStatus } from "@/lib/grid/planilla-sync";
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
  onStatus: (status: PlanillaStatus) => void;
  onControls: (controls: PlanillaControls) => void;
};

export type PlanillaControls = { confirmBulk: () => void; discardBulk: () => void };

// Blank rows under the month's Partidos: where new Partidos are typed.
const BLANK_ROWS = 40;
const SHEET_ID = "planilla";

// Commands that delete rows or shift columns. Rows map to Partidos and
// columns to fields, so the Planilla only lets cells change.
const BLOCKED_COMMAND =
  /^sheet\.command\.(remove-row|remove-col|insert-col|insert-multi-cols|move-cols|delete-range-move|insert-range-move)/;

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

function buildWorkbook(rows: PlanillaRow[], palette: Palette) {
  const { styles, idFor } = createStyles(palette);
  const rowCount = rows.length + 1 + BLANK_ROWS;
  const columnCount = PLANILLA_COLUMNS.length;
  const cellData: Record<number, Record<number, { v: string; t: 1; s: string }>> = {};

  cellData[0] = {};
  PLANILLA_COLUMNS.forEach((column, index) => {
    cellData[0][index] = { v: column.label, t: 1, s: "head" };
  });

  rows.forEach((row, rowIndex) => {
    const cells: Record<number, { v: string; t: 1; s: string }> = {};
    PLANILLA_COLUMNS.forEach((column, index) => {
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
  PLANILLA_COLUMNS.forEach((column, index) => {
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
  onStatus,
  onControls,
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
    onStatus,
    onControls,
  });

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }
    const { rows, people, leagues, teams, canEdit, year, timezone, todayKey, onStatus, onControls } =
      initial.current;

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
          // text" marks or prompts.
          sheets: { disableForceStringMark: true, disableForceStringAlert: true },
        }),
        UniverSheetsDataValidationPreset({ showEditOnDropdown: false }),
      ],
    });

    const palette = readPalette();
    const workbook = univerAPI.createWorkbook(buildWorkbook(rows, palette));
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
      sheet.getRange(1, index, bodyRows, 1).setDataValidation(rule);
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
          return sheet.getRange(1, 0, maxRows - 1, columnCount).getDisplayValues();
        },
        writeCell(row, column, value) {
          // Typed as text, or Univer would turn "21:00" into a time number.
          sheet.getRange(row + 1, column).setValue({ v: value, t: 1 });
        },
        clearAttendance(row, column) {
          sheet.getRange(row + 1, column).setFontColor(palette.foreground).setFontWeight("normal");
        },
      },
    });

    onControls({ confirmBulk: sync.confirmBulk, discardBulk: sync.discardBulk });

    // The header row is not data: a paste or Delete over it is undone.
    const restoreHeader = () => {
      const labels = sheet.getRange(0, 0, 1, columnCount).getDisplayValues()[0] ?? [];
      PLANILLA_COLUMNS.forEach((column, index) => {
        if (labels[index] !== column.label) {
          sheet.getRange(0, index).setValue({ v: column.label, t: 1, s: "head" });
        }
      });
    };

    // Liga cells take their league's colour, so a typed or pasted league
    // repaints its cell.
    const shownLeagues = rows.map((row) => row.values.liga ?? "");
    const repaintLeagues = () => {
      const values = sheet.getRange(1, LIGA_COLUMN, sheet.getMaxRows() - 1, 1).getDisplayValues();
      values.forEach(([league = ""], index) => {
        if ((shownLeagues[index] ?? "") === league) {
          return;
        }
        shownLeagues[index] = league;
        const color = getGridLeagueColor(league);
        sheet
          .getRange(index + 1, LIGA_COLUMN)
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
      univer.__getInjector().get(IUndoRedoService).clearUndoRedo(workbook.getId());
    };
    const RENDERED = univerAPI.Enum.LifecycleStages.Rendered;

    const subscriptions = [
      univerAPI.addEvent(univerAPI.Event.LifeCycleChanged, ({ stage }) => {
        if (stage >= RENDERED) {
          settle();
        }
      }),
      univerAPI.addEvent(univerAPI.Event.SheetValueChanged, schedule),
      univerAPI.addEvent(univerAPI.Event.BeforeSheetEditStart, (event) => {
        if (event.row === 0) {
          event.cancel = true;
        }
      }),
      univerAPI.addEvent(univerAPI.Event.BeforeCommandExecute, (event) => {
        if (BLOCKED_COMMAND.test(event.id)) {
          event.cancel = true;
          sync.report(
            "En la planilla no se borran filas ni se mueven columnas. Para borrar un partido, usá su ficha.",
          );
        }
      }),
    ];

    if (univerAPI.getCurrentLifecycleStage() >= RENDERED) {
      settle();
    }

    return () => {
      clearTimeout(timer);
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
