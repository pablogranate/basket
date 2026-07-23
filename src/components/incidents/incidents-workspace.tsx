"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  ArrowUpDown,
  CheckCircle2,
  CircleX,
  Cpu,
  ChevronDown,
  ChevronUp,
  Clock3,
  Download,
  Eye,
  FileText,
  Gauge,
  GripVertical,
  History,
  Image as ImageIcon,
  MapPin,
  Palette,
  ScanText,
  Sparkles,
  Upload,
  Wifi,
  X,
} from "lucide-react";

import { SectionAiAssistant } from "@/components/ai/section-ai-assistant";
import { LeagueLogoMarkClient } from "@/components/league-logo-mark-client";
import { SectionPageHeader } from "@/components/layout/section-page-header";
import { MatchSummaryCell } from "@/components/shared/match-summary-cell";
import { badgeBaseClassName } from "@/components/ui/badge";
import { HoverAvatarBadge } from "@/components/ui/hover-avatar-badge";
import { SeverityBadge } from "@/components/ui/severity-badge";
import { SectionTableCard } from "@/components/ui/section-table-card";
import { UnderlineTabs } from "@/components/ui/underline-tabs";
import { ToolbarIconButton } from "@/components/ui/toolbar-icon-button";
import { ToolbarSearchField } from "@/components/ui/toolbar-search-field";
import type {
  IncidentProblem,
  IncidentRecord,
} from "@/lib/incidents";
import { getTeamLeagueColorSet } from "@/lib/team-directory";
import { cn } from "@/lib/utils";

type IncidentAttachment = {
  fileName: string;
  fileSizeLabel: string;
  previewUrl?: string;
};

type IncidentEvidenceState = {
  pingAttachment?: IncidentAttachment | null;
  gpuAttachment?: IncidentAttachment | null;
  venueImages?: IncidentAttachment[];
};

type IncidentEvidencePreview = {
  title: string;
  fileName: string;
  src: string;
};

type IncidentSortKey =
  | "league"
  | "id"
  | "date"
  | "match"
  | "severity"
  | "operator"
  | "streamer"
  | "issue"
  | "updated";
type SortDirection = "asc" | "desc";
type IncidentControlColumn =
  | "league"
  | "id"
  | "date"
  | "match"
  | "severity"
  | "operator"
  | "streamer"
  | "issue"
  | "updated";

const INCIDENT_CONTROL_COLUMNS_STORAGE_KEY =
  "basket-production.incidents.control-columns";
const DEFAULT_INCIDENT_CONTROL_COLUMNS: IncidentControlColumn[] = [
  "league",
  "id",
  "date",
  "match",
  "severity",
  "operator",
  "streamer",
  "issue",
  "updated",
];
const INCIDENT_CONTROL_COLUMN_SORT_KEY: Record<
  IncidentControlColumn,
  IncidentSortKey
> = {
  league: "league",
  id: "id",
  date: "date",
  match: "match",
  severity: "severity",
  operator: "operator",
  streamer: "streamer",
  issue: "issue",
  updated: "updated",
};
const INCIDENT_CONTROL_COLUMN_WIDTH_WEIGHT: Record<IncidentControlColumn, number> = {
  league: 0.95,
  id: 1.05,
  date: 0.95,
  match: 3,
  severity: 1.15,
  operator: 1.5,
  streamer: 1.5,
  issue: 1,
  updated: 0.8,
};
const INCIDENT_CONTROL_COMPACT_COLUMN_WIDTH_WEIGHT: Record<
  IncidentControlColumn,
  number
> = {
  league: 0.8,
  id: 0.95,
  date: 0.85,
  match: 2.9,
  severity: 1,
  operator: 1.05,
  streamer: 1.05,
  issue: 0.8,
  updated: 0.75,
};

function formatIncidentExportDate(value: string) {
  const date = parseIncidentEventDate(value);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear());

  return `${day}/${month}/${year}`;
}

function formatIncidentExportBoolean(value: boolean) {
  return value ? "SI" : "NO";
}

function formatIncidentExportCheck(value: string) {
  return getBinaryIncidentCheckState(value).label === "Sí" ? "SI" : "NO";
}

function getIncidentProblemValue(incident: IncidentRecord, label: string) {
  return formatIncidentExportBoolean(
    incident.problems.some((problem) => problem.label === label && problem.active),
  );
}

const INCIDENT_EXPORT_COLUMNS = [
  {
    label: "ID",
    value: (incident: IncidentRecord) => incident.id,
  },
  {
    label: "Liga",
    value: (incident: IncidentRecord) => getIncidentLeagueLabel(incident.competition),
  },
  {
    label: "Fecha",
    value: (incident: IncidentRecord) => formatIncidentExportDate(incident.eventDate),
  },
  {
    label: "Hora",
    value: (incident: IncidentRecord) => getIncidentTimeLabel(incident.updatedAt),
  },
  {
    label: "Local",
    value: (incident: IncidentRecord) =>
      splitIncidentMatchLabel(incident.matchLabel).homeTeam,
  },
  {
    label: "Visitante",
    value: (incident: IncidentRecord) =>
      splitIncidentMatchLabel(incident.matchLabel).awayTeam,
  },
  {
    label: "Operador Control",
    value: (incident: IncidentRecord) => incident.operatorControl,
  },
  {
    label: "Streamer",
    value: (incident: IncidentRecord) => incident.streamer,
  },
  {
    label: "Gravedad",
    value: (incident: IncidentRecord) => incident.severity,
  },
  {
    label: "Observaciones Técnicas",
    value: (incident: IncidentRecord) => incident.observations,
  },
  {
    label: "Observaciones Edilicias",
    value: () => "",
  },
  {
    label: "Observaciones Generales",
    value: (incident: IncidentRecord) => incident.mainIssue,
  },
  {
    label: "OTRO",
    value: () => "-",
  },
  {
    label: "ST",
    value: () => "-",
  },
  {
    label: "CLUB",
    value: () => "-",
  },
  {
    label: "Speedtest",
    value: (incident: IncidentRecord) => incident.speedtest,
  },
  {
    label: "PING",
    value: (incident: IncidentRecord) => incident.ping,
  },
  {
    label: "GPU",
    value: (incident: IncidentRecord) => incident.gpuLoad,
  },
  {
    label: "Hora Prueba",
    value: (incident: IncidentRecord) => incident.testTime,
  },
  {
    label: "Prueba",
    value: (incident: IncidentRecord) => formatIncidentExportCheck(incident.testCheck),
  },
  {
    label: "Inicio",
    value: (incident: IncidentRecord) => formatIncidentExportCheck(incident.startCheck),
  },
  {
    label: "Gráfica",
    value: (incident: IncidentRecord) => formatIncidentExportCheck(incident.graphicsCheck),
  },
  {
    label: "Problema Internet",
    value: (incident: IncidentRecord) => getIncidentProblemValue(incident, "Problema Internet"),
  },
  {
    label: "Problema IMG",
    value: (incident: IncidentRecord) => getIncidentProblemValue(incident, "Problema IMG"),
  },
  {
    label: "OCR",
    value: (incident: IncidentRecord) => getIncidentProblemValue(incident, "OCR"),
  },
  {
    label: "Overlays (GES)",
    value: (incident: IncidentRecord) => getIncidentProblemValue(incident, "Overlays (GES)"),
  },
  {
    label: "Tipo de transmisión",
    value: (incident: IncidentRecord) => incident.transmissionType,
  },
  {
    label: "Envíos de señal",
    value: (incident: IncidentRecord) => incident.signalDelivery,
  },
  {
    label: "Imágenes",
    value: (incident: IncidentRecord) =>
      formatIncidentExportBoolean((incident.venueImages?.length ?? 0) > 0),
  },
  {
    label: "Apto Lineal",
    value: (incident: IncidentRecord) => formatIncidentExportBoolean(incident.aptoLineal),
  },
] as const;

function normalizeIncidentControlColumns(
  value: unknown,
): IncidentControlColumn[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const nextColumns = value.filter((item): item is IncidentControlColumn =>
    DEFAULT_INCIDENT_CONTROL_COLUMNS.includes(item as IncidentControlColumn),
  );

  if (
    nextColumns.length !== DEFAULT_INCIDENT_CONTROL_COLUMNS.length ||
    new Set(nextColumns).size !== DEFAULT_INCIDENT_CONTROL_COLUMNS.length
  ) {
    return null;
  }

  return nextColumns;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function getIncidentLeagueLabel(competition: string) {
  return competition.split(/\s[-•]\s/)[0]?.trim() || competition;
}

function getIncidentTimeLabel(updatedAt: string) {
  const match = updatedAt.match(/\b(\d{1,2}:\d{2})/);
  return match?.[1] ?? updatedAt;
}

function parseIncidentEventDate(value: string) {
  const normalized = value.trim().toLowerCase();
  const match = normalized.match(/^(\d{1,2})\s+([a-záéíóúñ]+)\s+(\d{4})$/i);

  if (!match) {
    return new Date(value);
  }

  const [, day, monthLabel, year] = match;
  const monthIndex = {
    enero: 0,
    febrero: 1,
    marzo: 2,
    abril: 3,
    mayo: 4,
    junio: 5,
    julio: 6,
    agosto: 7,
    septiembre: 8,
    octubre: 9,
    noviembre: 10,
    diciembre: 11,
  }[monthLabel];

  return new Date(Number(year), monthIndex ?? 0, Number(day));
}

function formatCompactIncidentDate(value: string) {
  const date = parseIncidentEventDate(value);
  const day = String(date.getDate()).padStart(2, "0");
  const months = [
    "ENE",
    "FEB",
    "MAR",
    "ABR",
    "MAY",
    "JUN",
    "JUL",
    "AGO",
    "SEP",
    "OCT",
    "NOV",
    "DIC",
  ] as const;

  return `${day} ${months[date.getMonth()] ?? ""}`;
}

function splitIncidentMatchLabel(matchLabel: string) {
  const [homeTeam, awayTeam] = matchLabel.split(/\s+vs\s+/i);

  return {
    homeTeam: homeTeam?.trim() || matchLabel,
    awayTeam: awayTeam?.trim() || "",
  };
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function sanitizeFileSegment(value: string) {
  return value
    .normalize("NFD")
    .replaceAll(/[\u0300-\u036f]/g, "")
    .replaceAll(/[^a-zA-Z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "")
    .toLowerCase();
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

function hexToRgb(hex: string) {
  const normalized = hex.replace("#", "");
  const safeHex =
    normalized.length === 3
      ? normalized
          .split("")
          .map((value) => `${value}${value}`)
          .join("")
      : normalized;
  const value = Number.parseInt(safeHex, 16);

  if (Number.isNaN(value)) {
    return { red: 100, green: 116, blue: 139 };
  }

  return {
    red: (value >> 16) & 255,
    green: (value >> 8) & 255,
    blue: value & 255,
  };
}

function getIncidentLeagueAccentColor(league: string) {
  return getTeamLeagueColorSet(league).accent;
}

function groupIncidentsByLeague(incidents: IncidentRecord[]) {
  const groups = new Map<string, IncidentRecord[]>();

  incidents.forEach((incident) => {
    const league = getIncidentLeagueLabel(incident.competition);
    const currentGroup = groups.get(league) ?? [];
    currentGroup.push(incident);
    groups.set(league, currentGroup);
  });

  return Array.from(groups.entries()).map(([league, items]) => ({
    league,
    items,
  }));
}

function buildIncidentsExcelDocument(
  incidentGroups: ReturnType<typeof groupIncidentsByLeague>,
) {
  const documentTitle =
    incidentGroups.length === 1
      ? incidentGroups[0]?.league ?? "Incidencias"
      : "Todas las incidencias";
  const headerRow = INCIDENT_EXPORT_COLUMNS.map(
    (column) =>
      `<th style="border:1px solid #dbe4f0;background:#0f172a;color:#ffffff;padding:10px 12px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;text-align:left;">${escapeHtml(
        column.label,
      )}</th>`,
  ).join("");

  const sections = incidentGroups
    .map(({ league, items }) => {
      const accent = getIncidentLeagueAccentColor(league);
      const leagueHeader =
        incidentGroups.length > 1
          ? `
          <tr>
            <td colspan="${INCIDENT_EXPORT_COLUMNS.length}" style="border:1px solid ${accent};background:${accent};color:#ffffff;padding:12px 14px;font-size:14px;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;">
              ${escapeHtml(league)}
            </td>
          </tr>
        `
          : "";
      const rows = items
        .map((incident, rowIndex) => {
          const background = rowIndex % 2 === 0 ? "#ffffff" : "#f8fafc";
          const cells = INCIDENT_EXPORT_COLUMNS.map((column) => {
            const value = escapeHtml(column.value(incident));
            const forceText = column.label === "ID" ? "mso-number-format:'\\@';" : "";

            return `<td style="border:1px solid #dbe4f0;background:${background};padding:9px 12px;font-size:12px;color:#0f172a;vertical-align:top;${forceText}">${value}</td>`;
          }).join("");

          return `<tr>${cells}</tr>`;
        })
        .join("");

      return `
        <table style="width:100%;border-collapse:collapse;margin:0 0 20px 0;font-family:Arial,sans-serif;">
          ${leagueHeader}
          <tr>${headerRow}</tr>
          ${rows}
        </table>
      `;
    })
    .join("");

  return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
  <head>
    <meta charset="utf-8" />
    <meta name="ProgId" content="Excel.Sheet" />
    <title>${escapeHtml(documentTitle)}</title>
  </head>
  <body style="margin:16px;background:#f8fafc;font-family:Arial,sans-serif;">
    <div style="margin-bottom:16px;">
      <div style="font-size:18px;font-weight:800;color:#0f172a;">${escapeHtml(documentTitle)}</div>
    </div>
    ${sections}
  </body>
</html>`;
}

function getIncidentSeverityOrder(severity: string) {
  switch (severity) {
    case "Crítica":
      return 4;
    case "Alta":
      return 3;
    case "Media":
      return 2;
    case "Baja":
      return 1;
    default:
      return 0;
  }
}

function getIncidentUpdatedOrder(updatedAt: string) {
  const [hours, minutes] = getIncidentTimeLabel(updatedAt)
    .split(":")
    .map((value) => Number(value));

  return (hours || 0) * 60 + (minutes || 0);
}

function SortHeader({
  label,
  active,
  direction,
  onClick,
  align = "left",
}: {
  label: string;
  active: boolean;
  direction: SortDirection;
  onClick: () => void;
  align?: "left" | "right";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 uppercase transition hover:text-[#617187]",
        align === "right" && "ml-auto",
      )}
    >
      <span>{label}</span>
      {active ? (
        direction === "asc" ? (
          <ChevronUp className="size-3.5" />
        ) : (
          <ChevronDown className="size-3.5" />
        )
      ) : (
        <ArrowUpDown className="size-3.5 opacity-60" />
      )}
    </button>
  );
}

function getIncidentRowTone(severity: string) {
  switch (severity) {
    case "Crítica":
      return {
        active: "bg-[#fbf5ff] shadow-[inset_4px_0_0_0_#a12ad6]",
        hover: "hover:bg-[#fdf9ff]",
      };
    case "Alta":
      return {
        active: "bg-[#fff4f6] shadow-[inset_4px_0_0_0_#e63b5b]",
        hover: "hover:bg-[#fff9fa]",
      };
    case "Media":
      return {
        active: "bg-[#fffcef] shadow-[inset_4px_0_0_0_#e8c24a]",
        hover: "hover:bg-[#fffef8]",
      };
    case "Baja":
      return {
        active: "bg-[#fffdf7] shadow-[inset_4px_0_0_0_#e8c76a]",
        hover: "hover:bg-[#fffefa]",
      };
    default:
      return {
        active: "bg-[#eefaf3] shadow-[inset_4px_0_0_0_#10b981]",
        hover: "hover:bg-[#f6fcf8]",
      };
  }
}

function getIncidentSeverityPanelTone(severity: string) {
  switch (severity) {
    case "Crítica":
      return {
        panel: "border-[#edd7fb] bg-[#fbf5ff]",
        label: "text-[#a12ad6]",
        value: "text-[#7f1fb2]",
      };
    case "Alta":
      return {
        panel: "border-[#ffd6df] bg-[#fff4f6]",
        label: "text-[#cf2246]",
        value: "text-[#b51f3e]",
      };
    case "Media":
      return {
        panel: "border-[#f4e1a6] bg-[#fffdf2]",
        label: "text-[#b78611]",
        value: "text-[#9b730b]",
      };
    case "Baja":
      return {
        panel: "border-[#f3e7b8] bg-[#fffef8]",
        label: "text-[#b79734]",
        value: "text-[#8f7a2f]",
      };
    default:
      return {
        panel: "border-[#cde9d7] bg-[#f4fcf7]",
        label: "text-[#17945b]",
        value: "text-[#167447]",
      };
  }
}

function getIncidentActivityTone(tone?: "accent" | "warning" | "neutral" | "success") {
  switch (tone) {
    case "accent":
      return {
        dot: "bg-[var(--accent)] ring-[rgba(230,18,56,0.16)]",
        badge: "bg-[#fff3f6] text-[var(--accent)]",
      };
    case "warning":
      return {
        dot: "bg-[#f59e0b] ring-[rgba(245,158,11,0.16)]",
        badge: "bg-[#fff7ed] text-[#d97706]",
      };
    case "success":
      return {
        dot: "bg-[#16a34a] ring-[rgba(22,163,74,0.16)]",
        badge: "bg-[#f0fdf4] text-[#15803d]",
      };
    default:
      return {
        dot: "bg-[#cfd6df] ring-[rgba(148,163,184,0.16)]",
        badge: "bg-[#f4f7fb] text-[#617187]",
      };
  }
}

function ProblemPill({ problem }: { problem: IncidentProblem }) {
  return (
    <div
      className={cn(
        "panel-radius flex min-h-[84px] items-center gap-3.5 border px-4 py-3",
        problem.active
          ? "border-[#ffd8df] bg-[#fff3f6]"
          : "border-[#e7eaef] bg-white",
      )}
    >
      <span
        className={cn(
          "inline-flex size-10 shrink-0 items-center justify-center rounded-full",
          problem.active ? "bg-[#ffe7ed] text-[var(--accent)]" : "bg-[#f4f7fb] text-[#b0b8c5]",
        )}
      >
        {problem.label.includes("Internet") ? (
          <Wifi className="size-4" />
        ) : problem.label.includes("OCR") ? (
          <ScanText className="size-4" />
        ) : problem.label.includes("Overlays") ? (
          <Sparkles className="size-4" />
        ) : problem.label.includes("IMG") ? (
          <ImageIcon className="size-4" />
        ) : problem.label.includes("Gráfica") ? (
          <Palette className="size-4" />
        ) : (
          <AlertTriangle className="size-4" />
        )}
      </span>
      <span
        className={cn(
          "text-sm font-semibold leading-tight",
          problem.active ? "text-[#9f1633]" : "text-[#70819b]",
        )}
      >
        {problem.label}
      </span>
    </div>
  );
}

function getProblemMeta(label: string) {
  if (label.includes("Internet")) {
    return { label: "INTERNET", Icon: Wifi };
  }

  if (label.includes("OCR")) {
    return { label: "OCR", Icon: ScanText };
  }

  if (label.includes("Overlays")) {
    return { label: "GES", Icon: Sparkles };
  }

  if (label.includes("IMG")) {
    return { label: "IMG", Icon: ImageIcon };
  }

  if (label.includes("Gráfica")) {
    return { label: "GRÁFICA", Icon: Palette };
  }

  return { label: label.toUpperCase(), Icon: AlertTriangle };
}

function getIncidentIssueSortValue(incident: IncidentRecord) {
  const activeLabels = incident.problems
    .filter((problem) => problem.active)
    .map((problem) => getProblemMeta(problem.label).label)
    .join(" ");

  return activeLabels || "SIN MARCAS";
}

function buildIncidentAttachmentPreview(
  title: string,
  fileName: string,
  accentColor: string,
) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900" fill="none">
      <rect width="1200" height="900" rx="48" fill="#F8FAFC"/>
      <rect x="56" y="56" width="1088" height="788" rx="36" fill="white" stroke="#E2E8F0" stroke-width="4"/>
      <rect x="96" y="96" width="260" height="54" rx="27" fill="${accentColor}" fill-opacity="0.12"/>
      <text x="128" y="130" fill="${accentColor}" font-size="26" font-family="Arial, sans-serif" font-weight="700">${title}</text>
      <text x="96" y="236" fill="#0F172A" font-size="56" font-family="Arial, sans-serif" font-weight="700">Vista asociada</text>
      <text x="96" y="302" fill="#64748B" font-size="30" font-family="Arial, sans-serif">${fileName}</text>
      <rect x="96" y="368" width="1008" height="356" rx="28" fill="${accentColor}" fill-opacity="0.08" stroke="${accentColor}" stroke-opacity="0.22" stroke-width="3"/>
      <circle cx="214" cy="484" r="64" fill="${accentColor}" fill-opacity="0.14"/>
      <path d="M180 516h68l26-34 32 42 44-60 70 52H180z" fill="${accentColor}" fill-opacity="0.85"/>
      <circle cx="264" cy="450" r="18" fill="${accentColor}" fill-opacity="0.9"/>
      <text x="96" y="790" fill="#94A3B8" font-size="24" font-family="Arial, sans-serif">Adjunto disponible para revisión operativa</text>
    </svg>
  `;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function getIncidentAttachmentPreviewSource(
  attachment: IncidentAttachment | null | undefined,
  title: string,
  accentColor: string,
) {
  if (!attachment) {
    return null;
  }

  return (
    attachment.previewUrl ??
    buildIncidentAttachmentPreview(title, attachment.fileName, accentColor)
  );
}

function getBinaryIncidentCheckState(value: string) {
  const normalizedValue = value.trim().toLowerCase();
  const negativeTerms = [
    "incompleta",
    "parcial",
    "incidencia",
    "demora",
    "seguimiento",
    "manual",
    "reinici",
  ];
  const positiveTerms = ["ok", "normal", "estable", "sin novedad", "completa"];

  const isNegative = negativeTerms.some((term) => normalizedValue.includes(term));
  const isPositive = positiveTerms.some((term) => normalizedValue.includes(term));

  if (!isNegative && isPositive) {
    return {
      label: "Sí",
      Icon: CheckCircle2,
      iconClassName: "text-[#12b76a]",
      iconWrapClassName: "bg-[#dcfce7]",
      panelClassName: "border-[#d7eadf] bg-[#f3fcf6]",
      labelClassName: "text-[#178a56]",
    };
  }

  return {
    label: "No",
    Icon: CircleX,
    iconClassName: "text-[#f04461]",
    iconWrapClassName: "bg-[#ffe7ed]",
    panelClassName: "border-[#ffd8df] bg-[#fff3f6]",
    labelClassName: "text-[#b42318]",
  };
}

function ActiveProblemSummary({ problems }: { problems: IncidentProblem[] }) {
  const activeProblems = problems.filter((problem) => problem.active);

  if (activeProblems.length === 0) {
    return (
      <span
        title="SIN MARCAS"
        className="inline-flex size-8 items-center justify-center rounded-full border border-[#d7eadf] bg-[#f3fcf6] text-[#178a56]"
      >
        <CheckCircle2 className="size-4" />
      </span>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {activeProblems.map((problem) => {
        const { label, Icon } = getProblemMeta(problem.label);

        return (
          <span
            key={problem.label}
            title={label}
            className="inline-flex size-8 items-center justify-center rounded-full border border-[#ffd8df] bg-[#fff3f6] text-[var(--accent)]"
          >
            <Icon className="size-4" />
          </span>
        );
      })}
    </div>
  );
}

export function IncidentsWorkspace({
  incidents,
  hasGeminiKey,
  embedded = false,
  headerActionsPortalTarget = null,
  drawerPortalTarget = null,
  onSelectedIdChange,
}: {
  incidents: IncidentRecord[];
  hasGeminiKey: boolean;
  embedded?: boolean;
  headerActionsPortalTarget?: HTMLElement | null;
  drawerPortalTarget?: HTMLElement | null;
  onSelectedIdChange?: (selectedId: string | null) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerTab, setDrawerTab] = useState<
    "details" | "activity" | "notes" | "images"
  >("details");
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<IncidentSortKey>("severity");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [columnOrder, setColumnOrder] = useState<IncidentControlColumn[]>(() => {
    if (typeof window === "undefined") {
      return DEFAULT_INCIDENT_CONTROL_COLUMNS;
    }

    try {
      const parsedColumns = normalizeIncidentControlColumns(
        JSON.parse(
          window.localStorage.getItem(INCIDENT_CONTROL_COLUMNS_STORAGE_KEY) ??
            "null",
        ),
      );

      return parsedColumns ?? DEFAULT_INCIDENT_CONTROL_COLUMNS;
    } catch {
      window.localStorage.removeItem(INCIDENT_CONTROL_COLUMNS_STORAGE_KEY);
      return DEFAULT_INCIDENT_CONTROL_COLUMNS;
    }
  });
  const [draggedColumn, setDraggedColumn] =
    useState<IncidentControlColumn | null>(null);
  const [dragOverColumn, setDragOverColumn] =
    useState<IncidentControlColumn | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [evidenceByIncident, setEvidenceByIncident] = useState<
    Record<string, IncidentEvidenceState>
  >({});
  const [evidencePreview, setEvidencePreview] =
    useState<IncidentEvidencePreview | null>(null);

  function handleSort(nextSortBy: IncidentSortKey) {
    if (sortBy === nextSortBy) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortBy(nextSortBy);
    setSortDirection(nextSortBy === "severity" || nextSortBy === "updated" ? "desc" : "asc");
  }

  function handleColumnDragStart(column: IncidentControlColumn) {
    setDraggedColumn(column);
    setDragOverColumn(column);
  }

  function handleColumnDragOver(column: IncidentControlColumn) {
    if (draggedColumn && draggedColumn !== column) {
      setDragOverColumn(column);
    }
  }

  function handleColumnDrop(column: IncidentControlColumn) {
    if (!draggedColumn || draggedColumn === column) {
      setDraggedColumn(null);
      setDragOverColumn(null);
      return;
    }

    setColumnOrder((current) => {
      const next = [...current];
      const draggedIndex = next.indexOf(draggedColumn);
      const targetIndex = next.indexOf(column);

      if (draggedIndex === -1 || targetIndex === -1) {
        return current;
      }

      next.splice(draggedIndex, 1);
      next.splice(targetIndex, 0, draggedColumn);
      return next;
    });

    setDraggedColumn(null);
    setDragOverColumn(null);
  }

  function handleColumnDragEnd() {
    setDraggedColumn(null);
    setDragOverColumn(null);
  }

  useEffect(() => {
    window.localStorage.setItem(
      INCIDENT_CONTROL_COLUMNS_STORAGE_KEY,
      JSON.stringify(columnOrder),
    );
  }, [columnOrder]);

  const [lastSelectedId, setLastSelectedId] = useState(selectedId);

  if (selectedId !== lastSelectedId) {
    setLastSelectedId(selectedId);
    setEvidencePreview(null);
  }

  useEffect(() => {
    onSelectedIdChange?.(selectedId);
  }, [onSelectedIdChange, selectedId]);

  const filteredIncidents = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return incidents;
    }

    return incidents.filter((incident) =>
      [
        incident.id,
        incident.matchCode,
        incident.matchLabel,
        incident.competition,
        incident.operatorControl,
        incident.streamer,
        incident.mainIssue,
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [incidents, query]);

  const sortedIncidents = useMemo(() => {
    const nextItems = [...filteredIncidents];

    nextItems.sort((left, right) => {
      const directionFactor = sortDirection === "asc" ? 1 : -1;

      const comparison =
        sortBy === "league"
          ? getIncidentLeagueLabel(left.competition).localeCompare(
              getIncidentLeagueLabel(right.competition),
              "es",
              { sensitivity: "base" },
            )
          : sortBy === "id"
            ? left.id.localeCompare(right.id, "es", {
                numeric: true,
                sensitivity: "base",
              })
            : sortBy === "date"
              ? parseIncidentEventDate(left.eventDate).getTime() -
                parseIncidentEventDate(right.eventDate).getTime()
            : sortBy === "match"
              ? left.matchLabel.localeCompare(right.matchLabel, "es")
              : sortBy === "severity"
                ? getIncidentSeverityOrder(left.severity) - getIncidentSeverityOrder(right.severity)
                : sortBy === "operator"
                  ? left.operatorControl.localeCompare(right.operatorControl, "es")
                  : sortBy === "streamer"
                    ? left.streamer.localeCompare(right.streamer, "es")
                    : sortBy === "issue"
                      ? getIncidentIssueSortValue(left).localeCompare(
                          getIncidentIssueSortValue(right),
                          "es",
                        )
                      : getIncidentUpdatedOrder(left.updatedAt) -
                        getIncidentUpdatedOrder(right.updatedAt);

      return comparison * directionFactor;
    });

    return nextItems;
  }, [filteredIncidents, sortBy, sortDirection]);

  const selectedIncident =
    sortedIncidents.find((incident) => incident.id === selectedId) ?? null;
  const selectedEvidence = selectedIncident ? evidenceByIncident[selectedIncident.id] ?? {} : {};
  const resolvedSpeedtest = selectedIncident?.speedtest ?? "";
  const resolvedPing = selectedIncident?.ping ?? "";
  const selectedPingAttachment =
    selectedEvidence.pingAttachment ?? selectedIncident?.pingAttachment ?? null;
  const selectedGpuAttachment =
    selectedEvidence.gpuAttachment ?? selectedIncident?.gpuAttachment ?? null;
  const selectedSpeedtestAttachment = selectedIncident?.speedtestAttachment ?? null;
  const selectedVenueImages =
    selectedEvidence.venueImages ?? selectedIncident?.venueImages ?? [];
  const selectedSeverityTone = selectedIncident
    ? getIncidentSeverityPanelTone(selectedIncident.severity)
    : null;
  const selectedIncidentTeams = selectedIncident
    ? splitIncidentMatchLabel(selectedIncident.matchLabel)
    : null;
  const selectedTestCheck = selectedIncident
    ? getBinaryIncidentCheckState(selectedIncident.testCheck)
    : null;
  const selectedStartCheck = selectedIncident
    ? getBinaryIncidentCheckState(selectedIncident.startCheck)
    : null;
  const selectedGraphicsCheck = selectedIncident
    ? getBinaryIncidentCheckState(selectedIncident.graphicsCheck)
    : null;
  const selectedSpeedtestPreviewSrc = getIncidentAttachmentPreviewSource(
    selectedSpeedtestAttachment,
    "Speedtest",
    "#E61238",
  );
  const selectedPingPreviewSrc = getIncidentAttachmentPreviewSource(
    selectedPingAttachment,
    "Ping",
    "#0F766E",
  );
  const selectedGpuPreviewSrc = getIncidentAttachmentPreviewSource(
    selectedGpuAttachment,
    "GPU",
    "#7C3AED",
  );

  function handleVenueImagesChange(incident: IncidentRecord, files: FileList | null) {
    if (!files?.length) {
      return;
    }

    setEvidenceByIncident((current) => ({
      ...current,
      [incident.id]: {
        ...current[incident.id],
        venueImages: Array.from(files).map((file) => ({
          fileName: file.name,
          fileSizeLabel: formatBytes(file.size),
          previewUrl: URL.createObjectURL(file),
        })),
      },
    }));
  }

  function openEvidencePreview(
    title: string,
    attachment: IncidentAttachment | null | undefined,
    src: string | null,
  ) {
    if (!attachment || !src) {
      return;
    }

    setEvidencePreview({
      title,
      fileName: attachment.fileName,
      src,
    });
  }

  const metrics = useMemo(() => {
    const total = filteredIncidents.length;
    const critical = filteredIncidents.filter(
      (incident) => incident.severity === "Crítica",
    ).length;
    const mediumHigh = filteredIncidents.filter((incident) =>
      ["Alta", "Media"].includes(incident.severity),
    ).length;
    const affectedMatches = new Set(
      filteredIncidents.map((incident) => incident.matchCode),
    ).size;
    const competitionCount = new Set(
      filteredIncidents.map((incident) => incident.competition),
    ).size;

    return {
      total,
      critical,
      mediumHigh,
      affectedMatches,
      competitionCount,
      affectedMatchesPercent: total ? Math.round((affectedMatches / total) * 100) : 0,
      criticalPercent: total ? Math.round((critical / total) * 100) : 0,
      mediumHighPercent: total ? Math.round((mediumHigh / total) * 100) : 0,
    };
  }, [filteredIncidents]);
  const aiContext = useMemo(
    () =>
      filteredIncidents.map((incident) => ({
        id: incident.id,
        partido: incident.matchLabel,
        competencia: incident.competition,
        gravedad: incident.severity,
        operador_control: incident.operatorControl,
        streamer: incident.streamer,
        problema_principal: incident.mainIssue,
        prueba: incident.testCheck,
        inicio: incident.startCheck,
        grafica: incident.graphicsCheck,
        hora_prueba: incident.testTime,
        speedtest: incident.speedtest,
        ping: incident.ping,
        gpu: incident.gpuLoad,
        sede: incident.venue,
        tipo_transmision: incident.transmissionType,
        envios_senal: incident.signalDelivery,
        apto_lineal: incident.aptoLineal ? "Sí" : "No",
        overlays: incident.problems.find((problem) => problem.label === "Overlays (GES)")?.active
          ? "Sí"
          : "No",
        actualizado: incident.updatedAt,
      })),
    [filteredIncidents],
  );

  async function exportVisibleIncidents(sourceIncidents: IncidentRecord[]) {
    if (!sourceIncidents.length || isExporting) {
      return;
    }

    setIsExporting(true);

    try {
      const incidentGroups = groupIncidentsByLeague(sourceIncidents);
      const documentTitle =
        incidentGroups.length === 1
          ? incidentGroups[0]?.league ?? "Incidencias"
          : "Todas las incidencias";
      const fileBaseName = [
        "incidencias",
        sanitizeFileSegment("visibles"),
      ].join("-");

      const excelDocument = buildIncidentsExcelDocument(incidentGroups);

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
        format: "a3",
      });
      const pageWidth = pdfDocument.internal.pageSize.getWidth();
      const pageHeight = pdfDocument.internal.pageSize.getHeight();
      const marginX = 32;
      const contentWidth = pageWidth - marginX * 2;
      let currentY = 32;

      pdfDocument.setFont("helvetica", "bold");
      pdfDocument.setFontSize(16);
      pdfDocument.setTextColor(15, 23, 42);
      pdfDocument.text(documentTitle, marginX, currentY);
      currentY += 20;

      incidentGroups.forEach(({ league, items }, index) => {
        if (index > 0 && currentY > pageHeight - 160) {
          pdfDocument.addPage();
          currentY = 32;
        }

        if (incidentGroups.length > 1) {
          const accent = hexToRgb(getIncidentLeagueAccentColor(league));
          pdfDocument.setFillColor(accent.red, accent.green, accent.blue);
          pdfDocument.rect(marginX, currentY, contentWidth, 24, "F");
          pdfDocument.setFont("helvetica", "bold");
          pdfDocument.setFontSize(11);
          pdfDocument.setTextColor(255, 255, 255);
          pdfDocument.text(league, marginX + 10, currentY + 16);
        }

        autoTable(pdfDocument, {
          startY: currentY + (incidentGroups.length > 1 ? 24 : 0),
          margin: { left: marginX, right: marginX },
          head: [INCIDENT_EXPORT_COLUMNS.map((column) => column.label)],
          body: items.map((incident) =>
            INCIDENT_EXPORT_COLUMNS.map((column) => column.value(incident)),
          ),
          theme: "grid",
          styles: {
            font: "helvetica",
            fontSize: 6,
            cellPadding: 3,
            textColor: [15, 23, 42],
            lineColor: [219, 228, 240],
            lineWidth: 0.5,
            overflow: "linebreak",
            valign: "top",
          },
          headStyles: {
            fillColor: [15, 23, 42],
            textColor: [255, 255, 255],
            fontStyle: "bold",
            fontSize: 6,
          },
          alternateRowStyles: {
            fillColor: [248, 250, 252],
          },
        });

        currentY =
          (pdfDocument as { lastAutoTable?: { finalY: number } }).lastAutoTable
            ?.finalY ?? currentY + 48;
        currentY += 20;
      });

      pdfDocument.save(`${fileBaseName}.pdf`);
    } finally {
      setIsExporting(false);
    }
  }

  const renderIncidentControlHeader = (column: IncidentControlColumn) => {
    const sortKey = INCIDENT_CONTROL_COLUMN_SORT_KEY[column];
    const isDropTarget =
      !!draggedColumn && draggedColumn !== column && dragOverColumn === column;
    const isRightAligned = column === "updated";

    const label =
      column === "league"
        ? "LIGA"
        : column === "id"
          ? "ID"
          : column === "date"
            ? "FECHA"
          : column === "match"
            ? "PARTIDO"
            : column === "severity"
              ? "GRAVEDAD"
              : column === "operator"
                ? "OPERADOR"
                : column === "streamer"
                  ? "STREAMER"
                  : column === "issue"
                    ? "PROBLEMAS"
                    : "ACT.";

    return (
      <th
        key={column}
        className={cn(
          "px-6 py-4 transition-colors",
          column === "match" && "px-8",
          isRightAligned && "px-8 text-right",
          isDropTarget && "bg-[#f8fafc]",
        )}
        onDragOver={(event) => {
          event.preventDefault();
          handleColumnDragOver(column);
        }}
        onDrop={(event) => {
          event.preventDefault();
          handleColumnDrop(column);
        }}
      >
        <div
          className={cn(
            "flex items-center gap-2",
            isRightAligned ? "justify-end" : "justify-between",
          )}
        >
          {sortKey ? (
            <SortHeader
              label={label}
              active={sortBy === sortKey}
              direction={sortDirection}
              onClick={() => handleSort(sortKey)}
              align={isRightAligned ? "right" : "left"}
            />
          ) : (
            <span>{label}</span>
          )}
          <button
            type="button"
            draggable
            aria-label={`Reordenar columna ${label}`}
            onDragStart={() => handleColumnDragStart(column)}
            onDragEnd={handleColumnDragEnd}
            className={cn(
              "inline-flex size-6 items-center justify-center rounded-md text-[#b0bccd] transition hover:bg-[#eef2f7] hover:text-[#617187]",
              draggedColumn === column && "bg-white text-[#617187] shadow-sm",
            )}
          >
            <GripVertical className="size-3.5" />
          </button>
        </div>
      </th>
    );
  };

  const renderIncidentControlCell = (
    incident: IncidentRecord,
    column: IncidentControlColumn,
  ) => {
    const cellClassName = cn(
      "px-6 py-5",
      column === "match" && (selectedIncident ? "px-5" : "px-8"),
      column === "updated" && "px-8 text-right",
    );

    switch (column) {
      case "league":
        return (
          <td key={column} className={cellClassName}>
            <LeagueLogoMarkClient
              league={getIncidentLeagueLabel(incident.competition)}
              className="h-[3.3rem] w-[4.8rem]"
            />
          </td>
        );
      case "id":
        return (
          <td key={column} className={cellClassName}>
            <span className="inline-flex rounded-full border border-[#f3cfd8] bg-[#fff3f6] px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-[var(--accent)]">
              {incident.id}
            </span>
          </td>
        );
      case "date":
        return (
          <td key={column} className={cellClassName}>
            <span className="inline-flex text-sm font-black uppercase tracking-[0.12em] text-[#617187]">
              {formatCompactIncidentDate(incident.eventDate)}
            </span>
          </td>
        );
      case "match":
        return (
          <td key={column} className={cellClassName}>
            <MatchSummaryCell
              matchLabel={incident.matchLabel}
              competition={incident.competition}
              metaTime={getIncidentTimeLabel(incident.updatedAt)}
              compact={Boolean(selectedIncident)}
            />
          </td>
        );
      case "severity":
        return (
          <td key={column} className={cellClassName}>
            <SeverityBadge
              severity={incident.severity}
              className="rounded-full text-xs"
            />
          </td>
        );
      case "operator":
        return (
          <td key={column} className={cellClassName}>
            <div className="flex min-w-0 items-center gap-3 text-sm font-medium text-[#4b5c74]">
              <HoverAvatarBadge
                initials={getInitials(incident.operatorControl)}
                roleLabel="Operador"
                tone="accent"
                size="sm"
              />
              <span className="min-w-0 flex-1 truncate">{incident.operatorControl}</span>
            </div>
          </td>
        );
      case "streamer":
        return (
          <td key={column} className={cellClassName}>
            <div className="flex min-w-0 items-center gap-3 text-sm font-medium text-[#4b5c74]">
              <HoverAvatarBadge
                initials={getInitials(incident.streamer)}
                roleLabel="Streamer"
                tone="neutral"
                size="sm"
              />
              <span className="min-w-0 flex-1 truncate">{incident.streamer}</span>
            </div>
          </td>
        );
      case "issue":
        return (
          <td
            key={column}
            className={cn(cellClassName, "max-w-[320px] text-sm font-medium text-[#4b5c74]")}
          >
            <ActiveProblemSummary problems={incident.problems} />
          </td>
        );
      case "updated":
        return (
          <td key={column} className={cn(cellClassName, "text-sm text-[#70819b]")}>
            {incident.updatedRelative}
          </td>
        );
      default:
        return null;
    }
  };

  const workspaceActions = (
    <div className="flex flex-wrap items-center gap-3 md:justify-end">
      <ToolbarSearchField
        as="div"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Buscar incidencia, partido u operador..."
        className="min-w-[280px] flex-none"
        inputClassName="text-sm font-medium text-[var(--foreground)] placeholder:text-[#94a3b8]"
      />

      <div className="flex shrink-0 items-center gap-3">
        <SectionAiAssistant
          section="Incidencias"
          title="Consulta las incidencias visibles"
          description="Pregunta por gravedad, operador, streamer, partido afectado o problema principal usando solo la tabla filtrada actual."
          placeholder="Ej. ¿Qué incidencias críticas hay y cómo quedó la prueba?"
          contextLabel="Incidencias visibles en la tabla actual"
          context={aiContext}
          guidance="Prioriza gravedad, operador control, streamer, partido, competencia, problema principal y checks de prueba, inicio y gráfica. Si preguntan por prioridad, ordena de crítica a baja."
          examples={[
            "¿Qué incidencias críticas hay ahora?",
            "¿Qué streamer tiene más incidencias visibles?",
            "¿Qué partidos tienen problemas de Internet?",
            "¿Qué incidencias tienen la gráfica manual o con observación?",
          ]}
          hasGeminiKey={hasGeminiKey}
          buttonVariant="icon"
        />
        <ToolbarIconButton
          type="button"
          onClick={() => void exportVisibleIncidents(sortedIncidents)}
          disabled={!sortedIncidents.length || isExporting}
          aria-label={isExporting ? "Exportando incidencias" : "Exportar incidencias"}
          title={isExporting ? "Exportando incidencias" : "Exportar incidencias"}
        >
          <Download className="size-4" />
        </ToolbarIconButton>
      </div>
    </div>
  );
  const headerActionsPortal =
    embedded && headerActionsPortalTarget
      ? createPortal(workspaceActions, headerActionsPortalTarget)
      : null;
  const incidentColumnWeights = selectedIncident
    ? INCIDENT_CONTROL_COMPACT_COLUMN_WIDTH_WEIGHT
    : INCIDENT_CONTROL_COLUMN_WIDTH_WEIGHT;
  const incidentColumnTotalWeight = columnOrder.reduce(
    (sum, column) => sum + incidentColumnWeights[column],
    0,
  );
  const incidentColumnWidths = Object.fromEntries(
    columnOrder.map((column) => [
      column,
      `${((incidentColumnWeights[column] / incidentColumnTotalWeight) * 100).toFixed(2)}%`,
    ]),
  ) as Record<IncidentControlColumn, string>;

  const workspaceContent = (
    <div className="flex min-w-0 flex-col gap-8">
      {embedded && !headerActionsPortal ? workspaceActions : null}
      <section
        className={cn(
          "grid gap-4 sm:grid-cols-2",
          selectedIncident ? "2xl:grid-cols-4" : "xl:grid-cols-4",
        )}
      >
        <article className="panel-surface border border-[var(--border)] bg-[var(--surface)] p-5">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#70819b]">
            Total incidencias
          </p>
          <p className="mt-3 text-4xl font-black tracking-[-0.04em] text-[var(--foreground)]">
            {metrics.total}
          </p>
          <div className="mt-5 flex items-center justify-between gap-4">
            <span className="inline-flex items-center rounded-xl bg-[#f4f7fb] px-2.5 py-1 text-[11px] font-bold text-[#617187]">
              {metrics.competitionCount} competencias
            </span>
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-[#e7edf5]">
              <div
                className="h-full rounded-full bg-[var(--accent)]"
                style={{ width: `${Math.max(10, Math.min(metrics.total * 18, 100))}%` }}
              />
            </div>
          </div>
        </article>

        <article className="panel-surface border border-[#ffd7df] bg-[#fff5f7] p-5 ring-1 ring-[#ffd7df]">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--accent)]">
            Críticas
          </p>
          <p className="mt-3 text-4xl font-black tracking-[-0.04em] text-[var(--accent)]">
            {metrics.critical}
          </p>
          <div className="mt-5 flex items-center justify-between gap-4">
            <span className="inline-flex items-center rounded-xl bg-[#ffe4ea] px-2.5 py-1 text-[11px] font-bold text-[var(--accent)]">
              Atención inmediata
            </span>
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-[#f3c8d4]">
              <div
                className="h-full rounded-full bg-[var(--accent)]"
                style={{ width: `${metrics.criticalPercent}%` }}
              />
            </div>
          </div>
        </article>

        <article className="panel-surface border border-[#ffe6c7] bg-white p-5">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#8a6a27]">
            Altas y medias
          </p>
          <p className="mt-3 text-4xl font-black tracking-[-0.04em] text-[var(--foreground)]">
            {metrics.mediumHigh}
          </p>
          <div className="mt-5 flex items-center justify-between gap-4">
            <span className="inline-flex items-center rounded-xl bg-[#fff4e8] px-2.5 py-1 text-[11px] font-bold text-[#d97706]">
              {metrics.mediumHighPercent}% del total
            </span>
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-[#fae5c5]">
              <div
                className="h-full rounded-full bg-[#f59e0b]"
                style={{ width: `${metrics.mediumHighPercent}%` }}
              />
            </div>
          </div>
        </article>

        <article className="panel-surface border border-[#d8f0e3] bg-[var(--surface)] p-5">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#4b7a61]">
            Partidos afectados
          </p>
          <p className="mt-3 text-4xl font-black tracking-[-0.04em] text-[var(--foreground)]">
            {metrics.affectedMatches}
          </p>
          <div className="mt-5 flex items-center justify-between gap-4">
            <span className="inline-flex items-center rounded-xl bg-[#ebfaf1] px-2.5 py-1 text-[11px] font-bold text-[#0f9f61]">
              {metrics.affectedMatchesPercent}% del total
            </span>
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-[#dcefe5]">
              <div
                className="h-full rounded-full bg-[#10b981]"
                style={{ width: `${metrics.affectedMatchesPercent}%` }}
              />
            </div>
          </div>
        </article>
      </section>

      <div className="min-h-0 flex-1">
        <SectionTableCard
          title="Control de Incidencias"
          icon={AlertTriangle}
          badge={
            <span className={`${badgeBaseClassName} bg-[var(--background-soft)] text-[#617187]`}>
              {filteredIncidents.length} visibles
            </span>
          }
          footer={
            <>
              <p className="text-xs font-black uppercase tracking-[0.14em] text-[#617187]">
                Mostrando {filteredIncidents.length} de {incidents.length} incidencias
              </p>
              <div className="flex gap-1">
                <button className="inline-flex size-9 items-center justify-center rounded-lg border border-[var(--border)] bg-white text-[#94a3b8]">
                  1
                </button>
              </div>
            </>
          }
          className="flex h-full min-h-0 min-w-0 flex-col"
        >
          <div className="min-w-0 flex-1 overflow-auto">
            <table className="min-w-full table-fixed text-left">
              <colgroup>
                {columnOrder.map((column) => (
                  <col
                    key={column}
                    style={{ width: incidentColumnWidths[column] }}
                  />
                ))}
              </colgroup>
              <thead>
                <tr className="bg-[#fafbfd] text-[11px] font-black uppercase tracking-[0.18em] text-[#94a3b8]">
                  {columnOrder.map((column) =>
                    renderIncidentControlHeader(column),
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#edf1f6]">
                {sortedIncidents.map((incident) => {
                  const active = selectedIncident?.id === incident.id;
                  const rowTone = getIncidentRowTone(incident.severity);

                  return (
                    <tr
                      key={incident.id}
                      onClick={() => {
                        setSelectedId(incident.id);
                        setDrawerTab("details");
                      }}
                      className={cn(
                        "cursor-pointer transition",
                        active
                          ? rowTone.active
                          : rowTone.hover,
                      )}
                    >
                      {columnOrder.map((column) =>
                        renderIncidentControlCell(incident, column),
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </SectionTableCard>
      </div>
    </div>
  );

  const selectedIncidentDrawer = selectedIncident ? (
    <aside className="min-w-0 self-start xl:sticky xl:top-24">
      <div className="panel-surface fixed inset-x-4 bottom-4 top-20 z-40 flex flex-col overflow-hidden border border-[var(--border)] bg-[var(--surface)] xl:static xl:h-[calc(100vh-8rem)] xl:w-full">
        <div className="border-b border-[var(--border)] p-6">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex rounded-full border border-[#f3cfd8] bg-[#fff3f6] px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-[var(--accent)]">
              {selectedIncident.id}
            </span>
            <span
              style={{
                backgroundColor: getTeamLeagueColorSet(
                  getIncidentLeagueLabel(selectedIncident.competition),
                ).soft,
                color: getTeamLeagueColorSet(
                  getIncidentLeagueLabel(selectedIncident.competition),
                ).accent,
              }}
              className="inline-flex rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em]"
            >
              {getIncidentLeagueLabel(selectedIncident.competition)}
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              setSelectedId(null);
              setDrawerTab("details");
            }}
            aria-label="Cerrar detalle de incidencia"
            className="inline-flex size-10 items-center justify-center rounded-full bg-[var(--background-soft)] text-[#94a3b8]"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex items-end justify-between gap-6">
          <div className="min-w-0">
          <div className="space-y-1">
            <p className="text-[1.6rem] font-black leading-[1.05] tracking-[-0.04em] text-[var(--foreground)]">
              {selectedIncidentTeams?.homeTeam ?? selectedIncident.matchLabel}
            </p>
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[1.6rem] font-black leading-[1.05] tracking-[-0.04em] text-[var(--foreground)]">
              <span className="text-[var(--accent)]">vs</span>
              <span>{selectedIncidentTeams?.awayTeam || selectedIncident.matchLabel}</span>
            </div>
          </div>

            <div className="mt-4 flex items-center gap-4 text-sm text-[#70819b]">
              <span className="inline-flex items-center gap-2">
                <Clock3 className="size-4 text-[#b1b8c5]" />
                {selectedIncident.eventDate}
              </span>
              <span className="inline-flex items-center gap-2">
                <Clock3 className="size-4 text-[#b1b8c5]" />
                {getIncidentTimeLabel(selectedIncident.updatedAt)}
              </span>
            </div>
            <div className="mt-2 inline-flex items-start gap-2 text-sm text-[#70819b]">
              <MapPin className="mt-0.5 size-4 shrink-0 text-[#b1b8c5]" />
              <span>{selectedIncident.venue}</span>
            </div>
          </div>
        </div>
        </div>

        <UnderlineTabs
          columns={4}
          items={[
            {
              key: "details",
              label: "Detalle",
              icon: Eye,
              active: drawerTab === "details",
              onClick: () => setDrawerTab("details"),
            },
            {
              key: "activity",
              label: "Log",
              icon: History,
              active: drawerTab === "activity",
              onClick: () => setDrawerTab("activity"),
            },
            {
              key: "notes",
              label: "Notas",
              icon: FileText,
              active: drawerTab === "notes",
              onClick: () => setDrawerTab("notes"),
            },
            {
              key: "images",
              label: "Imgs",
              icon: ImageIcon,
              active: drawerTab === "images",
              onClick: () => setDrawerTab("images"),
            },
          ]}
        />

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 xl:max-h-none">
          {drawerTab === "details" ? (
            <div className="space-y-8">
        <section className="space-y-4">
          <h4 className="text-[11px] font-black uppercase tracking-[0.18em] text-[#94a3b8]">
            Severidad
          </h4>
          <div className="grid gap-3">
            <div
              className={cn(
                "panel-radius border p-4",
                selectedSeverityTone?.panel,
              )}
            >
              <p
                className={cn(
                  "text-[10px] font-black uppercase tracking-[0.16em]",
                  selectedSeverityTone?.label,
                )}
              >
                Nivel actual
              </p>
              <p
                className={cn(
                  "mt-2 text-sm font-black",
                  selectedSeverityTone?.value,
                )}
              >
                {selectedIncident.severity}
              </p>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <h4 className="text-[11px] font-black uppercase tracking-[0.18em] text-[#94a3b8]">
            Responsables de cancha
          </h4>
          <div className="grid grid-cols-2 gap-3">
            <div className="panel-radius border border-[var(--border)] bg-white p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#94a3b8]">
                Operador
              </p>
              <div className="mt-3 flex items-center gap-3">
                <HoverAvatarBadge
                  initials={getInitials(selectedIncident.operatorControl)}
                  roleLabel="Operador"
                  tone="accent"
                  size="md"
                />
                <p className="text-sm font-bold text-[var(--foreground)]">
                  {selectedIncident.operatorControl}
                </p>
              </div>
            </div>
            <div className="panel-radius border border-[var(--border)] bg-white p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#94a3b8]">
                Streamer
              </p>
              <div className="mt-3 flex items-center gap-3">
                <HoverAvatarBadge
                  initials={getInitials(selectedIncident.streamer)}
                  roleLabel="Streamer"
                  tone="neutral"
                  size="md"
                />
                <p className="text-sm font-bold text-[var(--foreground)]">
                  {selectedIncident.streamer}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <h4 className="text-[11px] font-black uppercase tracking-[0.18em] text-[#94a3b8]">
            Contexto del partido
          </h4>
          <div className="grid grid-cols-2 gap-3">
            <div className="panel-radius flex min-h-[84px] items-center gap-3 border border-[var(--border)] bg-white p-4">
              <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-[#f4f7fb] text-[#7c8aa0]">
                <Cpu className="size-[18px]" />
              </span>
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#94a3b8]">
                  Tipo
                </p>
                <p className="mt-1 text-sm font-bold text-[var(--foreground)]">
                  {selectedIncident.transmissionType}
                </p>
              </div>
            </div>
            <div className="panel-radius flex min-h-[84px] items-center gap-3 border border-[var(--border)] bg-white p-4">
              <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-[#f4f7fb] text-[#7c8aa0]">
                <Wifi className="size-[18px]" />
              </span>
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#94a3b8]">
                  Señal
                </p>
                <p className="mt-1 text-sm font-bold text-[var(--foreground)]">
                  {selectedIncident.signalDelivery}
                </p>
              </div>
            </div>
            <div
              className={cn(
                "panel-radius col-span-2 flex min-h-[84px] items-center justify-between gap-3 border px-4 py-3",
                selectedIncident.aptoLineal
                  ? "border-[#d7eadf] bg-[#f3fcf6]"
                  : "border-[#ffd8df] bg-[#fff3f6]",
              )}
            >
              <div>
                <p
                  className={cn(
                    "text-[10px] font-black uppercase tracking-[0.16em]",
                    selectedIncident.aptoLineal
                      ? "text-[#178a56]"
                      : "text-[#b42318]",
                  )}
                >
                  Apto lineal
                </p>
              </div>
              <span
                className={cn(
                  "inline-flex size-10 items-center justify-center rounded-full",
                  selectedIncident.aptoLineal
                    ? "bg-[#dcfce7] text-[#12b76a]"
                    : "bg-[#ffe7ed] text-[#f04461]",
                )}
              >
                {selectedIncident.aptoLineal ? (
                  <CheckCircle2 className="size-7" />
                ) : (
                  <CircleX className="size-7" />
                )}
              </span>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <h4 className="text-[11px] font-black uppercase tracking-[0.18em] text-[#94a3b8]">
            Pruebas de salida
          </h4>
          <div className="grid grid-cols-2 gap-3">
            <div className="panel-radius flex min-h-[84px] items-center gap-3 border border-[var(--border)] bg-white p-4">
              <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-[#f4f7fb] text-[#94a3b8]">
                <Clock3 className="size-7" />
              </span>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#94a3b8]">
                  Hora
                </p>
                <p className="mt-2 text-sm font-bold text-[var(--foreground)]">
                  {selectedIncident.testTime}
                </p>
              </div>
            </div>
            <div
              className={cn(
                "panel-radius flex min-h-[84px] items-center gap-3 border p-4",
                selectedTestCheck?.panelClassName,
              )}
            >
              <span
                className={cn(
                  "inline-flex size-10 shrink-0 items-center justify-center rounded-full",
                  selectedTestCheck?.iconWrapClassName,
                  selectedTestCheck?.iconClassName,
                )}
              >
                {selectedTestCheck ? (
                  <selectedTestCheck.Icon className="size-7" />
                ) : null}
              </span>
              <div>
                <p
                  className={cn(
                    "text-[10px] font-black uppercase tracking-[0.16em]",
                    selectedTestCheck?.labelClassName,
                  )}
                >
                  Prueba
                </p>
              </div>
            </div>
            <div
              className={cn(
                "panel-radius flex min-h-[84px] items-center gap-3 border p-4",
                selectedStartCheck?.panelClassName,
              )}
            >
              <span
                className={cn(
                  "inline-flex size-10 shrink-0 items-center justify-center rounded-full",
                  selectedStartCheck?.iconWrapClassName,
                  selectedStartCheck?.iconClassName,
                )}
              >
                {selectedStartCheck ? (
                  <selectedStartCheck.Icon className="size-7" />
                ) : null}
              </span>
              <div>
                <p
                  className={cn(
                    "text-[10px] font-black uppercase tracking-[0.16em]",
                    selectedStartCheck?.labelClassName,
                  )}
                >
                  Inicio
                </p>
              </div>
            </div>
            <div
              className={cn(
                "panel-radius flex min-h-[84px] items-center gap-3 border p-4",
                selectedGraphicsCheck?.panelClassName,
              )}
            >
              <span
                className={cn(
                  "inline-flex size-10 shrink-0 items-center justify-center rounded-full",
                  selectedGraphicsCheck?.iconWrapClassName,
                  selectedGraphicsCheck?.iconClassName,
                )}
              >
                {selectedGraphicsCheck ? (
                  <selectedGraphicsCheck.Icon className="size-7" />
                ) : null}
              </span>
              <div>
                <p
                  className={cn(
                    "text-[10px] font-black uppercase tracking-[0.16em]",
                    selectedGraphicsCheck?.labelClassName,
                  )}
                >
                  Gráfica
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <h4 className="text-[11px] font-black uppercase tracking-[0.18em] text-[#94a3b8]">
            Bloque técnico
          </h4>
          <div className="grid grid-cols-2 gap-3">
            <div className="panel-radius min-h-[84px] border border-[var(--border)] bg-white p-4">
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() =>
                    openEvidencePreview(
                      "Speedtest",
                      selectedSpeedtestAttachment,
                      selectedSpeedtestPreviewSrc,
                    )
                  }
                  disabled={!selectedSpeedtestAttachment || !selectedSpeedtestPreviewSrc}
                  className={cn(
                    "inline-flex size-10 shrink-0 items-center justify-center rounded-full border transition",
                    selectedSpeedtestAttachment && selectedSpeedtestPreviewSrc
                      ? "border-[#ffd7df] bg-[#fff5f7] text-[var(--accent)] hover:border-[var(--accent)] hover:bg-[#fff0f4]"
                      : "cursor-not-allowed border-[var(--border)] bg-[#f8fafc] text-[#c3ccd9]",
                  )}
                  aria-label="Abrir captura de speedtest"
                >
                  <Gauge className="size-4" />
                </button>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-[var(--foreground)]">
                    Speedtest
                  </p>
                  <p className="mt-1 truncate text-sm font-mono font-bold text-[var(--accent)]">
                    {resolvedSpeedtest}
                  </p>
                </div>
              </div>
            </div>
            <div className="panel-radius min-h-[84px] border border-[var(--border)] bg-white p-4">
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() =>
                    openEvidencePreview("Ping", selectedPingAttachment, selectedPingPreviewSrc)
                  }
                  disabled={!selectedPingAttachment || !selectedPingPreviewSrc}
                  className={cn(
                    "inline-flex size-10 shrink-0 items-center justify-center rounded-full border transition",
                    selectedPingAttachment && selectedPingPreviewSrc
                      ? "border-[#d6f0eb] bg-[#f3fcfa] text-[#0f766e] hover:border-[#0f766e] hover:bg-[#ecfdf8]"
                      : "cursor-not-allowed border-[var(--border)] bg-[#f8fafc] text-[#c3ccd9]",
                  )}
                  aria-label="Abrir captura de ping"
                >
                  <Wifi className="size-4" />
                </button>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-[var(--foreground)]">
                    Ping
                  </p>
                  <p className="mt-1 truncate text-sm font-mono font-bold text-[var(--foreground)]">
                    {resolvedPing}
                  </p>
                </div>
              </div>
            </div>
            <div className="panel-radius min-h-[84px] border border-[var(--border)] bg-white p-4">
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() =>
                    openEvidencePreview("GPU", selectedGpuAttachment, selectedGpuPreviewSrc)
                  }
                  disabled={!selectedGpuAttachment || !selectedGpuPreviewSrc}
                  className={cn(
                    "inline-flex size-10 shrink-0 items-center justify-center rounded-full border transition",
                    selectedGpuAttachment && selectedGpuPreviewSrc
                      ? "border-[#ebe0ff] bg-[#f8f5ff] text-[#7c3aed] hover:border-[#7c3aed] hover:bg-[#f4f0ff]"
                      : "cursor-not-allowed border-[var(--border)] bg-[#f8fafc] text-[#c3ccd9]",
                  )}
                  aria-label="Abrir captura de GPU"
                >
                  <Cpu className="size-4" />
                </button>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-[var(--foreground)]">
                    GPU
                  </p>
                  <p className="mt-1 truncate text-sm font-mono font-bold text-[var(--foreground)]">
                    {selectedIncident.gpuLoad}
                  </p>
                </div>
              </div>
            </div>
          </div>

        </section>

        <section className="space-y-4">
          <h4 className="text-[11px] font-black uppercase tracking-[0.18em] text-[#94a3b8]">
            Problemas detectados
          </h4>
          <div className="grid grid-cols-2 gap-2">
            {selectedIncident.problems.map((problem) => (
              <ProblemPill key={problem.label} problem={problem} />
            ))}
          </div>
        </section>
            </div>
          ) : drawerTab === "activity" ? (
            <section className="space-y-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <History className="size-4 text-[var(--accent)]" />
                <h4 className="text-[11px] font-black uppercase tracking-[0.18em] text-[#94a3b8]">
                  Actividad
                </h4>
              </div>
              <span className="rounded-full bg-[var(--background-soft)] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-[#7d8ca1]">
                {selectedIncident.activity.length} eventos
              </span>
            </div>

            {selectedIncident.activity.length ? (
              <div className="space-y-4 border-l border-[var(--border)] pl-5">
                {selectedIncident.activity.map((entry, index) => {
                  const tone = getIncidentActivityTone(entry.tone);

                  return (
                    <div key={`${selectedIncident.id}-${entry.time}-${index}`} className="relative">
                      <div className="absolute -left-[27px] top-1 bg-[var(--surface)] p-1">
                        <div
                          className={cn(
                            "size-3 rounded-full ring-4",
                            tone.dot,
                          )}
                        />
                      </div>

                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-[var(--foreground)]">
                            {entry.actor}
                          </p>
                          <p className="mt-1 text-sm leading-relaxed text-[#4b5c74]">
                            {entry.action}
                          </p>
                          {entry.detail ? (
                            <p className="mt-2 text-xs leading-5 text-[#70819b]">
                              {entry.detail}
                            </p>
                          ) : null}
                        </div>
                        <span
                          className={cn(
                            "shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em]",
                            tone.badge,
                          )}
                        >
                          {entry.time}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-[10px] border border-dashed border-[var(--border)] bg-[var(--background-soft)] p-4 text-sm text-[#617187]">
                Todavía no hay actividad registrada para esta incidencia.
              </div>
            )}
            </section>
          ) : drawerTab === "notes" ? (
            <section className="space-y-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <FileText className="size-4 text-[var(--accent)]" />
                <h4 className="text-[11px] font-black uppercase tracking-[0.18em] text-[#94a3b8]">
                  Notas
                </h4>
              </div>
              <span className="rounded-full bg-[var(--background-soft)] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-[#7d8ca1]">
                Observación técnica
              </span>
            </div>

            <div className="rounded-2xl border border-[var(--border)] bg-[var(--background-soft)] p-4">
              <p className="text-sm leading-7 text-[#4b5c74]">
                {selectedIncident.observations}
              </p>
              <div className="mt-4 flex items-center justify-between border-t border-[var(--border)] pt-4">
                <span className="text-[11px] font-bold text-[#94a3b8]">
                  Operador: {selectedIncident.reporter}
                </span>
                <span className="text-[11px] font-bold text-[#94a3b8]">
                  {selectedIncident.updatedAt}
                </span>
              </div>
            </div>
            </section>
          ) : (
            <section className="space-y-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <ImageIcon className="size-4 text-[var(--accent)]" />
                <h4 className="text-[11px] font-black uppercase tracking-[0.18em] text-[#94a3b8]">
                  Imágenes
                </h4>
              </div>
              <span className="rounded-full bg-[var(--background-soft)] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-[#7d8ca1]">
                {selectedVenueImages.length} adjuntas
              </span>
            </div>

            <label className="flex cursor-pointer items-center gap-3 rounded-[10px] border border-dashed border-[#d7dee8] bg-[#fafbfd] px-4 py-3 transition hover:border-[var(--accent)] hover:bg-[#fff7f9]">
              <span className="inline-flex size-10 items-center justify-center rounded-xl bg-white text-[#94a3b8] shadow-sm">
                <Upload className="size-4" />
              </span>
              <span className="flex-1">
                <span className="block text-sm font-bold text-[var(--foreground)]">
                  Subir imágenes de la cancha
                </span>
                <span className="block text-xs text-[#94a3b8]">
                  Puedes cargar una o varias fotos del estadio, cabina o contexto operativo.
                </span>
              </span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/jpg"
                multiple
                className="hidden"
                onChange={(event) =>
                  handleVenueImagesChange(
                    selectedIncident,
                    event.target.files ?? null,
                  )
                }
              />
            </label>

            {selectedVenueImages.length ? (
              <div className="space-y-2">
                {selectedVenueImages.map((image, index) => (
                  <div
                    key={`${selectedIncident.id}-venue-${image.fileName}-${index}`}
                    className="rounded-[10px] border border-[var(--border)] bg-[#fcfcfd] p-4"
                  >
                    <div className="flex items-center gap-3">
                      <span className="inline-flex size-11 items-center justify-center rounded-xl bg-[#eef2f6] text-[#7c8aa0]">
                        <ImageIcon className="size-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-[var(--foreground)]">
                          {image.fileName}
                        </p>
                        <p className="text-xs text-[#94a3b8]">
                          {image.fileSizeLabel}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-[10px] border border-dashed border-[var(--border)] bg-[var(--background-soft)] p-4 text-sm text-[#617187]">
                Todavía no hay imágenes cargadas para esta incidencia.
              </div>
            )}
            </section>
          )}
        </div>

        <div className="border-t border-[var(--border)] bg-[var(--surface)] p-6">
          <button className="w-full rounded-2xl bg-[var(--accent)] px-5 py-3 text-sm font-black uppercase tracking-[0.16em] text-white shadow-[0_14px_28px_rgba(230,18,56,0.18)] transition hover:bg-[var(--accent-strong)]">
            Editar incidencia
          </button>
        </div>
      </div>
    </aside>
  ) : null;
  const selectedIncidentDrawerPortal =
    selectedIncidentDrawer && drawerPortalTarget
      ? createPortal(selectedIncidentDrawer, drawerPortalTarget)
      : null;
  const useExternalDrawer = embedded && Boolean(onSelectedIdChange);
  const showInlineEmbeddedDrawer = Boolean(selectedIncidentDrawer) && !useExternalDrawer;

  return (
    <div className="flex min-h-[42rem] flex-col gap-6">
      {headerActionsPortal}
      {embedded ? (
        <>
          <div
            className={cn(
              "grid min-h-0 gap-6",
              embedded && "-mt-1",
              showInlineEmbeddedDrawer
                ? "xl:grid-cols-[minmax(0,1fr)_390px]"
                : "grid-cols-1",
            )}
          >
            {workspaceContent}
            {showInlineEmbeddedDrawer ? selectedIncidentDrawer : null}
          </div>
          {selectedIncidentDrawerPortal}
        </>
      ) : selectedIncidentDrawer ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_390px]">
          <div className="flex min-w-0 flex-col gap-6">
            <SectionPageHeader
              title="Incidencias"
              description="Monitorea incidencias, seguimiento técnico y evidencias del corte visible."
              actions={workspaceActions}
            />
            {workspaceContent}
          </div>
          {selectedIncidentDrawer}
        </div>
      ) : (
        <>
          <SectionPageHeader
            title="Incidencias"
            description="Monitorea incidencias, seguimiento técnico y evidencias del corte visible."
            actions={workspaceActions}
          />
          {workspaceContent}
        </>
      )}

      {evidencePreview ? (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-[#101828]/72 p-6 backdrop-blur-sm"
          onClick={() => setEvidencePreview(null)}
        >
          <div
            className="relative w-full max-w-4xl rounded-[28px] bg-white p-4 shadow-[0_32px_80px_rgba(15,23,42,0.28)]"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setEvidencePreview(null)}
              className="absolute right-4 top-4 inline-flex size-11 items-center justify-center rounded-full bg-[#f8fafc] text-[#94a3b8] transition hover:bg-[#eef2f6] hover:text-[#52627a]"
              aria-label="Cerrar vista previa"
            >
              <X className="size-5" />
            </button>

            <div className="mb-4 pr-14">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#94a3b8]">
                {evidencePreview.title}
              </p>
              <p className="mt-2 truncate text-sm font-bold text-[var(--foreground)]">
                {evidencePreview.fileName}
              </p>
            </div>

            <div className="overflow-hidden rounded-[22px] border border-[var(--border)] bg-[#f8fafc]">
              <Image
                src={evidencePreview.src}
                alt={evidencePreview.fileName}
                width={1400}
                height={1000}
                unoptimized
                className="h-auto max-h-[76vh] w-full object-contain"
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
