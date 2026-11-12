import { formatMatchDateTime } from "@/lib/date";
import type {
  GridReportSummary,
  ReportMatchRow,
  ReportMatchStaffing,
  ReportPersonDetail,
  ReportPersonMatch,
} from "@/lib/grid/report-stats";
import {
  buildMatchStaffing,
  buildPersonDetail,
  UNSPECIFIED_COMPETITION,
  UNSPECIFIED_PRODUCTION_MODE,
} from "@/lib/grid/report-stats";

export type StatsExportTab = "personas" | "equipos" | "produccion" | "funciones";

export type StatsExportCell = string | number;

// A "group" row heads a block of rows (one person in the Ficha por persona).
export type StatsExportRowKind = "data" | "group";

export type StatsExportTable = {
  tabLabel: string;
  headers: string[];
  rows: StatsExportCell[][];
  rowKinds?: StatsExportRowKind[];
};

export type StatsExportSelection = {
  resumen: boolean;
  resumenScope: "current" | "all";
  ficha: boolean;
  planilla: boolean;
};

export const ALL_STATS_TABS: StatsExportTab[] = [
  "personas",
  "equipos",
  "produccion",
  "funciones",
];

// Export always covers the full tab table for the selected range — the
// Personas name search is a view filter, not a data filter.
export function buildStatsExportTable(
  summary: GridReportSummary,
  tab: StatsExportTab,
): StatsExportTable {
  if (tab === "personas") {
    return {
      tabLabel: "Personas",
      headers: ["Persona", "Partidos", "Asignaciones", "Funciones"],
      rows: summary.personas.map((person) => [
        person.fullName,
        person.matchCount,
        person.assignmentCount,
        person.roles.join(" · "),
      ]),
    };
  }

  if (tab === "equipos") {
    return {
      tabLabel: "Equipos",
      headers: ["Equipo", "De local", "De visitante", "Total"],
      rows: summary.equipos.map((team) => [
        team.team,
        team.local,
        team.visitante,
        team.total,
      ]),
    };
  }

  if (tab === "produccion") {
    return {
      tabLabel: "Producción",
      headers: ["Producción", "Partidos"],
      rows: summary.produccion.map((entry) => [entry.mode, entry.count]),
    };
  }

  return {
    tabLabel: "Funciones",
    headers: ["Categoría", "Función", "Asignaciones"],
    rows: summary.funciones.categories.flatMap((category) => [
      ...category.roles.map((role) => [category.category, role.name, role.count]),
      [category.category, `Total ${category.category}`, category.total],
    ]),
  };
}

function competitionLabel(competition: string | null) {
  return competition?.trim() || UNSPECIFIED_COMPETITION;
}

function productionLabel(productionMode: string | null) {
  return productionMode?.trim() || UNSPECIFIED_PRODUCTION_MODE;
}

const PERSON_MATCH_HEADERS = [
  "Fecha",
  "Liga",
  "Local",
  "Visitante",
  "Producción",
  "Estado",
  "Función",
];

function buildPersonMatchRow(
  match: ReportPersonMatch,
  timezone: string,
): StatsExportCell[] {
  return [
    formatMatchDateTime(match.kickoffAt, timezone),
    competitionLabel(match.competition),
    match.homeTeam,
    match.awayTeam,
    productionLabel(match.productionMode),
    match.status,
    match.roles.join(" · "),
  ];
}

// Per-person detail: one row per match the person was assigned to, in range.
export function buildPersonDetailExportTable(
  detail: ReportPersonDetail,
  timezone: string,
): StatsExportTable {
  return {
    tabLabel: `Detalle · ${detail.fullName}`,
    headers: PERSON_MATCH_HEADERS,
    rows: detail.matches.map((match) => buildPersonMatchRow(match, timezone)),
  };
}

// Ficha por persona: every person's matches in one table, each block headed by
// a group row with the person's totals.
export function buildPersonFichaExportTable(
  details: ReportPersonDetail[],
  timezone: string,
): StatsExportTable {
  const rows: StatsExportCell[][] = [];
  const rowKinds: StatsExportRowKind[] = [];
  const padding = PERSON_MATCH_HEADERS.slice(2).map(() => "");

  details.forEach((detail) => {
    rows.push([
      detail.fullName,
      `${detail.matchCount} partidos · ${detail.assignmentCount} asignaciones`,
      ...padding,
    ]);
    rowKinds.push("group");

    detail.matches.forEach((match) => {
      rows.push(buildPersonMatchRow(match, timezone));
      rowKinds.push("data");
    });
  });

  return {
    tabLabel: "Ficha por persona",
    headers: PERSON_MATCH_HEADERS,
    rows,
    rowKinds,
  };
}

// Planilla por partido: one row per match, one column per role filled in range.
export function buildMatchStaffingExportTable(
  staffing: ReportMatchStaffing,
  timezone: string,
): StatsExportTable {
  return {
    tabLabel: "Planilla por partido",
    headers: [
      "Fecha",
      "Liga",
      "Local",
      "Visitante",
      "Producción",
      "Estado",
      ...staffing.roles,
    ],
    rows: staffing.matches.map((match) => [
      formatMatchDateTime(match.kickoffAt, timezone),
      competitionLabel(match.competition),
      match.homeTeam,
      match.awayTeam,
      productionLabel(match.productionMode),
      match.status,
      ...staffing.roles.map((role) => (match.staff[role] ?? []).join(" · ")),
    ]),
  };
}

// The tables one export holds, in document order. `summary` carries the
// on-screen sort, so the Ficha lists people in the same order as Personas.
export function buildStatsExportTables(params: {
  selection: StatsExportSelection;
  summary: GridReportSummary;
  activeTab: StatsExportTab;
  matches: ReportMatchRow[];
  timezone: string;
}): StatsExportTable[] {
  const { selection, summary, activeTab, matches, timezone } = params;
  const tables: StatsExportTable[] = [];

  if (selection.resumen) {
    const tabs = selection.resumenScope === "all" ? ALL_STATS_TABS : [activeTab];
    tabs.forEach((tab) => tables.push(buildStatsExportTable(summary, tab)));
  }

  if (selection.ficha) {
    const details = summary.personas.flatMap((person) => {
      const detail = buildPersonDetail(matches, person.id);
      return detail ? [detail] : [];
    });
    tables.push(buildPersonFichaExportTable(details, timezone));
  }

  if (selection.planilla) {
    tables.push(
      buildMatchStaffingExportTable(buildMatchStaffing(matches), timezone),
    );
  }

  return tables;
}

export function sanitizeStatsFileSegment(value: string) {
  return value
    .normalize("NFD")
    .replaceAll(/[̀-ͯ]/g, "")
    .replaceAll(/[^a-zA-Z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "")
    .toLowerCase();
}

export function buildStatsFileBaseName(params: {
  tables: StatsExportTable[];
  from: string;
  to: string;
}) {
  const label =
    params.tables.length === 1
      ? [sanitizeStatsFileSegment(params.tables[0].tabLabel)]
      : [];
  return ["estadisticas", ...label, params.from, params.to].join("-");
}

export function buildPersonDetailFileBaseName(params: {
  fullName: string;
  from: string;
  to: string;
}) {
  return [
    "estadisticas",
    "persona",
    sanitizeStatsFileSegment(params.fullName),
    params.from,
    params.to,
  ].join("-");
}

export function buildStatsDocumentTitle(tables: StatsExportTable[]) {
  return tables.length === 1
    ? `Estadísticas — ${tables[0].tabLabel}`
    : "Estadísticas";
}

export function downloadStatsBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

const XLSX_HEADER_FILL = "#0F172A";
const XLSX_GROUP_FILL = "#E9EEF6";

// Excel sheet names: at most 31 characters, none of : \ / ? * [ ], unique.
export function buildSheetName(label: string, used: Set<string>) {
  const base = label.replaceAll(/[:\\/?*[\]]/g, "-").slice(0, 31);
  let name = base;
  let suffix = 2;
  while (used.has(name)) {
    const tail = ` (${suffix})`;
    name = `${base.slice(0, 31 - tail.length)}${tail}`;
    suffix += 1;
  }
  used.add(name);
  return name;
}

function columnWidths(table: StatsExportTable) {
  return table.headers.map((header, index) => {
    const longest = table.rows.reduce((max, row, rowIndex) => {
      if (table.rowKinds?.[rowIndex] === "group") {
        return max;
      }
      return Math.max(max, String(row[index] ?? "").length);
    }, header.length);
    return { width: Math.min(Math.max(longest + 2, 8), 45) };
  });
}

// One sheet per table, header row frozen.
export function buildStatsXlsxSheets(tables: StatsExportTable[]) {
  const usedNames = new Set<string>();

  return tables.map((table) => ({
    sheet: buildSheetName(table.tabLabel, usedNames),
    columns: columnWidths(table),
    stickyRowsCount: 1,
    data: [
      table.headers.map((header) => ({
        value: header,
        fontWeight: "bold" as const,
        textColor: "#FFFFFF",
        backgroundColor: XLSX_HEADER_FILL,
      })),
      ...table.rows.map((row, rowIndex) =>
        table.rowKinds?.[rowIndex] === "group"
          ? row.map((value) => ({
              value,
              fontWeight: "bold" as const,
              backgroundColor: XLSX_GROUP_FILL,
            }))
          : row.map((value) => ({ value })),
      ),
    ],
  }));
}

// Loaded on demand like jsPDF.
export async function exportStatsXlsx(params: {
  tables: StatsExportTable[];
  fileBaseName: string;
}) {
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  const blob = await writeXlsxFile(buildStatsXlsxSheets(params.tables)).toBlob();
  downloadStatsBlob(blob, `${params.fileBaseName}.xlsx`);
}

type JsPdfDocument = import("jspdf").jsPDF;
type AutoTable = typeof import("jspdf-autotable").default;

const PDF_MARGIN_X = 40;
const PDF_WIDE_TABLE_COLUMNS = 8;

function drawStatsTable(
  pdfDocument: JsPdfDocument,
  autoTable: AutoTable,
  table: StatsExportTable,
  startY: number,
) {
  pdfDocument.setFont("helvetica", "bold");
  pdfDocument.setFontSize(12);
  pdfDocument.setTextColor(15, 23, 42);
  pdfDocument.text(table.tabLabel, PDF_MARGIN_X, startY);

  const fontSize = table.headers.length > PDF_WIDE_TABLE_COLUMNS ? 7 : 9;
  const body = table.rows.map((row, rowIndex) =>
    table.rowKinds?.[rowIndex] === "group"
      ? [
          {
            content: row.filter((cell) => cell !== "").join(" — "),
            colSpan: table.headers.length,
            styles: {
              fontStyle: "bold" as const,
              fillColor: [233, 238, 246] as [number, number, number],
            },
          },
        ]
      : row,
  );

  autoTable(pdfDocument, {
    startY: startY + 10,
    head: [table.headers],
    body,
    margin: { left: PDF_MARGIN_X, right: PDF_MARGIN_X },
    styles: {
      fontSize,
      cellPadding: 5,
      lineColor: [219, 228, 240],
      lineWidth: 0.5,
      textColor: [31, 41, 55],
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize,
      halign: "left",
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    theme: "grid",
  });

  const finalY = (
    pdfDocument as JsPdfDocument & { lastAutoTable?: { finalY: number } }
  ).lastAutoTable?.finalY;
  return typeof finalY === "number" ? finalY : startY + 10;
}

function drawStatsHeader(
  pdfDocument: JsPdfDocument,
  title: string,
  rangeLabel: string,
) {
  let currentY = 48;

  pdfDocument.setFont("helvetica", "bold");
  pdfDocument.setFontSize(16);
  pdfDocument.setTextColor(15, 23, 42);
  pdfDocument.text(title, PDF_MARGIN_X, currentY);
  currentY += 18;

  pdfDocument.setFont("helvetica", "normal");
  pdfDocument.setFontSize(10);
  pdfDocument.setTextColor(100, 116, 139);
  pdfDocument.text(`Periodo: ${rangeLabel}`, PDF_MARGIN_X, currentY);
  currentY += 22;

  return currentY;
}

// One document, a section per table. Landscape when a table is too wide for
// portrait (the Planilla por partido has a column per role).
export async function exportStatsPdf(params: {
  tables: StatsExportTable[];
  title: string;
  rangeLabel: string;
  fileBaseName: string;
}) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);

  const isWide = params.tables.some(
    (table) => table.headers.length > PDF_WIDE_TABLE_COLUMNS,
  );
  const pdfDocument = new jsPDF({
    unit: "pt",
    format: "a4",
    orientation: isWide ? "landscape" : "portrait",
  });
  const pageHeight = pdfDocument.internal.pageSize.getHeight();
  let currentY = drawStatsHeader(pdfDocument, params.title, params.rangeLabel);

  params.tables.forEach((table, index) => {
    if (index > 0) {
      // Start a fresh page if the section title has no room to breathe.
      if (currentY > pageHeight - 120) {
        pdfDocument.addPage();
        currentY = 48;
      } else {
        currentY += 12;
      }
    }

    currentY = drawStatsTable(pdfDocument, autoTable, table, currentY);
  });

  pdfDocument.save(`${params.fileBaseName}.pdf`);
}
