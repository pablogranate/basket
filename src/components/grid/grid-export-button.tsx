"use client";

import { useState } from "react";
import { Download } from "lucide-react";

import {
  getProductionModeLabel,
  normalizeCommentaryPlan,
  RESPONSIBLE_DISPLAY_LABEL,
} from "@/lib/constants";
import { formatMatchDate } from "@/lib/date";
import type { MatchListItem } from "@/lib/types";

type GridExportButtonProps = {
  matches: MatchListItem[];
  periodLabel: string;
};

type GridExportRow = {
  Dia: string;
  Produccion: string;
  ID: string;
  Liga: string;
  Partido: string;
  Hora: string;
  Responsable: string;
  Realizador: string;
  "Operador de Grafica": string;
  "Camara 1": string;
  "Camara 2": string;
  "Camara 3": string;
  "Camara 4": string;
  "Camara 5": string;
  "Relatos/Comentarios": string;
  Relator: string;
  "Comentarista 1": string;
  "Comentarista 2": string;
  "Operador de Control": string;
  "Soporte tecnico": string;
  Transporte: string;
  Observacion: string;
};

const GRID_EXPORT_COLUMNS: Array<{
  key: keyof GridExportRow;
  label: string;
}> = [
  { key: "Dia", label: "Dia" },
  { key: "Produccion", label: "Produccion" },
  { key: "ID", label: "ID" },
  { key: "Liga", label: "Liga" },
  { key: "Partido", label: "Partido" },
  { key: "Hora", label: "Hora" },
  { key: "Responsable", label: RESPONSIBLE_DISPLAY_LABEL },
  { key: "Realizador", label: "Realizador" },
  { key: "Operador de Grafica", label: "Operador de Grafica" },
  { key: "Camara 1", label: "Camara 1" },
  { key: "Camara 2", label: "Camara 2" },
  { key: "Camara 3", label: "Camara 3" },
  { key: "Camara 4", label: "Camara 4" },
  { key: "Camara 5", label: "Camara 5" },
  { key: "Relatos/Comentarios", label: "Relatos/Comentarios" },
  { key: "Relator", label: "Relator" },
  { key: "Comentarista 1", label: "Comentarista 1" },
  { key: "Comentarista 2", label: "Comentarista 2" },
  { key: "Operador de Control", label: "Operador de Control" },
  { key: "Soporte tecnico", label: "Soporte tecnico" },
  { key: "Transporte", label: "Transporte" },
  { key: "Observacion", label: "Observacion" },
] as const;

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function sanitizeFileSegment(value: string) {
  return value
    .normalize("NFD")
    .replaceAll(/[\u0300-\u036f]/g, "")
    .replaceAll(/[^a-zA-Z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "")
    .toLowerCase();
}

function getAssignmentName(
  match: MatchListItem,
  roleName: string,
  fallback = "Sin asignar",
) {
  const assignment = match.assignments.find((item) => item.role.name === roleName);
  return assignment?.person?.full_name ?? fallback;
}

function toExportRows(matches: MatchListItem[]): GridExportRow[] {
  return matches.map((match) => ({
    Dia: formatMatchDate(match.kickoff_at, match.timezone, "dd/MM/yyyy"),
    Produccion: getProductionModeLabel(match.production_mode) || "Sin definir",
    ID: match.production_code ?? "",
    Liga: match.competition ?? "",
    Partido: `${match.home_team} vs ${match.away_team}`,
    Hora: formatMatchDate(match.kickoff_at, match.timezone, "HH:mm"),
    Responsable:
      getAssignmentName(
        match,
        "Responsable",
        match.owner?.full_name ?? "Sin asignar",
      ),
    Realizador: getAssignmentName(match, "Realizador"),
    "Operador de Grafica": getAssignmentName(match, "Operador de Grafica"),
    "Camara 1": getAssignmentName(match, "Camara 1"),
    "Camara 2": getAssignmentName(match, "Camara 2"),
    "Camara 3": getAssignmentName(match, "Camara 3"),
    "Camara 4": getAssignmentName(match, "Camara 4"),
    "Camara 5": getAssignmentName(match, "Camara 5"),
    "Relatos/Comentarios":
      normalizeCommentaryPlan(match.commentary_plan) || "Sin definir",
    Relator: getAssignmentName(match, "Relator"),
    "Comentarista 1": getAssignmentName(match, "Comentario 1"),
    "Comentarista 2": getAssignmentName(match, "Comentario 2"),
    "Operador de Control": getAssignmentName(match, "Operador de Control"),
    "Soporte tecnico": getAssignmentName(match, "Soporte tecnico"),
    Transporte: match.transport?.trim() || "Sin definir",
    Observacion: match.notes?.trim() || "",
  }));
}

function buildGridExcelDocument(rows: GridExportRow[], periodLabel: string) {
  const headerRow = GRID_EXPORT_COLUMNS.map(
    (column) =>
      `<th style="border:1px solid #dbe4f0;background:#0f172a;color:#ffffff;padding:10px 12px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;text-align:left;">${escapeHtml(
        column.label,
      )}</th>`,
  ).join("");

  const bodyRows = rows
    .map((row, rowIndex) => {
      const background = rowIndex % 2 === 0 ? "#ffffff" : "#f8fafc";
      const cells = GRID_EXPORT_COLUMNS.map((column) => {
        const value = escapeHtml(row[column.key]);
        const forceText =
          column.label === "ID" ? "mso-number-format:'\\@';" : "";

        return `<td style="border:1px solid #dbe4f0;background:${background};padding:9px 12px;font-size:11px;color:#1f2937;vertical-align:top;${forceText}">${value || "&nbsp;"}</td>`;
      }).join("");

      return `<tr>${cells}</tr>`;
    })
    .join("");

  return `
    <html>
      <head>
        <meta charset="utf-8" />
      </head>
      <body style="font-family:Arial,sans-serif;background:#ffffff;padding:24px;">
        <div style="font-size:24px;font-weight:800;color:#0f172a;margin-bottom:6px;">Control de producción</div>
        <div style="font-size:12px;color:#64748b;margin-bottom:16px;">Periodo exportado: ${escapeHtml(periodLabel)}</div>
        <table style="border-collapse:collapse;width:100%;">
          <thead>
            <tr>${headerRow}</tr>
          </thead>
          <tbody>
            ${bodyRows}
          </tbody>
        </table>
      </body>
    </html>
  `.trim();
}

export function GridExportButton({
  matches,
  periodLabel,
}: GridExportButtonProps) {
  const [isExporting, setIsExporting] = useState(false);

  async function handleExport() {
    if (!matches.length || isExporting) {
      return;
    }

    setIsExporting(true);

    try {
      const rows = toExportRows(matches);
      const fileBaseName = [
        "produccion",
        sanitizeFileSegment(periodLabel || "periodo"),
      ]
        .filter(Boolean)
        .join("-");

      const excelDocument = buildGridExcelDocument(rows, periodLabel);

      downloadBlob(
        new Blob([excelDocument], {
          type: "application/vnd.ms-excel;charset=utf-8",
        }),
        `${fileBaseName}.xls`,
      );

      const [{ jsPDF }, { default: autoTable }] = await Promise.all([
        import("jspdf"),
        import("jspdf-autotable"),
      ]);

      const pdfDocument = new jsPDF({
        orientation: "landscape",
        unit: "pt",
        format: [595.28, 2600],
      });

      const pageWidth = pdfDocument.internal.pageSize.getWidth();
      const marginX = 18;
      const contentWidth = pageWidth - marginX * 2;
      let currentY = 28;

      pdfDocument.setFont("helvetica", "bold");
      pdfDocument.setFontSize(16);
      pdfDocument.setTextColor(15, 23, 42);
      pdfDocument.text("Control de producción", marginX, currentY);
      currentY += 18;

      pdfDocument.setFont("helvetica", "normal");
      pdfDocument.setFontSize(10);
      pdfDocument.setTextColor(100, 116, 139);
      pdfDocument.text(`Periodo exportado: ${periodLabel}`, marginX, currentY);
      currentY += 18;

      autoTable(pdfDocument, {
        startY: currentY,
        head: [GRID_EXPORT_COLUMNS.map((column) => column.label)],
        body: rows.map((row) =>
          GRID_EXPORT_COLUMNS.map((column) => row[column.key]),
        ),
        margin: { left: marginX, right: marginX },
        styles: {
          fontSize: 8,
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
          fontSize: 8,
          halign: "left",
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252],
        },
        bodyStyles: {
          valign: "top",
        },
        tableWidth: contentWidth,
        theme: "grid",
      });

      pdfDocument.save(`${fileBaseName}.pdf`);
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleExport()}
      disabled={!matches.length || isExporting}
      aria-label={isExporting ? "Exportando jornada" : "Descargar Excel y PDF"}
      title={isExporting ? "Exportando jornada" : "Descargar Excel y PDF"}
      className="inline-flex size-[52px] items-center justify-center rounded-[var(--panel-radius)] bg-[#7c3aed] text-white shadow-[0_14px_28px_rgba(124,58,237,0.22)] transition hover:bg-[#6d28d9] disabled:cursor-not-allowed disabled:opacity-60"
    >
      <Download className="size-4" />
    </button>
  );
}
