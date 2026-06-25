"use client";

import { useState } from "react";
import { Download } from "lucide-react";

import {
  GRID_EXPORT_COLUMNS,
  type GridExportRow,
} from "@/lib/grid-table";

type GridExportButtonProps = {
  rows: GridExportRow[];
  periodLabel: string;
};

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

function buildGridExcelDocument(rows: GridExportRow[], periodLabel: string) {
  const headerRow = GRID_EXPORT_COLUMNS.map(
    (column) =>
      `<th style="border:1px solid #dbe4f0;background:#E31B23;color:#ffffff;padding:10px 12px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;text-align:left;">${escapeHtml(
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
        <div style="font-size:24px;font-weight:800;color:#E31B23;margin-bottom:6px;">Control de producción</div>
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
  rows,
  periodLabel,
}: GridExportButtonProps) {
  const [isExporting, setIsExporting] = useState(false);

  async function handleExport() {
    if (!rows.length || isExporting) {
      return;
    }

    setIsExporting(true);

    try {
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
      disabled={!rows.length || isExporting}
      aria-label={isExporting ? "Exportando jornada" : "Descargar Excel y PDF"}
      title={isExporting ? "Exportando jornada" : "Descargar Excel y PDF"}
      className="inline-flex size-[52px] items-center justify-center rounded-[var(--panel-radius)] bg-[var(--accent)] text-white shadow-[var(--shadow-lift)] transition hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-60"
    >
      <Download className="size-4" />
    </button>
  );
}
