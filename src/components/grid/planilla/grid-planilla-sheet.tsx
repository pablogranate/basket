"use client";

import { useEffect, useRef } from "react";
import { UniverSheetsCorePreset } from "@univerjs/preset-sheets-core";
import sheetsCoreEsES from "@univerjs/preset-sheets-core/locales/es-ES";
import { UniverSheetsDataValidationPreset } from "@univerjs/preset-sheets-data-validation";
import dataValidationEsES from "@univerjs/preset-sheets-data-validation/locales/es-ES";
import { createUniver, LocaleType, mergeLocales } from "@univerjs/presets";
import "@univerjs/preset-sheets-core/lib/index.css";
import "@univerjs/preset-sheets-data-validation/lib/index.css";

import {
  createPlanillaMatchAction,
  savePlanillaEditsAction,
} from "@/app/actions/grid-planilla";
import {
  peopleForRole,
  PLANILLA_COLUMNS,
  PLANILLA_FROZEN_COLUMNS,
  type PlanillaPerson,
  type PlanillaRow,
} from "@/lib/grid/planilla";
import { createPlanillaSync, type PlanillaStatus } from "@/lib/grid/planilla-sync";
import type { AttendanceState } from "@/lib/grid/attendance";

type GridPlanillaSheetProps = {
  rows: PlanillaRow[];
  people: PlanillaPerson[];
  leagues: string[];
  canEdit: boolean;
  year: number;
  timezone: string;
  onStatus: (status: PlanillaStatus) => void;
};

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
  band: string;
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
    band: token("--n-50"),
    border: token("--border"),
    ok: token("--ok"),
    warn: token("--warn"),
    accent: token("--accent"),
  };
}

const TEXT_FORMAT = { n: { pattern: "@" } };

function cellStyleId(band: 0 | 1, attendance: AttendanceState) {
  return `b${band}-${attendance ?? "none"}`;
}

function buildStyles(palette: Palette) {
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
      vt: 2,
    },
  };
  for (const band of [0, 1] as const) {
    for (const [state, color] of Object.entries(attendanceColor)) {
      styles[`b${band}-${state}`] = {
        ...TEXT_FORMAT,
        fs: 10,
        cl: { rgb: color },
        bl: state === "none" ? 0 : 1,
        ...(band === 1 ? { bg: { rgb: palette.band } } : {}),
      };
    }
  }
  return styles;
}

function buildWorkbook(rows: PlanillaRow[], palette: Palette) {
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
        s: cellStyleId(row.dayBand, row.attendance[column.key] ?? null),
      };
    });
    cellData[rowIndex + 1] = cells;
  });

  const columnData: Record<number, { w: number; hd?: 0 | 1; s?: string }> = {};
  PLANILLA_COLUMNS.forEach((column, index) => {
    columnData[index] = { w: column.width, hd: column.kind === "id" ? 1 : 0, s: "b0-none" };
  });

  return {
    id: "planilla-workbook",
    name: "Planilla",
    sheetOrder: [SHEET_ID],
    styles: buildStyles(palette),
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
  canEdit,
  year,
  timezone,
  onStatus,
}: GridPlanillaSheetProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  // Mount once: later renders (after a save revalidates) must not rebuild the
  // sheet under the user's cursor.
  const initial = useRef({ rows, people, leagues, canEdit, year, timezone, onStatus });

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }
    const { rows, people, leagues, canEdit, year, timezone, onStatus } = initial.current;

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
        .build();
      sheet.getRange(1, index, bodyRows, 1).setDataValidation(rule);
    });

    if (!canEdit) {
      workbook.setEditable(false);
    }

    const columnCount = PLANILLA_COLUMNS.length;
    const sync = createPlanillaSync({
      rows,
      lookups: { people, leagues, year },
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
          sheet.getRange(row + 1, column).setValue(value);
        },
        clearAttendance(row, column) {
          sheet.getRange(row + 1, column).setFontColor(palette.foreground).setFontWeight("normal");
        },
      },
    });

    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(sync.scan, 250);
    };

    const subscriptions = [
      univerAPI.addEvent(univerAPI.Event.SheetValueChanged, schedule),
      univerAPI.addEvent(univerAPI.Event.BeforeCommandExecute, (event) => {
        if (BLOCKED_COMMAND.test(event.id)) {
          event.cancel = true;
          sync.report(
            "En la planilla no se borran filas ni se mueven columnas. Para borrar un partido, usá su ficha.",
          );
        }
      }),
    ];

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
