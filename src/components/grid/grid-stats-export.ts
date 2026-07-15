import { formatMatchDateTime } from "@/lib/date";
import type {
  GridReportSummary,
  ReportPersonDetail,
} from "@/lib/grid/report-stats";
import { UNSPECIFIED_PRODUCTION_MODE } from "@/lib/grid/report-stats";

export type StatsExportTab = "personas" | "equipos" | "produccion" | "funciones";

export type StatsExportTable = {
  tabLabel: string;
  headers: string[];
  rows: string[][];
};

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
        String(person.matchCount),
        String(person.assignmentCount),
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
        String(team.local),
        String(team.visitante),
        String(team.total),
      ]),
    };
  }

  if (tab === "produccion") {
    return {
      tabLabel: "Producción",
      headers: ["Producción", "Partidos"],
      rows: summary.produccion.map((entry) => [
        entry.mode,
        String(entry.count),
      ]),
    };
  }

  return {
    tabLabel: "Funciones",
    headers: ["Categoría", "Función", "Asignaciones"],
    rows: summary.funciones.categories.flatMap((category) => [
      ...category.roles.map((role) => [
        category.category,
        role.name,
        String(role.count),
      ]),
      [category.category, `Total ${category.category}`, String(category.total)],
    ]),
  };
}

// Per-person detail: one row per match the person was assigned to, in range.
export function buildPersonDetailExportTable(
  detail: ReportPersonDetail,
  timezone: string,
): StatsExportTable {
  return {
    tabLabel: `Detalle · ${detail.fullName}`,
    headers: ["Fecha", "Local", "Visitante", "Producción", "Función"],
    rows: detail.matches.map((match) => [
      formatMatchDateTime(match.kickoffAt, timezone),
      match.homeTeam,
      match.awayTeam,
      match.productionMode?.trim() || UNSPECIFIED_PRODUCTION_MODE,
      match.roles.join(" · "),
    ]),
  };
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

function escapeCsvCell(value: string) {
  if (/[",\n]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }

  return value;
}

export function buildStatsCsv(table: StatsExportTable) {
  const lines = [table.headers, ...table.rows].map((row) =>
    row.map(escapeCsvCell).join(","),
  );

  // BOM so Excel opens the UTF-8 file with accents intact.
  return `\uFEFF${lines.join("\n")}`;
}

export function sanitizeStatsFileSegment(value: string) {
  return value
    .normalize("NFD")
    .replaceAll(/[\u0300-\u036f]/g, "")
    .replaceAll(/[^a-zA-Z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "")
    .toLowerCase();
}

export function buildStatsFileBaseName(params: {
  tabLabel: string;
  from: string;
  to: string;
}) {
  return [
    "estadisticas",
    sanitizeStatsFileSegment(params.tabLabel),
    params.from,
    params.to,
  ].join("-");
}

export function buildAllStatsFileBaseName(params: {
  from: string;
  to: string;
}) {
  return ["estadisticas", "todas", params.from, params.to].join("-");
}

export const ALL_STATS_TABS: StatsExportTab[] = [
  "personas",
  "equipos",
  "produccion",
  "funciones",
];

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

type JsPdfDocument = import("jspdf").jsPDF;
type AutoTable = typeof import("jspdf-autotable").default;

function drawStatsTable(
  pdfDocument: JsPdfDocument,
  autoTable: AutoTable,
  table: StatsExportTable,
  startY: number,
) {
  const marginX = 40;

  pdfDocument.setFont("helvetica", "bold");
  pdfDocument.setFontSize(12);
  pdfDocument.setTextColor(15, 23, 42);
  pdfDocument.text(table.tabLabel, marginX, startY);

  autoTable(pdfDocument, {
    startY: startY + 10,
    head: [table.headers],
    body: table.rows,
    margin: { left: marginX, right: marginX },
    styles: {
      fontSize: 9,
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
      fontSize: 9,
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
  const marginX = 40;
  let currentY = 48;

  pdfDocument.setFont("helvetica", "bold");
  pdfDocument.setFontSize(16);
  pdfDocument.setTextColor(15, 23, 42);
  pdfDocument.text(title, marginX, currentY);
  currentY += 18;

  pdfDocument.setFont("helvetica", "normal");
  pdfDocument.setFontSize(10);
  pdfDocument.setTextColor(100, 116, 139);
  pdfDocument.text(`Periodo: ${rangeLabel}`, marginX, currentY);
  currentY += 22;

  return currentY;
}

export async function exportStatsPdf(params: {
  table: StatsExportTable;
  rangeLabel: string;
  fileBaseName: string;
}) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);

  const pdfDocument = new jsPDF({ unit: "pt", format: "a4" });
  const startY = drawStatsHeader(
    pdfDocument,
    `Estadísticas — ${params.table.tabLabel}`,
    params.rangeLabel,
  );
  drawStatsTable(pdfDocument, autoTable, params.table, startY);

  pdfDocument.save(`${params.fileBaseName}.pdf`);
}

// "Todas las pestañas": one document, a section per tab table. CSV stays
// single-tab (see grid-stats-modal), so this multi-table path is PDF only.
export async function exportAllStatsPdf(params: {
  tables: StatsExportTable[];
  rangeLabel: string;
  fileBaseName: string;
}) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);

  const pdfDocument = new jsPDF({ unit: "pt", format: "a4" });
  const pageHeight = pdfDocument.internal.pageSize.getHeight();
  let currentY = drawStatsHeader(
    pdfDocument,
    "Estadísticas — Todas las pestañas",
    params.rangeLabel,
  );

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
