import type { GridReportSummary } from "@/lib/grid/report-stats";

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
  const marginX = 40;
  let currentY = 48;

  pdfDocument.setFont("helvetica", "bold");
  pdfDocument.setFontSize(16);
  pdfDocument.setTextColor(15, 23, 42);
  pdfDocument.text(`Estadísticas — ${params.table.tabLabel}`, marginX, currentY);
  currentY += 18;

  pdfDocument.setFont("helvetica", "normal");
  pdfDocument.setFontSize(10);
  pdfDocument.setTextColor(100, 116, 139);
  pdfDocument.text(`Periodo: ${params.rangeLabel}`, marginX, currentY);
  currentY += 18;

  autoTable(pdfDocument, {
    startY: currentY,
    head: [params.table.headers],
    body: params.table.rows,
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

  pdfDocument.save(`${params.fileBaseName}.pdf`);
}
