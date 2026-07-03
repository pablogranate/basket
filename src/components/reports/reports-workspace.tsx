"use client";

import { type DragEvent, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowUpDown,
  BarChart3,
  Bot,
  CalendarDays,
  Circle,
  CircleCheckBig,
  CircleX,
  ChevronDown,
  ChevronUp,
  Clock3,
  Download,
  Eye,
  FileText,
  Filter,
  Gauge,
  GripVertical,
  History,
  MapPin,
  Pencil,
  ShieldAlert,
  Sparkles,
  X,
} from "lucide-react";

import { SectionAiAssistant } from "@/components/ai/section-ai-assistant";
import dynamic from "next/dynamic";
import { LeagueLogoMarkClient } from "@/components/league-logo-mark-client";
import { ClientTeamLogoMark } from "@/components/team-logo-mark-client";
import { SectionPageHeader } from "@/components/layout/section-page-header";
import { MatchSummaryCell } from "@/components/shared/match-summary-cell";
import { EmptyState } from "@/components/ui/empty-state";
import { ExpandDivider } from "@/components/ui/expand-divider";
import { HoverAvatarBadge } from "@/components/ui/hover-avatar-badge";
import { InsightBarRow } from "@/components/ui/insight-bar-row";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { SeverityBadge } from "@/components/ui/severity-badge";
import { SectionTableCard } from "@/components/ui/section-table-card";
import { UnderlineTabs } from "@/components/ui/underline-tabs";
import { ToolbarIconButton } from "@/components/ui/toolbar-icon-button";
import { ToolbarSearchField } from "@/components/ui/toolbar-search-field";
import type {
  ReportActivity,
  ReportRecord,
  ReportSeverity,
} from "@/lib/reports";
import type { IncidentRecord } from "@/lib/incidents";
import { getTeamLeagueColorSet } from "@/lib/team-directory";
import { cn } from "@/lib/utils";

// Lazy: the incidents workspace (~82KB) only renders on the incidents tab, so
// keep it out of the initial /reports bundle until that tab is opened.
const IncidentsWorkspace = dynamic(
  () =>
    import("@/components/incidents/incidents-workspace").then(
      (mod) => mod.IncidentsWorkspace,
    ),
  { ssr: false },
);

type ReportSortKey =
  | "league"
  | "id"
  | "idBp"
  | "date"
  | "match"
  | "responsible"
  | "paid"
  | "feed"
  | "severity";
type SortDirection = "asc" | "desc";
type ReportPeriodMode = "day" | "week" | "month";
type ReportView = "summary" | "control" | "incidents";
type ReportDrawerTab = "details" | "activity";
type IncidentChartMetric = "count" | "rate";
type ReportControlColumn =
  | "league"
  | "id"
  | "idBp"
  | "date"
  | "match"
  | "responsible"
  | "paid"
  | "feed"
  | "severity"
  | "action";
type ReportRankingColumn =
  | "responsible"
  | "role"
  | "assignments"
  | "reports";

const REPORT_CONTROL_COLUMNS_STORAGE_KEY =
  "basket-production.reports.control-columns";
const REPORT_RANKING_COLUMNS_STORAGE_KEY =
  "basket-production.reports.ranking-columns";
const DEFAULT_REPORT_CONTROL_COLUMNS: ReportControlColumn[] = [
  "league",
  "id",
  "idBp",
  "date",
  "match",
  "responsible",
  "paid",
  "feed",
  "severity",
  "action",
];
const DEFAULT_REPORT_RANKING_COLUMNS: ReportRankingColumn[] = [
  "responsible",
  "role",
  "assignments",
  "reports",
];
const REPORT_CONTROL_COLUMN_SORT_KEY: Partial<
  Record<ReportControlColumn, ReportSortKey>
> = {
  league: "league",
  id: "id",
  idBp: "idBp",
  date: "date",
  match: "match",
  responsible: "responsible",
  paid: "paid",
  feed: "feed",
  severity: "severity",
};
const REPORT_CONTROL_COLUMN_WIDTH_WEIGHT: Record<ReportControlColumn, number> = {
  league: 1,
  id: 1.2,
  idBp: 1.3,
  date: 1,
  match: 2.8,
  responsible: 1.8,
  paid: 0.9,
  feed: 0.9,
  severity: 1.2,
  action: 0.5,
};
const REPORT_CONTROL_COMPACT_COLUMN_WIDTH_WEIGHT: Record<
  ReportControlColumn,
  number
> = {
  league: 0.85,
  id: 1,
  idBp: 1,
  date: 0.9,
  match: 2.8,
  responsible: 1.1,
  paid: 0.8,
  feed: 0.8,
  severity: 1,
  action: 0.45,
};

const REPORT_EXPORT_COLUMNS = [
  {
    label: "ID FEED",
    value: (report: ReportRecord) => report.id_feed,
  },
  {
    label: "ID BP",
    value: (report: ReportRecord) => report.id_bp,
  },
  {
    label: "DÍA",
    value: (report: ReportRecord) => report.event_date,
  },
  {
    label: "HORA",
    value: (report: ReportRecord) => report.event_time,
  },
  {
    label: "PARTIDO",
    value: (report: ReportRecord) => report.match_label,
  },
  {
    label: "PROBLEMA",
    value: (report: ReportRecord) => report.problem,
  },
  {
    label: "GRAVEDAD",
    value: (report: ReportRecord) => report.severity,
  },
  {
    label: "¿FEED DETECTÓ?",
    value: (report: ReportRecord) => (report.feed_detected ? "Sí" : "No"),
  },
  {
    label: "CONTROL",
    value: (report: ReportRecord) => report.responsible_name,
  },
  {
    label: "¿SE PAGÓ?",
    value: (report: ReportRecord) => (report.paid ? "Sí" : "No"),
  },
] as const;

function normalizeReportControlColumns(
  value: unknown,
): ReportControlColumn[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const nextColumns = value.filter((item): item is ReportControlColumn =>
    DEFAULT_REPORT_CONTROL_COLUMNS.includes(item as ReportControlColumn),
  );

  if (
    nextColumns.length !== DEFAULT_REPORT_CONTROL_COLUMNS.length ||
    new Set(nextColumns).size !== DEFAULT_REPORT_CONTROL_COLUMNS.length
  ) {
    return null;
  }

  return nextColumns;
}

function normalizeReportRankingColumns(
  value: unknown,
): ReportRankingColumn[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const nextColumns = value.filter((item): item is ReportRankingColumn =>
    DEFAULT_REPORT_RANKING_COLUMNS.includes(item as ReportRankingColumn),
  );

  if (
    nextColumns.length !== DEFAULT_REPORT_RANKING_COLUMNS.length ||
    new Set(nextColumns).size !== DEFAULT_REPORT_RANKING_COLUMNS.length
  ) {
    return null;
  }

  return nextColumns;
}

const MONTHS_ES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
] as const;

const MONTHS_ABBR_ES = [
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

function parseSpanishShortDate(value: string) {
  const match = value.trim().match(/^(\d{1,2})\s+([a-záéíóúñ]+)\s+(\d{4})$/i);

  if (!match) {
    return new Date(value);
  }

  const [, day, monthLabel, year] = match;
  const monthIndex = MONTHS_ES.findIndex(
    (month) => month === monthLabel.toLowerCase(),
  );

  return new Date(Number(year), Math.max(monthIndex, 0), Number(day));
}

function getDateKey(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function getMonthKey(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
  ].join("-");
}

function getWeekIndexInMonth(date: Date) {
  return Math.floor((date.getDate() - 1) / 7) + 1;
}

function getWeekKey(date: Date) {
  return `${getMonthKey(date)}-w${getWeekIndexInMonth(date)}`;
}

function getWeekLabelFromDate(date: Date) {
  return `SEM ${getWeekIndexInMonth(date)} ${MONTHS_ABBR_ES[date.getMonth()]} ${String(
    date.getFullYear(),
  ).slice(-2)}`;
}

function getShortDayLabel(date: Date) {
  return `${String(date.getDate()).padStart(2, "0")} ${MONTHS_ABBR_ES[date.getMonth()]} ${String(
    date.getFullYear(),
  ).slice(-2)}`;
}

function getReportLeagueCanvasTone(league: string) {
  const normalizedLeague = league.toLowerCase();

  if (normalizedLeague.includes("liga nacional")) {
    return "#fff5f7";
  }

  if (normalizedLeague.includes("liga federal")) {
    return "#fff7ef";
  }

  if (normalizedLeague.includes("liga próximo") || normalizedLeague.includes("liga proximo")) {
    return "#f5fbf6";
  }

  if (normalizedLeague.includes("liga endesa") || normalizedLeague.includes("acb")) {
    return "#fff6ef";
  }

  if (normalizedLeague.includes("euroleague")) {
    return "#f8f5ff";
  }

  if (normalizedLeague.includes("chery")) {
    return "#fff9ee";
  }

  if (normalizedLeague.includes("liga argentina")) {
    return "#f4f8ff";
  }

  return "#fafafa";
}

function getReportLeagueAccentColor(league: string) {
  const normalizedLeague = league.toLowerCase();

  if (normalizedLeague.includes("liga nacional")) {
    return "#e61238";
  }

  if (normalizedLeague.includes("liga federal")) {
    return "#e67b18";
  }

  if (
    normalizedLeague.includes("liga próximo") ||
    normalizedLeague.includes("liga proximo")
  ) {
    return "#22a35a";
  }

  if (normalizedLeague.includes("liga endesa") || normalizedLeague.includes("acb")) {
    return "#f08a24";
  }

  if (normalizedLeague.includes("euroleague")) {
    return "#8b5cf6";
  }

  if (normalizedLeague.includes("liga argentina")) {
    return "#2b6be7";
  }

  if (normalizedLeague.includes("nba")) {
    return "#334155";
  }

  return "#64748b";
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

function groupReportsByLeague(reports: ReportRecord[]) {
  const groups = new Map<string, ReportRecord[]>();

  reports.forEach((report) => {
    const currentGroup = groups.get(report.league) ?? [];
    currentGroup.push(report);
    groups.set(report.league, currentGroup);
  });

  return Array.from(groups.entries()).map(([league, items]) => ({
    league,
    items,
  }));
}

function buildReportsExcelDocument(
  reportGroups: ReturnType<typeof groupReportsByLeague>,
  periodLabel: string,
) {
  const headerRow = REPORT_EXPORT_COLUMNS.map(
    (column) =>
      `<th style="border:1px solid #dbe4f0;background:#0f172a;color:#ffffff;padding:10px 12px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;text-align:left;">${escapeHtml(
        column.label,
      )}</th>`,
  ).join("");

  const sections = reportGroups
    .map(({ league, items }) => {
      const accent = getReportLeagueAccentColor(league);
      const rows = items
        .map((report, rowIndex) => {
          const background = rowIndex % 2 === 0 ? "#ffffff" : "#f8fafc";
          const cells = REPORT_EXPORT_COLUMNS.map((column) => {
            const value = escapeHtml(column.value(report));
            const forceText =
              column.label === "ID FEED" || column.label === "ID BP"
                ? "mso-number-format:'\\@';"
                : "";

            return `<td style="border:1px solid #dbe4f0;background:${background};padding:9px 12px;font-size:12px;color:#0f172a;vertical-align:top;${forceText}">${value}</td>`;
          }).join("");

          return `<tr>${cells}</tr>`;
        })
        .join("");

      return `
        <table style="width:100%;border-collapse:collapse;margin:0 0 20px 0;font-family:Arial,sans-serif;">
          <tr>
            <td colspan="${REPORT_EXPORT_COLUMNS.length}" style="border:1px solid ${accent};background:${accent};color:#ffffff;padding:12px 14px;font-size:14px;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;">
              ${escapeHtml(league)}
            </td>
          </tr>
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
    <title>Control de reportes</title>
  </head>
  <body style="margin:16px;background:#f8fafc;font-family:Arial,sans-serif;">
    <div style="margin-bottom:16px;">
      <div style="font-size:18px;font-weight:800;color:#0f172a;">Control de reportes</div>
      <div style="font-size:12px;color:#64748b;">Periodo exportado: ${escapeHtml(periodLabel)}</div>
    </div>
    ${sections}
  </body>
</html>`;
}

function buildChartLinePath(
  values: number[],
  width: number,
  height: number,
  maxValue: number,
) {
  if (!values.length) {
    return "";
  }

  const safeMax = Math.max(maxValue, 1);
  const stepX = values.length > 1 ? width / (values.length - 1) : 0;

  return values
    .map((value, index) => {
      const x = values.length === 1 ? width / 2 : index * stepX;
      const normalized = height - (value / safeMax) * height;
      const y = Number.isFinite(normalized) ? normalized : height;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function getSeverityOrder(severity: ReportSeverity) {
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

function getHomeTeamFromMatchLabel(matchLabel: string) {
  const [homeTeam] = matchLabel.split(/\s+vs\s+/i);
  return homeTeam?.trim() || matchLabel;
}

function splitMatchLabel(matchLabel: string) {
  const [homeTeam, awayTeam] = matchLabel.split(/\s+vs\s+/i);

  return {
    homeTeam: homeTeam?.trim() || matchLabel,
    awayTeam: awayTeam?.trim() || matchLabel,
  };
}

function formatCompactReportDate(value: string) {
  const date = parseSpanishShortDate(value);
  const day = String(date.getDate()).padStart(2, "0");
  const month = MONTHS_ABBR_ES[date.getMonth()] ?? "";

  return `${day} ${month}`;
}

function getReportRowTone(severity: ReportSeverity) {
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

function getSeverityDistributionMeta(severity: ReportSeverity) {
  switch (severity) {
    case "Crítica":
      return {
        barClassName: "bg-[#a12ad6]",
        icon: ShieldAlert,
        iconClassName: "text-[#a12ad6]",
      };
    case "Alta":
      return {
        barClassName: "bg-[#e44b68]",
        icon: AlertTriangle,
        iconClassName: "text-[#e44b68]",
      };
    case "Media":
      return {
        barClassName: "bg-[#e7c247]",
        icon: Gauge,
        iconClassName: "text-[#b78611]",
      };
    case "Baja":
      return {
        barClassName: "bg-[#d8e2ef]",
        icon: Circle,
        iconClassName: "text-[#94a3b8]",
      };
    default:
      return {
        barClassName: "bg-[#10b981]",
        icon: CircleCheckBig,
        iconClassName: "text-[#10b981]",
      };
  }
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

function getReportActivityTone(tone: ReportActivity["tone"]) {
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

function getInitials(name: string) {
  const parts = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "");

  return parts.join("") || "BP";
}

function MetricCard({
  title,
  value,
  chip,
  chipTone = "neutral",
  barClassName,
  barWidth,
  highlight = false,
}: {
  title: string;
  value: number;
  chip: string;
  chipTone?: "neutral" | "accent" | "success" | "warning";
  barClassName: string;
  barWidth: number;
  highlight?: boolean;
}) {
  const chipClassName =
    chipTone === "accent"
      ? "bg-[#ffe3ea] text-[var(--accent)]"
      : chipTone === "success"
        ? "bg-[#eaf9f0] text-[#11915a]"
        : chipTone === "warning"
          ? "bg-[#fff5e7] text-[#c97a13]"
          : "bg-[#f4f7fb] text-[#617187]";

  return (
    <article
      className={cn(
        "panel-surface min-w-0 overflow-hidden border p-5 xl:p-6",
        highlight
          ? "border-[#f2c7d0] bg-[#fff5f7] ring-1 ring-[#f2c7d0]"
          : "border-[var(--border)] bg-[var(--surface)]",
      )}
    >
      <p
        className={cn(
          "text-[11px] font-black uppercase tracking-[0.18em]",
          highlight ? "text-[var(--accent)]" : "text-[#70819b]",
        )}
      >
        {title}
      </p>
      <p
        className={cn(
          "mt-3 text-[2.35rem] font-black tracking-[-0.04em] xl:text-4xl",
          highlight ? "text-[var(--accent)]" : "text-[var(--foreground)]",
        )}
      >
        {value}
      </p>
      <div className="mt-5 flex min-w-0 items-center justify-between gap-4">
        <span
          className={cn(
            "inline-flex min-w-0 items-center rounded-xl px-2.5 py-1 text-[11px] font-bold whitespace-nowrap",
            chipClassName,
          )}
        >
          {chip}
        </span>
        <div className="h-1.5 w-20 shrink-0 overflow-hidden rounded-full bg-[#e7edf5] xl:w-24">
          <div
            className={cn("h-full rounded-full", barClassName)}
            style={{ width: `${Math.max(8, Math.min(barWidth, 100))}%` }}
          />
        </div>
      </div>
    </article>
  );
}

function getEstimatedCycleMinutes(report: ReportRecord) {
  let minutes = 54;

  switch (report.severity) {
    case "Crítica":
      minutes += 94;
      break;
    case "Alta":
      minutes += 66;
      break;
    case "Media":
      minutes += 38;
      break;
    case "Baja":
      minutes += 18;
      break;
    default:
      minutes += 6;
      break;
  }

  if (!report.feed_detected) {
    minutes += 18;
  }

  if (!report.paid) {
    minutes += 24;
  }

  return minutes;
}

export function ReportsWorkspace({
  reports,
  activities,
  incidents,
  hasGeminiKey,
}: {
  reports: ReportRecord[];
  activities: ReportActivity[];
  incidents: IncidentRecord[];
  hasGeminiKey: boolean;
}) {
  const [activeView, setActiveView] = useState<ReportView>("summary");
  const [incidentsHeaderActionsPortalTarget, setIncidentsHeaderActionsPortalTarget] =
    useState<HTMLDivElement | null>(null);
  const [incidentsDrawerPortalTarget, setIncidentsDrawerPortalTarget] =
    useState<HTMLDivElement | null>(null);
  const [selectedEmbeddedIncidentId, setSelectedEmbeddedIncidentId] =
    useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [leagueFilter, setLeagueFilter] = useState("Todas las ligas");
  const latestReportDate = useMemo(() => {
    return reports.reduce((latest, report) => {
      const reportDate = parseSpanishShortDate(report.event_date);
      return reportDate > latest ? reportDate : latest;
    }, parseSpanishShortDate(reports[0]?.event_date ?? "1 enero 2026"));
  }, [reports]);
  const [periodMode, setPeriodMode] = useState<ReportPeriodMode>("day");
  const [selectedDayKey, setSelectedDayKey] = useState(() =>
    getDateKey(latestReportDate),
  );
  const [selectedWeekKey, setSelectedWeekKey] = useState(() =>
    getWeekKey(latestReportDate),
  );
  const [selectedMonthKey, setSelectedMonthKey] = useState(() =>
    getMonthKey(latestReportDate),
  );
  const [incidentChartMetric, setIncidentChartMetric] =
    useState<IncidentChartMetric>("count");
  const [incidentChartLimit, setIncidentChartLimit] = useState<5 | 10>(5);
  const [sortBy, setSortBy] = useState<ReportSortKey>("severity");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [rankingSortBy, setRankingSortBy] =
    useState<ReportRankingColumn>("reports");
  const [rankingSortDirection, setRankingSortDirection] =
    useState<SortDirection>("desc");
  const [columnOrder, setColumnOrder] = useState<ReportControlColumn[]>(() => {
    if (typeof window === "undefined") {
      return DEFAULT_REPORT_CONTROL_COLUMNS;
    }

    try {
      const normalizedColumns = normalizeReportControlColumns(
        JSON.parse(
          window.localStorage.getItem(REPORT_CONTROL_COLUMNS_STORAGE_KEY) ??
            "null",
        ),
      );

      return normalizedColumns ?? DEFAULT_REPORT_CONTROL_COLUMNS;
    } catch {
      window.localStorage.removeItem(REPORT_CONTROL_COLUMNS_STORAGE_KEY);
      return DEFAULT_REPORT_CONTROL_COLUMNS;
    }
  });
  const [draggedColumn, setDraggedColumn] = useState<ReportControlColumn | null>(
    null,
  );
  const [dragOverColumn, setDragOverColumn] = useState<ReportControlColumn | null>(
    null,
  );
  const [rankingColumnOrder, setRankingColumnOrder] = useState<
    ReportRankingColumn[]
  >(() => {
    if (typeof window === "undefined") {
      return DEFAULT_REPORT_RANKING_COLUMNS;
    }

    try {
      const parsedColumns = normalizeReportRankingColumns(
        JSON.parse(
          window.localStorage.getItem(REPORT_RANKING_COLUMNS_STORAGE_KEY) ??
            "null",
        ),
      );

      return parsedColumns ?? DEFAULT_REPORT_RANKING_COLUMNS;
    } catch {
      window.localStorage.removeItem(REPORT_RANKING_COLUMNS_STORAGE_KEY);
      return DEFAULT_REPORT_RANKING_COLUMNS;
    }
  });
  const [draggedRankingColumn, setDraggedRankingColumn] =
    useState<ReportRankingColumn | null>(null);
  const [dragOverRankingColumn, setDragOverRankingColumn] =
    useState<ReportRankingColumn | null>(null);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [reportDrawerTab, setReportDrawerTab] =
    useState<ReportDrawerTab>("details");
  const [isExporting, setIsExporting] = useState(false);
  const [showAllLeagueDistribution, setShowAllLeagueDistribution] = useState(false);
  const [showAllSeverityDistribution, setShowAllSeverityDistribution] =
    useState(false);
  const [showAllVenueRecurrence, setShowAllVenueRecurrence] = useState(false);

  const [lastActiveView, setLastActiveView] = useState(activeView);

  if (activeView !== lastActiveView) {
    setLastActiveView(activeView);
    if (activeView !== "incidents") {
      setSelectedEmbeddedIncidentId(null);
    }
  }

  function handleSort(nextSortBy: ReportSortKey) {
    if (sortBy === nextSortBy) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortBy(nextSortBy);
    setSortDirection(nextSortBy === "severity" ? "desc" : "asc");
  }

  function handleRankingSort(nextSortBy: ReportRankingColumn) {
    if (rankingSortBy === nextSortBy) {
      setRankingSortDirection((current) =>
        current === "asc" ? "desc" : "asc",
      );
      return;
    }

    setRankingSortBy(nextSortBy);
    setRankingSortDirection(
      nextSortBy === "reports" || nextSortBy === "assignments"
        ? "desc"
        : "asc",
    );
  }

  function handleColumnDragStart(column: ReportControlColumn) {
    setDraggedColumn(column);
  }

  function handleColumnDragOver(
    event: DragEvent<HTMLTableCellElement>,
    column: ReportControlColumn,
  ) {
    event.preventDefault();

    if (draggedColumn && draggedColumn !== column) {
      setDragOverColumn(column);
    }
  }

  function handleColumnDrop(column: ReportControlColumn) {
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

  function handleRankingColumnDragStart(column: ReportRankingColumn) {
    setDraggedRankingColumn(column);
    setDragOverRankingColumn(column);
  }

  function handleRankingColumnDragOver(column: ReportRankingColumn) {
    if (draggedRankingColumn && draggedRankingColumn !== column) {
      setDragOverRankingColumn(column);
    }
  }

  function handleRankingColumnDrop(column: ReportRankingColumn) {
    if (!draggedRankingColumn || draggedRankingColumn === column) {
      setDraggedRankingColumn(null);
      setDragOverRankingColumn(null);
      return;
    }

    setRankingColumnOrder((current) => {
      const next = [...current];
      const draggedIndex = next.indexOf(draggedRankingColumn);
      const targetIndex = next.indexOf(column);

      if (draggedIndex === -1 || targetIndex === -1) {
        return current;
      }

      next.splice(draggedIndex, 1);
      next.splice(targetIndex, 0, draggedRankingColumn);
      return next;
    });

    setDraggedRankingColumn(null);
    setDragOverRankingColumn(null);
  }

  function handleRankingColumnDragEnd() {
    setDraggedRankingColumn(null);
    setDragOverRankingColumn(null);
  }

  useEffect(() => {
    window.localStorage.setItem(
      REPORT_CONTROL_COLUMNS_STORAGE_KEY,
      JSON.stringify(columnOrder),
    );
  }, [columnOrder]);

  useEffect(() => {
    window.localStorage.setItem(
      REPORT_RANKING_COLUMNS_STORAGE_KEY,
      JSON.stringify(rankingColumnOrder),
    );
  }, [rankingColumnOrder]);

  const leagueOptions = useMemo(() => {
    return ["Todas las ligas", ...new Set(reports.map((report) => report.league))];
  }, [reports]);

  const dayOptions = useMemo(() => {
    const options = new Map<string, string>();

    reports.forEach((report) => {
      const date = parseSpanishShortDate(report.event_date);
      options.set(getDateKey(date), getShortDayLabel(date));
    });

    return Array.from(options.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((left, right) => right.value.localeCompare(left.value));
  }, [reports]);

  const weekOptions = useMemo(() => {
    const options = new Map<string, { label: string; sortValue: number }>();

    reports.forEach((report) => {
      const date = parseSpanishShortDate(report.event_date);
      options.set(getWeekKey(date), {
        label: getWeekLabelFromDate(date),
        sortValue: date.getTime(),
      });
    });

    return Array.from(options.entries())
      .map(([value, meta]) => ({ value, label: meta.label, sortValue: meta.sortValue }))
      .sort((left, right) => right.sortValue - left.sortValue);
  }, [reports]);

  const monthOptions = useMemo(() => {
    const year = latestReportDate.getFullYear();

    return MONTHS_ES.map((_, monthIndex) => ({
      value: `${year}-${String(monthIndex + 1).padStart(2, "0")}`,
      label: `${MONTHS_ABBR_ES[monthIndex]} ${String(year).slice(-2)}`,
    }));
  }, [latestReportDate]);

  const baseFilteredReports = useMemo(() => {
    return reports.filter((report) => {
      const reportDate = parseSpanishShortDate(report.event_date);

      if (leagueFilter !== "Todas las ligas" && report.league !== leagueFilter) {
        return false;
      }

      if (periodMode === "day" && getDateKey(reportDate) !== selectedDayKey) {
        return false;
      }

      if (periodMode === "week" && getWeekKey(reportDate) !== selectedWeekKey) {
        return false;
      }

      if (periodMode === "month" && getMonthKey(reportDate) !== selectedMonthKey) {
        return false;
      }

      return true;
    });
  }, [leagueFilter, periodMode, reports, selectedDayKey, selectedMonthKey, selectedWeekKey]);

  const queryFilteredReports = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return baseFilteredReports;
    }

    return baseFilteredReports.filter((report) =>
      [
        report.id_feed,
        report.id_bp,
        report.match_label,
        report.competition,
        report.league,
        report.responsible_name,
        report.problem,
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [baseFilteredReports, query]);

  const summaryMetrics = useMemo(() => {
    const totalReports = baseFilteredReports.length;
    const completedReports = baseFilteredReports.filter(
      (report) => report.paid && report.feed_detected,
    ).length;
    const pendingReports = totalReports - completedReports;
    const withIncident = baseFilteredReports.filter(
      (report) => report.severity !== "Sin incidencia",
    ).length;
    const criticalCount = baseFilteredReports.filter(
      (report) => report.severity === "Crítica",
    ).length;
    const unpaidCount = baseFilteredReports.filter((report) => !report.paid).length;
    const noIncidentCount = baseFilteredReports.filter(
      (report) => report.severity === "Sin incidencia",
    ).length;
    const feedDetectedCount = baseFilteredReports.filter(
      (report) => report.feed_detected,
    ).length;
    const paidCount = baseFilteredReports.filter((report) => report.paid).length;
    const manualCount = totalReports - feedDetectedCount;
    const averageCycle = totalReports
      ? Math.round(
          baseFilteredReports.reduce(
            (total, report) => total + getEstimatedCycleMinutes(report),
            0,
          ) / totalReports,
        )
      : 0;

    return {
      totalReports,
      completedReports,
      pendingReports,
      withIncident,
      criticalCount,
      unpaidCount,
      feedDetectedCount,
      paidCount,
      incidentPercent: totalReports
        ? Math.round((withIncident / totalReports) * 1000) / 10
        : 0,
      noIncidentPercent: totalReports
        ? Math.round((noIncidentCount / totalReports) * 1000) / 10
        : 0,
      feedPercent: totalReports
        ? Math.round((feedDetectedCount / totalReports) * 1000) / 10
        : 0,
      paidPercent: totalReports
        ? Math.round((paidCount / totalReports) * 1000) / 10
        : 0,
      manualPercent: totalReports
        ? Math.round((manualCount / totalReports) * 1000) / 10
        : 0,
      averageCycle,
      activeLeagues: new Set(baseFilteredReports.map((report) => report.league)).size,
    };
  }, [baseFilteredReports]);

  const controlMetrics = useMemo(() => {
    const totalMatches = queryFilteredReports.length;
    const noIncident = queryFilteredReports.filter(
      (report) => report.severity === "Sin incidencia",
    ).length;
    const withIncident = queryFilteredReports.filter(
      (report) => report.severity !== "Sin incidencia",
    ).length;
    const criticalClosures = queryFilteredReports.filter((report) =>
      ["Crítica", "Alta"].includes(report.severity),
    ).length;

    return {
      totalMatches,
      noIncident,
      withIncident,
      criticalClosures,
      leagueCount: new Set(queryFilteredReports.map((report) => report.league)).size,
      noIncidentPercent: totalMatches
        ? Math.round((noIncident / totalMatches) * 100)
        : 0,
      withIncidentPercent: totalMatches
        ? Math.round((withIncident / totalMatches) * 100)
        : 0,
      criticalPercent: totalMatches
        ? Math.round((criticalClosures / totalMatches) * 100)
        : 0,
    };
  }, [queryFilteredReports]);

  const aiContext = useMemo(
    () =>
      queryFilteredReports.map((report) => ({
        id_feed: report.id_feed,
        id_bp: report.id_bp,
        partido: report.match_label,
        competencia: report.competition,
        liga: report.league,
        responsable: report.responsible_name,
        gravedad: report.severity,
        pago: report.paid ? "Sí" : "No",
        feed_detecto: report.feed_detected ? "Sí" : "No",
        problema: report.problem,
        actualizado: report.updated_at,
      })),
    [queryFilteredReports],
  );

  const incidentLeagueChart = useMemo(() => {
    const buckets = new Map<
      string,
      {
        label: string;
        sort: number;
        leagues: Map<string, { incidents: number; total: number }>;
      }
    >();

    const getBucketInfo = (report: ReportRecord) => {
      const date = parseSpanishShortDate(report.event_date);

      if (periodMode === "day") {
        const hour = Number(report.event_time.split(":")[0] ?? "0");

        return {
          key: `h-${String(hour).padStart(2, "0")}`,
          label: `${String(hour).padStart(2, "0")}:00`,
          sort: hour,
        };
      }

      if (periodMode === "week") {
        return {
          key: getDateKey(date),
          label: `${String(date.getDate()).padStart(2, "0")} ${MONTHS_ABBR_ES[date.getMonth()]}`,
          sort: date.getTime(),
        };
      }

      const weekIndex = getWeekIndexInMonth(date);

      return {
        key: `${getMonthKey(date)}-w${weekIndex}`,
        label: `SEM ${weekIndex}`,
        sort: weekIndex,
      };
    };

    baseFilteredReports.forEach((report) => {
      const bucketInfo = getBucketInfo(report);
      const bucket = buckets.get(bucketInfo.key) ?? {
        label: bucketInfo.label,
        sort: bucketInfo.sort,
        leagues: new Map<string, { incidents: number; total: number }>(),
      };

      const currentLeague = bucket.leagues.get(report.league) ?? {
        incidents: 0,
        total: 0,
      };

      currentLeague.total += 1;
      if (report.severity !== "Sin incidencia") {
        currentLeague.incidents += 1;
      }

      bucket.leagues.set(report.league, currentLeague);
      buckets.set(bucketInfo.key, bucket);
    });

    const orderedBuckets = Array.from(buckets.values()).sort(
      (left, right) => left.sort - right.sort,
    );

    const leagueTotals = new Map<string, number>();
    orderedBuckets.forEach((bucket) => {
      bucket.leagues.forEach((value, league) => {
        leagueTotals.set(league, (leagueTotals.get(league) ?? 0) + value.incidents);
      });
    });

    const orderedLeagues = Array.from(leagueTotals.entries())
      .sort((left, right) => right[1] - left[1])
      .slice(0, incidentChartLimit)
      .map(([league]) => league);

    const series = orderedLeagues.map((league, index) => {
      const points = orderedBuckets.map((bucket) => {
        const leagueValues = bucket.leagues.get(league) ?? { incidents: 0, total: 0 };
        const value =
          incidentChartMetric === "rate"
            ? leagueValues.total
              ? Math.round((leagueValues.incidents / leagueValues.total) * 1000) / 10
              : 0
            : leagueValues.incidents;

        return {
          label: bucket.label,
          value,
        };
      });

      return {
        league,
        totalIncidents: leagueTotals.get(league) ?? 0,
        points,
        color: getReportLeagueAccentColor(league),
        strokeWidth: index === 0 ? 3.5 : index < 3 ? 3 : 2.5,
      };
    });

    const maxValue =
      incidentChartMetric === "rate"
        ? 100
        : Math.max(
            1,
            ...series.flatMap((item) => item.points.map((point) => point.value)),
          );

    return {
      labels: orderedBuckets.map((bucket) => bucket.label),
      series,
      maxValue,
    };
  }, [baseFilteredReports, incidentChartLimit, incidentChartMetric, periodMode]);

  const incidentChartFrame = {
    width: 960,
    height: 390,
    marginTop: 8,
    marginRight: 4,
    marginBottom: 32,
    marginLeft: 22,
  } as const;
  const incidentChartPlotWidth =
    incidentChartFrame.width -
    incidentChartFrame.marginLeft -
    incidentChartFrame.marginRight;
  const incidentChartPlotHeight =
    incidentChartFrame.height -
    incidentChartFrame.marginTop -
    incidentChartFrame.marginBottom;

  const leagueDistribution = useMemo(() => {
    const leagueMap = new Map<string, number>();

    baseFilteredReports.forEach((report) => {
      leagueMap.set(report.league, (leagueMap.get(report.league) ?? 0) + 1);
    });

    return Array.from(leagueMap.entries())
      .map(([league, count]) => ({ league, count }))
      .sort((left, right) => right.count - left.count);
  }, [baseFilteredReports]);

  const severityDistribution = useMemo(() => {
    const total = Math.max(baseFilteredReports.length, 1);
    const distribution: ReportSeverity[] = [
      "Crítica",
      "Alta",
      "Media",
      "Baja",
      "Sin incidencia",
    ];

    return distribution.map((severity) => {
      const count = baseFilteredReports.filter(
        (report) => report.severity === severity,
      ).length;

      return {
        severity,
        count,
        percentage: Math.round((count / total) * 100),
      };
    });
  }, [baseFilteredReports]);

  const venueRecurrence = useMemo(() => {
    const severityKeys: ReportSeverity[] = ["Crítica", "Alta", "Media", "Baja"];
    const aggregate = new Map<
      string,
      {
        venue: string;
        teamName: string;
        competition: string;
        total: number;
        severities: Record<ReportSeverity, number>;
      }
    >();

    baseFilteredReports.forEach((report) => {
      if (report.severity === "Sin incidencia") {
        return;
      }

      const current = aggregate.get(report.venue) ?? {
        venue: report.venue,
        teamName: getHomeTeamFromMatchLabel(report.match_label),
        competition: report.competition,
        total: 0,
        severities: {
          Crítica: 0,
          Alta: 0,
          Media: 0,
          Baja: 0,
          "Sin incidencia": 0,
        } satisfies Record<ReportSeverity, number>,
      };

      current.total += 1;
      current.severities[report.severity] += 1;
      aggregate.set(report.venue, current);
    });

    return Array.from(aggregate.values())
      .sort((left, right) => {
        if (right.total !== left.total) {
          return right.total - left.total;
        }

        return severityKeys.reduce((acc, severity) => {
          if (acc !== 0) {
            return acc;
          }
          return right.severities[severity] - left.severities[severity];
        }, 0);
      });
  }, [baseFilteredReports]);

  const visibleLeagueDistribution = showAllLeagueDistribution
    ? leagueDistribution.slice(0, 10)
    : leagueDistribution.slice(0, 3);
  const visibleSeverityDistribution = showAllSeverityDistribution
    ? severityDistribution
    : severityDistribution.slice(0, 3);
  const visibleVenueRecurrence = showAllVenueRecurrence
    ? venueRecurrence.slice(0, 10)
    : venueRecurrence.slice(0, 3);
  const canExpandLeagueDistribution = leagueDistribution.length > 3;
  const canExpandSeverityDistribution = severityDistribution.length > 3;
  const canExpandVenueRecurrence = venueRecurrence.length > 3;

  const responsibleRanking = useMemo(() => {
    const aggregate = new Map<
      string,
      {
        responsible: string;
        role: string;
        reports: number;
        assignmentIds: Set<string>;
      }
    >();

    baseFilteredReports.forEach((report) => {
      const current = aggregate.get(report.responsible_name) ?? {
        responsible: report.responsible_name,
        role: "Responsable",
        reports: 0,
        assignmentIds: new Set<string>(),
      };

      current.reports += 1;
      current.assignmentIds.add(report.id_bp);
      aggregate.set(report.responsible_name, current);
    });

    return Array.from(aggregate.values())
      .map((item) => ({
        ...item,
        assignments: item.assignmentIds.size,
      }))
      .sort((left, right) => {
        const directionFactor = rankingSortDirection === "asc" ? 1 : -1;

        if (rankingSortBy === "responsible") {
          return (
            left.responsible.localeCompare(right.responsible, "es", {
              sensitivity: "base",
            }) * directionFactor
          );
        }

        if (rankingSortBy === "role") {
          return (
            left.role.localeCompare(right.role, "es", {
              sensitivity: "base",
            }) * directionFactor
          );
        }

        if (rankingSortBy === "assignments") {
          return (left.assignments - right.assignments) * directionFactor;
        }

        return (left.reports - right.reports) * directionFactor;
      })
      .slice(0, 5);
  }, [baseFilteredReports, rankingSortBy, rankingSortDirection]);

  const summaryInsights = useMemo(() => {
    const leadingLeague = leagueDistribution[0];
    const criticalLeague = baseFilteredReports
      .filter((report) => report.severity === "Crítica")
      .map((report) => report.league);
    const criticalLeagueName = criticalLeague[0] ?? leagueFilter;
    const busiestResponsible = responsibleRanking[0]?.responsible;

    return [
      leadingLeague
        ? `${leadingLeague.league} concentra ${leadingLeague.count} cierres en el periodo activo.`
        : "No hay suficientes cierres para detectar concentración por liga.",
      summaryMetrics.unpaidCount
        ? `${summaryMetrics.unpaidCount} reportes siguen sin pago confirmado y requieren seguimiento administrativo.`
        : "No hay pagos pendientes en el periodo visible.",
      busiestResponsible
        ? `${busiestResponsible} lidera el volumen de cierres dentro del periodo visible.`
        : "Sin datos suficientes para calcular el ranking de responsables.",
      criticalLeagueName && summaryMetrics.criticalCount
        ? `${criticalLeagueName} concentra la mayor urgencia con ${summaryMetrics.criticalCount} cierres críticos.`
        : "No hay cierres críticos abiertos en este corte.",
    ];
  }, [
    baseFilteredReports,
    leagueDistribution,
    leagueFilter,
    responsibleRanking,
    summaryMetrics.criticalCount,
    summaryMetrics.unpaidCount,
  ]);

  const sortedReports = useMemo(() => {
    const directionFactor = sortDirection === "asc" ? 1 : -1;

    return [...queryFilteredReports].sort((left, right) => {
      if (sortBy === "league") {
        return (
          left.league.localeCompare(right.league, "es", {
            sensitivity: "base",
          }) * directionFactor
        );
      }

      if (sortBy === "id") {
        return (
          left.id_feed.localeCompare(right.id_feed, "es", {
            numeric: true,
            sensitivity: "base",
          }) * directionFactor
        );
      }

      if (sortBy === "idBp") {
        return (
          left.id_bp.localeCompare(right.id_bp, "es", {
            numeric: true,
            sensitivity: "base",
          }) * directionFactor
        );
      }

      if (sortBy === "date") {
        return (
          (parseSpanishShortDate(left.event_date).getTime() -
            parseSpanishShortDate(right.event_date).getTime()) *
          directionFactor
        );
      }

      if (sortBy === "match") {
        return (
          left.match_label.localeCompare(right.match_label, "es", {
            sensitivity: "base",
          }) * directionFactor
        );
      }

      if (sortBy === "responsible") {
        return (
          left.responsible_name.localeCompare(right.responsible_name, "es", {
            sensitivity: "base",
          }) * directionFactor
        );
      }

      if (sortBy === "paid") {
        const paidDiff = Number(left.paid) - Number(right.paid);

        if (paidDiff !== 0) {
          return paidDiff * directionFactor;
        }
      }

      if (sortBy === "feed") {
        const feedDiff = Number(left.feed_detected) - Number(right.feed_detected);

        if (feedDiff !== 0) {
          return feedDiff * directionFactor;
        }
      }

      if (sortBy === "severity") {
        const severityDiff =
          getSeverityOrder(left.severity) - getSeverityOrder(right.severity);

        if (severityDiff !== 0) {
          return severityDiff * directionFactor;
        }
      }

      return (
        left.match_label.localeCompare(right.match_label, "es", {
          sensitivity: "base",
        }) * directionFactor
      );
    });
  }, [queryFilteredReports, sortBy, sortDirection]);

  const selectedReport =
    sortedReports.find((report) => report.id_feed === selectedReportId) ?? null;
  const selectedReportTeams = selectedReport
    ? splitMatchLabel(selectedReport.match_label)
    : null;
  const selectedReportSeverityTone = selectedReport
    ? selectedReport.severity === "Sin incidencia"
      ? {
          panel: "border-[#cde9d7] bg-[#f4fcf7]",
          label: "text-[#17945b]",
          value: "text-[#167447]",
        }
      : selectedReport.severity === "Crítica"
        ? {
            panel: "border-[#edd7fb] bg-[#fbf5ff]",
            label: "text-[#a12ad6]",
            value: "text-[#7f1fb2]",
          }
        : selectedReport.severity === "Alta"
          ? {
              panel: "border-[#ffd6df] bg-[#fff4f6]",
              label: "text-[#cf2246]",
              value: "text-[#b51f3e]",
            }
          : selectedReport.severity === "Media"
            ? {
                panel: "border-[#f4e1a6] bg-[#fffdf2]",
                label: "text-[#b78611]",
                value: "text-[#9b730b]",
              }
            : {
                panel: "border-[#f3e7b8] bg-[#fffef8]",
                label: "text-[#b79734]",
                value: "text-[#8f7a2f]",
              }
    : null;

  const renderReportControlHeader = (column: ReportControlColumn) => {
    const sortableKey = REPORT_CONTROL_COLUMN_SORT_KEY[column];
    const isDropTarget =
      !!draggedColumn && draggedColumn !== column && dragOverColumn === column;
    const headerPadding =
      column === "match" || column === "action" ? "px-8 py-4" : "px-6 py-4";

    return (
      <th
        key={column}
        onDragOver={(event) => handleColumnDragOver(event, column)}
        onDrop={() => handleColumnDrop(column)}
        onDragLeave={() => {
          if (dragOverColumn === column) {
            setDragOverColumn(null);
          }
        }}
        className={cn(
          headerPadding,
          isDropTarget && "bg-[#fff6f8]",
          column === "action" && "text-right",
        )}
      >
        <div
          className={cn(
            "flex w-full items-center gap-2",
            column === "action" && "justify-end",
          )}
        >
          <button
            type="button"
            draggable
            aria-label={`Reordenar columna ${column}`}
            onDragStart={() => handleColumnDragStart(column)}
            onDragEnd={handleColumnDragEnd}
            className={cn(
              "inline-flex size-6 shrink-0 cursor-grab items-center justify-center rounded-md text-[#c1cada] transition hover:bg-white hover:text-[#617187] active:cursor-grabbing",
              draggedColumn === column && "bg-white text-[#617187] shadow-sm",
            )}
          >
            <GripVertical className="size-3.5" />
          </button>

          {sortableKey ? (
            <SortHeader
              label={
                column === "league"
                  ? "LIGA"
                  : column === "id"
                    ? "ID FEED"
                    : column === "idBp"
                      ? "ID BP"
                    : column === "date"
                      ? "FECHA"
                      : column === "match"
                        ? "PARTIDO"
                        : column === "responsible"
                          ? "RESPONSABLE"
                          : column === "paid"
                            ? "PAGO"
                            : column === "feed"
                              ? "FEED"
                              : "GRAVEDAD"
              }
              active={sortBy === sortableKey}
              direction={sortDirection}
              onClick={() => handleSort(sortableKey)}
              align={column === "action" ? "right" : "left"}
            />
          ) : (
            <span className="ml-auto inline-flex uppercase tracking-[0.18em] text-[#94a3b8]">
              ACCIÓN
            </span>
          )}
        </div>
      </th>
    );
  };

  const reportColumnWidths = useMemo(() => {
    const weights = selectedReport
      ? REPORT_CONTROL_COMPACT_COLUMN_WIDTH_WEIGHT
      : REPORT_CONTROL_COLUMN_WIDTH_WEIGHT;
    const totalWeight = columnOrder.reduce(
      (sum, column) => sum + weights[column],
      0,
    );

    return columnOrder.reduce<Record<ReportControlColumn, string>>((acc, column) => {
      acc[column] = `${(((weights[column] / totalWeight) * 100)).toFixed(2)}%`;
      return acc;
    }, {} as Record<ReportControlColumn, string>);
  }, [columnOrder, selectedReport]);

  const renderReportControlCell = (report: ReportRecord, column: ReportControlColumn) => {
    const editable = report.severity !== "Sin incidencia";

    switch (column) {
      case "league":
        return (
          <td key={column} className="px-6 py-5">
            <LeagueLogoMarkClient
              league={report.league}
              className="h-[3.3rem] w-[4.8rem]"
            />
          </td>
        );
      case "id":
        return (
          <td key={column} className="px-6 py-5">
            <span className="inline-flex rounded-full border border-[#f3cfd8] bg-[#fff3f6] px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-[var(--accent)]">
              {report.id_feed}
            </span>
          </td>
        );
      case "idBp":
        return (
          <td key={column} className="px-6 py-5">
            <span className="inline-flex rounded-full border border-[#d7e2f6] bg-[#f4f8ff] px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-[#2b6be7]">
              {report.id_bp}
            </span>
          </td>
        );
      case "date":
        return (
          <td key={column} className="px-6 py-5">
            <span className="inline-flex text-sm font-black uppercase tracking-[0.12em] text-[#617187]">
              {formatCompactReportDate(report.event_date)}
            </span>
          </td>
        );
      case "match":
        return (
          <td
            key={column}
            className={selectedReport ? "px-5 py-5" : "px-8 py-5"}
          >
            <MatchSummaryCell
              matchLabel={report.match_label}
              competition={report.competition}
              metaTime={report.event_time}
              compact={Boolean(selectedReport)}
            />
          </td>
        );
      case "responsible":
        return (
          <td key={column} className="px-6 py-5">
            <div className="flex min-w-0 items-center gap-3">
              <HoverAvatarBadge
                initials={getInitials(report.responsible_name)}
                roleLabel="Responsable"
                tone="accent"
                size="sm"
              />
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--foreground)]">
                {report.responsible_name}
              </span>
            </div>
          </td>
        );
      case "paid":
        return (
          <td key={column} className="px-6 py-5">
            <div className="flex min-h-10 items-center justify-center">
              {report.paid ? (
                <CircleCheckBig className="size-6 text-[#10b981]" />
              ) : (
                <CircleX className="size-6 text-[#e44b68]" />
              )}
            </div>
          </td>
        );
      case "feed":
        return (
          <td key={column} className="px-6 py-5">
            <div className="flex min-h-10 items-center justify-center">
              {report.feed_detected ? (
                <CircleCheckBig className="size-6 text-[#10b981]" />
              ) : (
                <CircleX className="size-6 text-[#e44b68]" />
              )}
            </div>
          </td>
        );
      case "severity":
        return (
          <td key={column} className="px-6 py-5">
            <SeverityBadge severity={report.severity} />
          </td>
        );
      case "action":
        return (
          <td key={column} className="px-8 py-5 text-right">
            <button
              type="button"
              title={editable ? "Editar reporte" : "Ver reporte"}
              className="inline-flex size-10 items-center justify-center rounded-xl text-[#94a3b8] transition hover:bg-[var(--accent)] hover:text-white"
            >
              {editable ? <Pencil className="size-4" /> : <Eye className="size-4" />}
            </button>
          </td>
        );
      default:
        return null;
    }
  };

  const renderRankingHeader = (column: ReportRankingColumn) => {
    const isDropTarget =
      !!draggedRankingColumn &&
      draggedRankingColumn !== column &&
      dragOverRankingColumn === column;

    const label =
      column === "responsible"
        ? "Responsable"
        : column === "role"
          ? "Rol"
        : column === "assignments"
          ? "Asignaciones"
          : "Reportes";

    return (
      <th
        key={column}
        className={cn(
          "px-2 pb-4 transition-colors",
          isDropTarget && "bg-[#f8fafc]",
        )}
        onDragOver={(event) => {
          event.preventDefault();
          handleRankingColumnDragOver(column);
        }}
        onDrop={(event) => {
          event.preventDefault();
          handleRankingColumnDrop(column);
        }}
      >
        <div
          className="flex items-center justify-between gap-2"
        >
          <SortHeader
            label={label}
            active={rankingSortBy === column}
            direction={rankingSortDirection}
            onClick={() => handleRankingSort(column)}
            align="left"
          />
          <button
            type="button"
            draggable
            aria-label={`Reordenar columna ${label}`}
            onDragStart={() => handleRankingColumnDragStart(column)}
            onDragEnd={handleRankingColumnDragEnd}
            className={cn(
              "inline-flex size-6 items-center justify-center rounded-md text-[#b0bccd] transition hover:bg-[#eef2f7] hover:text-[#617187]",
              draggedRankingColumn === column &&
                "bg-white text-[#617187] shadow-sm",
            )}
          >
            <GripVertical className="size-3.5" />
          </button>
        </div>
      </th>
    );
  };

  const renderRankingCell = (
    item: (typeof responsibleRanking)[number],
    column: ReportRankingColumn,
  ) => {
    switch (column) {
      case "responsible":
        return (
          <td key={column} className="px-2 py-4">
            <div className="flex items-center gap-3">
              <HoverAvatarBadge
                initials={getInitials(item.responsible)}
                roleLabel="Responsable"
                tone="accent"
                size="sm"
              />
              <span className="text-sm font-bold text-[var(--foreground)]">
                {item.responsible}
              </span>
            </div>
          </td>
        );
      case "role":
        return (
          <td key={column} className="px-2 py-4">
            <span className="inline-flex rounded-full border border-[#d7e2f6] bg-[#f4f8ff] px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-[#617187]">
              {item.role}
            </span>
          </td>
        );
      case "assignments":
        return (
          <td key={column} className="px-2 py-4 text-sm font-medium text-[#617187]">
            {item.assignments}
          </td>
        );
      case "reports":
        return (
          <td key={column} className="px-2 py-4 text-sm font-medium text-[#617187]">
            {item.reports}
          </td>
        );
      default:
        return null;
    }
  };

  const activePeriodValue =
    periodMode === "day"
      ? selectedDayKey
      : periodMode === "week"
        ? selectedWeekKey
        : selectedMonthKey;

  const activePeriodOptions =
    periodMode === "day"
      ? dayOptions
      : periodMode === "week"
        ? weekOptions.map(({ value, label }) => ({ value, label }))
        : monthOptions;
  const activePeriodLabel =
    activePeriodOptions.find((option) => option.value === activePeriodValue)?.label ??
    activePeriodValue;

  const reportsBlockTitle =
    leagueFilter !== "Todas las ligas" ? leagueFilter : "Control de reportes";
  const canvasTone =
    activeView === "control" && leagueFilter !== "Todas las ligas"
      ? getReportLeagueCanvasTone(leagueFilter)
      : null;

  async function exportVisibleReports(sourceReports: ReportRecord[]) {
    if (!sourceReports.length || isExporting) {
      return;
    }

    setIsExporting(true);

    try {
      const reportGroups = groupReportsByLeague(sourceReports);
      const fileBaseName = [
        "reportes",
        sanitizeFileSegment(
          leagueFilter !== "Todas las ligas" ? leagueFilter : "todas-las-ligas",
        ),
        sanitizeFileSegment(activePeriodLabel),
      ]
        .filter(Boolean)
        .join("-");

      const excelDocument = buildReportsExcelDocument(
        reportGroups,
        activePeriodLabel,
      );

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
        format: "a4",
      });
      const pageWidth = pdfDocument.internal.pageSize.getWidth();
      const pageHeight = pdfDocument.internal.pageSize.getHeight();
      const marginX = 32;
      const contentWidth = pageWidth - marginX * 2;
      let currentY = 32;

      pdfDocument.setFont("helvetica", "bold");
      pdfDocument.setFontSize(16);
      pdfDocument.setTextColor(15, 23, 42);
      pdfDocument.text("Control de reportes", marginX, currentY);
      currentY += 18;

      pdfDocument.setFont("helvetica", "normal");
      pdfDocument.setFontSize(10);
      pdfDocument.setTextColor(100, 116, 139);
      pdfDocument.text(`Periodo exportado: ${activePeriodLabel}`, marginX, currentY);
      currentY += 20;

      reportGroups.forEach(({ league, items }, index) => {
        if (index > 0 && currentY > pageHeight - 160) {
          pdfDocument.addPage();
          currentY = 32;
        }

        const accent = hexToRgb(getReportLeagueAccentColor(league));
        pdfDocument.setFillColor(accent.red, accent.green, accent.blue);
        pdfDocument.rect(marginX, currentY, contentWidth, 24, "F");
        pdfDocument.setFont("helvetica", "bold");
        pdfDocument.setFontSize(11);
        pdfDocument.setTextColor(255, 255, 255);
        pdfDocument.text(league, marginX + 10, currentY + 16);

        autoTable(pdfDocument, {
          startY: currentY + 24,
          margin: { left: marginX, right: marginX },
          head: [REPORT_EXPORT_COLUMNS.map((column) => column.label)],
          body: items.map((report) =>
            REPORT_EXPORT_COLUMNS.map((column) => column.value(report)),
          ),
          theme: "grid",
          styles: {
            font: "helvetica",
            fontSize: 8,
            cellPadding: 5,
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
          },
          alternateRowStyles: {
            fillColor: [248, 250, 252],
          },
          columnStyles: {
            0: { cellWidth: 60 },
            1: { cellWidth: 82 },
            2: { cellWidth: 64 },
            3: { cellWidth: 44 },
            4: { cellWidth: 128 },
            5: { cellWidth: 160 },
            6: { cellWidth: 58 },
            7: { cellWidth: 66 },
            8: { cellWidth: 68 },
            9: { cellWidth: 48 },
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

  useEffect(() => {
    const root = document.documentElement;

    if (canvasTone) {
      root.style.setProperty("--page-canvas", canvasTone);
      root.style.setProperty("--page-footer-bg", canvasTone);
    } else {
      root.style.removeProperty("--page-canvas");
      root.style.removeProperty("--page-footer-bg");
    }

    return () => {
      root.style.removeProperty("--page-canvas");
      root.style.removeProperty("--page-footer-bg");
    };
  }, [canvasTone]);

  const periodSelector = (
    <>
      <SegmentedControl
        items={[
          { key: "day", label: "Día", active: periodMode === "day", onClick: () => setPeriodMode("day") },
          { key: "week", label: "Semana", active: periodMode === "week", onClick: () => setPeriodMode("week") },
          { key: "month", label: "Mes", active: periodMode === "month", onClick: () => setPeriodMode("month") },
        ]}
      />

      <div className="relative">
        <CalendarDays className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--accent)]" />
        <select
          value={activePeriodValue}
          onChange={(event) => {
            const value = event.target.value;

            if (periodMode === "day") {
              setSelectedDayKey(value);
              return;
            }

            if (periodMode === "week") {
              setSelectedWeekKey(value);
              return;
            }

            setSelectedMonthKey(value);
          }}
          className="h-12 appearance-none rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--surface)] pl-10 pr-10 text-sm font-bold text-[#617187] outline-none transition hover:bg-[#fafbfd]"
        >
          {activePeriodOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-[#94a3b8]" />
      </div>
    </>
  );

  const summaryActions = (
    <>
      {periodSelector}
      <div className="relative">
        <select
          value={leagueFilter}
          onChange={(event) => setLeagueFilter(event.target.value)}
          className="h-12 appearance-none rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--surface)] px-4 pr-9 text-sm font-bold text-[#617187] outline-none shadow-sm transition hover:bg-[#fafbfd]"
        >
          {leagueOptions.map((league) => (
            <option key={league} value={league}>
              {league}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-[#94a3b8]" />
      </div>
      <SectionAiAssistant
        section="Reportes"
        title="Consulta el resumen actual"
        description="Haz preguntas ejecutivas sobre volumen, calidad, pagos, feed y responsables usando el corte visible."
        placeholder="Ej. ¿Qué liga concentra más reportes con incidencia en este periodo?"
        contextLabel="Resumen filtrado de reportes"
        context={aiContext}
        guidance="Responde con foco ejecutivo: volumen, incidencia, pagos, feed detectado, responsables y ligas más relevantes."
        examples={[
          "¿Qué liga tiene más cierres con incidencia?",
          "¿Cuántos reportes críticos están sin pago?",
          "¿Quién lidera el ranking de responsables visibles?",
        ]}
        hasGeminiKey={hasGeminiKey}
        buttonVariant="icon"
      />
      <ToolbarIconButton
        type="button"
        onClick={() => void exportVisibleReports(baseFilteredReports)}
        disabled={!baseFilteredReports.length || isExporting}
        aria-label={isExporting ? "Exportando reportes" : "Exportar reportes"}
        title={isExporting ? "Exportando reportes" : "Exportar reportes"}
      >
        <Download className="size-4" />
      </ToolbarIconButton>
    </>
  );

  const controlActions = (
    <>
      <ToolbarSearchField
        as="div"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Buscar ID feed, ID BP, liga o responsable..."
        className="min-w-[280px] flex-none"
        inputClassName="text-sm font-medium text-[var(--foreground)] placeholder:text-[#94a3b8]"
      />
      <div className="flex shrink-0 items-center gap-3">
        <SectionAiAssistant
          section="Reportes"
          title="Consulta los reportes visibles"
          description="Pregunta por gravedad, responsables, pagos, detección de feed o cierres pendientes usando solo los reportes visibles."
          placeholder="Ej. ¿Qué reportes tienen gravedad alta o crítica y quién es el responsable?"
          contextLabel="Reportes visibles en la tabla actual"
          context={aiContext}
          guidance="Prioriza gravedad, responsable, pago, detección de feed, partido, liga y problema. Si preguntan por pendientes, usa los reportes visibles con incidencia."
          examples={[
            "¿Qué reportes tienen Sin incidencia?",
            "¿Qué responsable lleva más cierres críticos?",
            "¿Qué partidos siguen con problemas de pago?",
          ]}
          hasGeminiKey={hasGeminiKey}
          buttonVariant="icon"
        />
        <ToolbarIconButton
          type="button"
          onClick={() => void exportVisibleReports(sortedReports)}
          disabled={!sortedReports.length || isExporting}
          aria-label={isExporting ? "Exportando reportes" : "Exportar reportes"}
          title={isExporting ? "Exportando reportes" : "Exportar reportes"}
        >
          <Download className="size-4" />
        </ToolbarIconButton>
      </div>
    </>
  );

  const summaryTitle =
    activeView === "summary"
      ? "Resumen de operaciones"
      : activeView === "control"
        ? "Reportes"
        : "Incidencias";

  const summaryDescription =
    activeView === "summary"
      ? "Panel ejecutivo de control, calidad y seguimiento financiero de cierres audiovisuales."
      : activeView === "control"
        ? "Revisa cierres, responsables, pagos y detección de feed del corte visible."
        : "Sigue incidencias, severidad, pruebas y observaciones del periodo visible."

  const headerActions =
    activeView === "summary" ? (
      summaryActions
    ) : activeView === "control" ? (
      <div className="flex flex-wrap items-center gap-3 md:justify-end">
        {controlActions}
      </div>
    ) : (
      <div ref={setIncidentsHeaderActionsPortalTarget} />
    );

  const tabsNavigation = (
    <UnderlineTabs
      variant="section"
      className="border-[#edf1f6]"
      items={[
        {
          key: "summary",
          label: "Resumen",
          icon: BarChart3,
          active: activeView === "summary",
          onClick: () => setActiveView("summary"),
        },
        {
          key: "control",
          label: "Reportes",
          icon: Filter,
          active: activeView === "control",
          onClick: () => setActiveView("control"),
        },
        {
          key: "incidents",
          label: "Incidencias",
          icon: AlertTriangle,
          active: activeView === "incidents",
          onClick: () => setActiveView("incidents"),
        },
      ]}
    />
  );

  const controlWorkspaceContent = (
    <div className="flex min-w-0 flex-col gap-8">
      <section className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Total partidos"
          value={controlMetrics.totalMatches}
          chip={`${controlMetrics.leagueCount} ligas activas`}
          chipTone="success"
          barClassName="bg-[var(--accent)]"
          barWidth={70}
        />
        <MetricCard
          title="Sin incidencia"
          value={controlMetrics.noIncident}
          chip={controlMetrics.noIncident ? "Estable" : "Sin casos"}
          chipTone="success"
          barClassName="bg-[#10b981]"
          barWidth={controlMetrics.noIncidentPercent}
        />
        <MetricCard
          title="Con incidencia"
          value={controlMetrics.withIncident}
          chip={`${controlMetrics.withIncidentPercent}%`}
          chipTone="accent"
          barClassName="bg-[var(--accent)]"
          barWidth={controlMetrics.withIncidentPercent}
          highlight
        />
        <MetricCard
          title="Cierres críticos"
          value={controlMetrics.criticalClosures}
          chip={controlMetrics.criticalClosures ? "Atención" : "Controlado"}
          chipTone="warning"
          barClassName="bg-[#f59e0b]"
          barWidth={controlMetrics.criticalPercent}
        />
      </section>

      <section className="space-y-6">
        <SectionTableCard
          title={reportsBlockTitle}
          icon={FileText}
          badge={
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <select
                  value={leagueFilter}
                  onChange={(event) => setLeagueFilter(event.target.value)}
                  className="h-10 appearance-none rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--surface)] px-4 pr-9 text-sm font-bold text-[#617187] outline-none transition hover:bg-[#fafbfd]"
                >
                  {leagueOptions.map((league) => (
                    <option key={league} value={league}>
                      {league}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-[#94a3b8]" />
              </div>

              <SegmentedControl
                size="sm"
                items={[
                  { key: "day", label: "Día", active: periodMode === "day", onClick: () => setPeriodMode("day") },
                  { key: "week", label: "Semana", active: periodMode === "week", onClick: () => setPeriodMode("week") },
                  { key: "month", label: "Mes", active: periodMode === "month", onClick: () => setPeriodMode("month") },
                ]}
              />

              <div className="relative">
                <CalendarDays className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--accent)]" />
                <select
                  value={activePeriodValue}
                  onChange={(event) => {
                    const value = event.target.value;

                    if (periodMode === "day") {
                      setSelectedDayKey(value);
                      return;
                    }

                    if (periodMode === "week") {
                      setSelectedWeekKey(value);
                      return;
                    }

                    setSelectedMonthKey(value);
                  }}
                  className="h-10 appearance-none rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--surface)] pl-10 pr-10 text-sm font-bold text-[#617187] outline-none transition hover:bg-[#fafbfd]"
                >
                  {activePeriodOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-[#94a3b8]" />
              </div>
            </div>
          }
          footer={
            <>
              <p className="text-xs font-black uppercase tracking-[0.14em] text-[#617187]">
                Mostrando {queryFilteredReports.length} de {reports.length} reportes
              </p>
              <div className="flex gap-1">
                <button className="inline-flex size-9 items-center justify-center rounded-lg border border-[var(--border)] bg-white text-[#94a3b8]">
                  1
                </button>
                <button className="inline-flex size-9 items-center justify-center rounded-lg border border-[var(--border)] bg-[#fafbfd] text-[#94a3b8]">
                  2
                </button>
                <button className="inline-flex size-9 items-center justify-center rounded-lg border border-[var(--border)] bg-[#fafbfd] text-[#94a3b8]">
                  3
                </button>
              </div>
            </>
          }
        >
          {queryFilteredReports.length ? (
            <div className="min-w-0 overflow-x-auto">
              <table className="min-w-full table-fixed text-left">
                <colgroup>
                  {columnOrder.map((column) => (
                    <col
                      key={column}
                      style={{ width: reportColumnWidths[column] }}
                    />
                  ))}
                </colgroup>
                <thead>
                  <tr className="bg-[#fafbfd] text-[11px] font-black uppercase tracking-[0.18em] text-[#94a3b8]">
                    {columnOrder.map((column) =>
                      renderReportControlHeader(column),
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#edf1f6]">
                  {sortedReports.map((report) => {
                    const editable = report.severity !== "Sin incidencia";
                    const selected = selectedReport?.id_feed === report.id_feed;
                    const rowTone = getReportRowTone(report.severity);

                    return (
                      <tr
                        key={report.id_feed}
                        onClick={() => {
                          setSelectedReportId(report.id_feed);
                          setReportDrawerTab("details");
                        }}
                        className={cn(
                          "cursor-pointer transition",
                          selected
                            ? rowTone.active
                            : editable
                              ? rowTone.hover
                              : "opacity-80 hover:bg-[#fafbfd]",
                        )}
                      >
                        {columnOrder.map((column) =>
                          renderReportControlCell(report, column),
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-8">
              <EmptyState
                title="No encontramos reportes con esa búsqueda"
                description="Prueba con otro ID, responsable o liga para volver al tablero completo de cierres."
              />
            </div>
          )}
        </SectionTableCard>
      </section>
    </div>
  );

  const selectedReportDrawer = selectedReport ? (
    <aside className="min-w-0 self-start xl:sticky xl:top-24">
      <div className="panel-surface fixed inset-x-4 bottom-4 top-20 z-40 flex flex-col overflow-hidden border border-[var(--border)] bg-[var(--surface)] xl:static xl:h-[calc(100vh-8rem)] xl:w-full">
        <div className="border-b border-[var(--border)] p-6">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex rounded-full border border-[#f3cfd8] bg-[#fff3f6] px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-[var(--accent)]">
                {selectedReport.id_bp}
              </span>
              <span
                style={{
                  backgroundColor: getTeamLeagueColorSet(selectedReport.league).soft,
                  color: getTeamLeagueColorSet(selectedReport.league).accent,
                }}
                className="inline-flex rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em]"
              >
                {selectedReport.league}
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setSelectedReportId(null);
                setReportDrawerTab("details");
              }}
              aria-label="Cerrar detalle de reporte"
              className="inline-flex size-10 items-center justify-center rounded-full bg-[var(--background-soft)] text-[#94a3b8]"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="space-y-1">
            <p className="text-[1.6rem] font-black leading-[1.05] tracking-[-0.04em] text-[var(--foreground)]">
              {selectedReportTeams?.homeTeam}
            </p>
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[1.6rem] font-black leading-[1.05] tracking-[-0.04em] text-[var(--foreground)]">
              <span className="text-[var(--accent)]">VS</span>
              <span>{selectedReportTeams?.awayTeam}</span>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-4 text-sm text-[#70819b]">
            <span className="inline-flex items-center gap-2">
              <CalendarDays className="size-4 text-[#b1b8c5]" />
              {selectedReport.event_date}
            </span>
            <span className="inline-flex items-center gap-2">
              <Clock3 className="size-4 text-[#b1b8c5]" />
              {selectedReport.event_time}
            </span>
          </div>
          <div className="mt-2 inline-flex items-start gap-2 text-sm text-[#70819b]">
            <MapPin className="mt-0.5 size-4 shrink-0 text-[#b1b8c5]" />
            <span>{selectedReport.venue}</span>
          </div>
        </div>

        <UnderlineTabs
          columns={2}
          items={[
            {
              key: "details",
              label: "Detalle",
              icon: Eye,
              active: reportDrawerTab === "details",
              onClick: () => setReportDrawerTab("details"),
            },
            {
              key: "activity",
              label: "Log",
              icon: History,
              active: reportDrawerTab === "activity",
              onClick: () => setReportDrawerTab("activity"),
            },
          ]}
        />

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 xl:max-h-none">
          {reportDrawerTab === "details" ? (
            <div className="space-y-8">
              <section className="space-y-4">
                <h4 className="text-[11px] font-black uppercase tracking-[0.18em] text-[#94a3b8]">
                  Resumen operativo
                </h4>
                <div className="grid gap-3">
                  <div
                    className={cn(
                      "panel-radius border p-4",
                      selectedReportSeverityTone?.panel,
                    )}
                  >
                    <p
                      className={cn(
                        "text-[10px] font-black uppercase tracking-[0.16em]",
                        selectedReportSeverityTone?.label,
                      )}
                    >
                      Nivel actual
                    </p>
                    <p
                      className={cn(
                        "mt-2 text-sm font-black",
                        selectedReportSeverityTone?.value,
                      )}
                    >
                      {selectedReport.severity}
                    </p>
                  </div>

                  <div className="panel-radius border border-[var(--border)] bg-white p-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#94a3b8]">
                      Responsable
                    </p>
                    <div className="mt-3 flex items-center gap-3">
                      <HoverAvatarBadge
                        initials={getInitials(selectedReport.responsible_name)}
                        roleLabel="Responsable"
                        tone="accent"
                        size="md"
                      />
                      <p className="text-sm font-bold text-[var(--foreground)]">
                        {selectedReport.responsible_name}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="panel-radius border border-[var(--border)] bg-white p-4">
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#94a3b8]">
                        Feed detectó
                      </p>
                      <p className="mt-2 text-sm font-bold text-[var(--foreground)]">
                        {selectedReport.feed_detected ? "Sí" : "No"}
                      </p>
                    </div>
                    <div className="panel-radius border border-[var(--border)] bg-white p-4">
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#94a3b8]">
                        Estado financiero
                      </p>
                      <p className="mt-2 text-sm font-bold text-[var(--foreground)]">
                        {selectedReport.paid ? "Pagado" : "No pagado"}
                      </p>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          ) : (
            <section className="space-y-5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <History className="size-4 text-[var(--accent)]" />
                  <h4 className="text-[11px] font-black uppercase tracking-[0.18em] text-[#94a3b8]">
                    Actividad
                  </h4>
                </div>
                <span className="rounded-full bg-[var(--background-soft)] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-[#7d8ca1]">
                  {activities.slice(0, 3).length} eventos
                </span>
              </div>

              {activities.length ? (
                <div className="space-y-4 border-l border-[var(--border)] pl-5">
                  {activities.slice(0, 3).map((activity) => {
                    const tone = getReportActivityTone(activity.tone);

                    return (
                      <div key={activity.id} className="relative">
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
                              {activity.title}
                            </p>
                            <p className="mt-2 text-xs leading-5 text-[#70819b]">
                              {activity.detail}
                            </p>
                          </div>
                          <span
                            className={cn(
                              "shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em]",
                              tone.badge,
                            )}
                          >
                            {activity.timestamp}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-[10px] border border-dashed border-[var(--border)] bg-[var(--background-soft)] p-4 text-sm text-[#617187]">
                  Todavía no hay actividad registrada para este reporte.
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </aside>
  ) : null;
  const hasEmbeddedIncidentDrawer = activeView === "incidents" && Boolean(selectedEmbeddedIncidentId);
  const hasNonSummaryDrawer = activeView === "control"
    ? Boolean(selectedReportDrawer)
    : hasEmbeddedIncidentDrawer;

  return (
    <div
      className={cn(
        "flex min-h-[42rem] flex-col transition-colors",
        activeView === "summary" ? "gap-4" : "gap-3",
      )}
    >
      {activeView === "summary" ? (
        <>
          <SectionPageHeader
            title={summaryTitle}
            description={summaryDescription}
            actions={headerActions}
          />
          {tabsNavigation}
        <div className="space-y-8">
          <section className="grid gap-8 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,1fr)]">
            <div className="space-y-8">
              <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 [&>*]:h-full">
                <MetricCard
                  title="Total partidos"
                  value={summaryMetrics.totalReports}
                  chip={`${summaryMetrics.activeLeagues} ligas activas`}
                  chipTone="success"
                  barClassName="bg-[var(--accent)]"
                  barWidth={100}
                />
                <MetricCard
                  title="Total incidencias"
                  value={summaryMetrics.withIncident}
                  chip={`${summaryMetrics.incidentPercent}% del total`}
                  chipTone="warning"
                  barClassName="bg-[#f59e0b]"
                  barWidth={summaryMetrics.incidentPercent}
                />
                <MetricCard
                  title="Detección de feed"
                  value={summaryMetrics.feedDetectedCount}
                  chip={`${summaryMetrics.feedPercent}% del total`}
                  chipTone="success"
                  barClassName="bg-[#10b981]"
                  barWidth={summaryMetrics.feedPercent}
                />
                <MetricCard
                  title="Pago"
                  value={summaryMetrics.paidCount}
                  chip={`${summaryMetrics.paidPercent}% del total`}
                  chipTone="success"
                  barClassName="bg-[#10b981]"
                  barWidth={summaryMetrics.paidPercent}
                />
              </section>

              <article className="panel-surface border border-[var(--border)] bg-[var(--surface)] p-6">
                <div className="mb-6 flex items-center justify-between gap-4">
                  <div>
                    <h3 className="text-2xl font-black text-[var(--foreground)]">
                      Evolución de reportes por liga{" "}
                      {periodMode === "day"
                        ? "por hora"
                        : periodMode === "week"
                          ? "por día"
                          : "por semana"}
                    </h3>
                    <p className="mt-1 text-sm font-medium text-[#617187]">
                      Comparativo temporal de ligas y su volumen de reportes dentro del corte visible.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <SegmentedControl
                      size="sm"
                      items={[
                        {
                          key: "count",
                          label: "Cantidad",
                          active: incidentChartMetric === "count",
                          onClick: () => setIncidentChartMetric("count"),
                        },
                        {
                          key: "rate",
                          label: "Tasa %",
                          active: incidentChartMetric === "rate",
                          onClick: () => setIncidentChartMetric("rate"),
                        },
                      ]}
                    />
                    <SegmentedControl
                      size="sm"
                      items={[
                        {
                          key: "top-5",
                          label: "Top 5",
                          active: incidentChartLimit === 5,
                          onClick: () => setIncidentChartLimit(5),
                        },
                        {
                          key: "top-10",
                          label: "Top 10",
                          active: incidentChartLimit === 10,
                          onClick: () => setIncidentChartLimit(10),
                        },
                      ]}
                    />
                  </div>
                </div>

                <div className="rounded-[var(--panel-radius)] bg-transparent">
                  {incidentLeagueChart.series.length ? (
                    <div className="space-y-5">
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        {incidentLeagueChart.series.map((item) => (
                          <div
                            key={item.league}
                            className="rounded-[var(--panel-radius)] border border-[#edf1f6] bg-white/80 p-3"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <span className="inline-flex items-center gap-2 text-sm font-bold text-[var(--foreground)]">
                                <span
                                  className="size-2.5 rounded-full"
                                  style={{ backgroundColor: item.color }}
                                />
                                {item.league}
                              </span>
                              <span className="text-xs font-black uppercase tracking-[0.14em] text-[#617187]">
                                {incidentChartMetric === "count"
                                  ? `${item.totalIncidents} inc.`
                                  : `${Math.max(...item.points.map((point) => point.value)).toFixed(1)}% máx`}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="h-[420px] rounded-[var(--panel-radius)] bg-white px-1 py-2 sm:px-0.5">
                        <svg
                          viewBox={`0 0 ${incidentChartFrame.width} ${incidentChartFrame.height}`}
                          className="h-full w-full overflow-visible"
                        >
                          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                            const y =
                              incidentChartFrame.marginTop +
                              incidentChartPlotHeight * ratio;

                            return (
                              <line
                                key={ratio}
                                x1={incidentChartFrame.marginLeft}
                                x2={incidentChartFrame.width - incidentChartFrame.marginRight}
                                y1={y}
                                y2={y}
                                stroke="#edf1f6"
                                strokeWidth="1"
                              />
                            );
                          })}

                          {incidentLeagueChart.series.map((item) => {
                            const values = item.points.map((point) => point.value);
                            const path = buildChartLinePath(
                              values,
                              incidentChartPlotWidth,
                              incidentChartPlotHeight,
                              incidentLeagueChart.maxValue,
                            );

                            return (
                              <g
                                key={item.league}
                                transform={`translate(${incidentChartFrame.marginLeft} ${incidentChartFrame.marginTop})`}
                              >
                                <path
                                  d={path}
                                  fill="none"
                                  stroke={item.color}
                                  strokeWidth={item.strokeWidth}
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  opacity={item.strokeWidth > 3 ? 1 : 0.9}
                                />
                                {values.map((value, index) => {
                                  const x =
                                    values.length === 1
                                      ? incidentChartPlotWidth / 2
                                      : (incidentChartPlotWidth /
                                          Math.max(values.length - 1, 1)) *
                                        index;
                                  const y =
                                    incidentChartPlotHeight -
                                    (value /
                                      Math.max(incidentLeagueChart.maxValue, 1)) *
                                      incidentChartPlotHeight;

                                  return (
                                    <circle
                                      key={`${item.league}-${incidentLeagueChart.labels[index]}`}
                                      cx={x}
                                      cy={y}
                                      r={item.strokeWidth > 3 ? 4.5 : 3.5}
                                      fill={item.color}
                                      stroke="#ffffff"
                                      strokeWidth="2"
                                    />
                                  );
                                })}
                              </g>
                            );
                          })}

                          {incidentLeagueChart.labels.map((label, index, labels) => {
                            const x =
                              labels.length === 1
                                ? incidentChartFrame.marginLeft + incidentChartPlotWidth / 2
                                : incidentChartFrame.marginLeft +
                                  (incidentChartPlotWidth /
                                    Math.max(labels.length - 1, 1)) *
                                    index;

                            return (
                              <text
                                key={label}
                                x={x}
                                y={incidentChartFrame.height - 4}
                                textAnchor="middle"
                                className="fill-[#94a3b8] text-[11px] font-black tracking-[0.12em]"
                              >
                                {label}
                              </text>
                            );
                          })}

                          {[0, 0.5, 1].map((ratio, index) => {
                            const value = Math.round(
                              incidentLeagueChart.maxValue * (1 - ratio) * 10,
                            ) / 10;
                            const y =
                              incidentChartFrame.marginTop +
                              incidentChartPlotHeight * ratio +
                              4;

                            return (
                              <text
                                key={`${ratio}-${index}`}
                              x={2}
                                y={y}
                                textAnchor="start"
                                className="fill-[#94a3b8] text-[11px] font-black"
                              >
                                {incidentChartMetric === "rate" ? `${value}%` : value}
                              </text>
                            );
                          })}
                        </svg>
                      </div>
                    </div>
                  ) : (
                    <EmptyState
                      title="Sin datos para este corte"
                      description="Cambia el periodo o la liga para reconstruir la evolución de incidencias por liga."
                    />
                  )}
                </div>
              </article>
            </div>

            <article className="panel-surface border border-[var(--border)] bg-[var(--surface)] px-8 pb-8 pt-6">
              <h3 className="text-2xl font-black text-[var(--foreground)]">
                Resumen de reportes
              </h3>
              <div className="mt-6 space-y-4.5">
                <div className="space-y-3.5">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#94a3b8]">
                    Por liga
                  </p>
                  {(() => {
                    const maxCount = Math.max(
                      ...visibleLeagueDistribution.map((entry) => entry.count),
                      1,
                    );

                    return visibleLeagueDistribution.map((item) => (
                      <InsightBarRow
                        key={item.league}
                        icon={<LeagueLogoMarkClient league={item.league} className="size-9" />}
                        label={item.league}
                        value={`${item.count} reportes`}
                        bar={
                          <div
                            className="h-full rounded-full bg-[#1f2937]"
                            style={{ width: `${(item.count / maxCount) * 100}%` }}
                          />
                        }
                      />
                    ));
                  })()}
                  {leagueDistribution.length ? (
                    <ExpandDivider
                      expanded={showAllLeagueDistribution}
                      disabled={!canExpandLeagueDistribution}
                      onToggle={() => setShowAllLeagueDistribution((current) => !current)}
                      collapsedLabel="Mostrar más ligas"
                      expandedLabel="Mostrar menos ligas"
                      className="py-[0.25rem]"
                      lineClassName="border-[#edf1f6]"
                      buttonClassName={
                        canExpandLeagueDistribution
                          ? "border-[#d9e1eb] text-[var(--accent)] hover:border-[#efc2cb] hover:bg-[#fff6f8] hover:text-[var(--accent)]"
                          : "cursor-default border-[#e5eaf1] text-[#b8c2d0]"
                      }
                    />
                  ) : null}
                </div>

                <div className="pt-0.5">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#94a3b8]">
                    Por gravedad
                  </p>
                  <div className="mt-3.5 space-y-3.5">
                    {visibleSeverityDistribution.map((item) => {
                      const {
                        barClassName,
                        icon: SeverityIcon,
                        iconClassName,
                      } = getSeverityDistributionMeta(item.severity);

                      return (
                        <InsightBarRow
                          key={item.severity}
                          icon={
                            <SeverityIcon
                              className={cn("size-[1.35rem] shrink-0", iconClassName)}
                            />
                          }
                          label={item.severity}
                          value={`${item.percentage}%`}
                          bar={
                            <div
                              className={cn("h-full rounded-full", barClassName)}
                              style={{ width: `${item.percentage}%` }}
                            />
                          }
                        />
                      );
                    })}
                    {canExpandSeverityDistribution ? (
                      <ExpandDivider
                        expanded={showAllSeverityDistribution}
                        onToggle={() =>
                          setShowAllSeverityDistribution((current) => !current)
                        }
                        collapsedLabel="Mostrar más rubros de gravedad"
                        expandedLabel="Mostrar menos rubros de gravedad"
                        className="py-[0.25rem]"
                        lineClassName="border-[#edf1f6]"
                        buttonClassName="border-[#d9e1eb] text-[var(--accent)] hover:border-[#efc2cb] hover:bg-[#fff6f8] hover:text-[var(--accent)]"
                      />
                    ) : null}
                  </div>
                </div>

                <div className="pt-0">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#94a3b8]">
                      Por sede
                    </p>
                    <span className="text-[10px] font-black uppercase tracking-[0.14em] text-[#94a3b8]">
                      Top {Math.min(venueRecurrence.length, showAllVenueRecurrence ? 10 : 3)}
                    </span>
                  </div>
                  <div className="mt-3.5 space-y-3.5">
                    {visibleVenueRecurrence.length ? (
                      visibleVenueRecurrence.map((item) => (
                        <InsightBarRow
                          key={item.venue}
                          icon={
                            <div title={item.venue} className="flex h-full items-center justify-center">
                              <ClientTeamLogoMark
                                teamName={item.teamName}
                                competition={item.competition}
                                className="size-9 rounded-[12px] border-transparent bg-transparent shadow-none"
                                imageClassName="object-contain p-0.5"
                                initialsClassName="text-[10px] tracking-[0.12em] text-[#70819b]"
                              />
                            </div>
                          }
                          label={item.venue}
                          value={item.total}
                          barContainerClassName="bg-transparent p-0"
                          bar={
                            <div className="flex h-full overflow-hidden rounded-full bg-[#edf1f6]">
                              {item.severities["Crítica"] ? (
                                <div
                                  className="h-full bg-[#a12ad6]"
                                  style={{
                                    width: `${(item.severities["Crítica"] / item.total) * 100}%`,
                                  }}
                                />
                              ) : null}
                              {item.severities.Alta ? (
                                <div
                                  className="h-full bg-[#e44b68]"
                                  style={{
                                    width: `${(item.severities.Alta / item.total) * 100}%`,
                                  }}
                                />
                              ) : null}
                              {item.severities.Media ? (
                                <div
                                  className="h-full bg-[#e7c247]"
                                  style={{
                                    width: `${(item.severities.Media / item.total) * 100}%`,
                                  }}
                                />
                              ) : null}
                              {item.severities.Baja ? (
                                <div
                                  className="h-full bg-[#d8e2ef]"
                                  style={{
                                    width: `${(item.severities.Baja / item.total) * 100}%`,
                                  }}
                                />
                              ) : null}
                            </div>
                          }
                        />
                      ))
                    ) : (
                      <p className="text-sm font-medium text-[#94a3b8]">
                        No hay reincidencias por sede en el periodo visible.
                      </p>
                    )}
                    {canExpandVenueRecurrence ? (
                      <ExpandDivider
                        expanded={showAllVenueRecurrence}
                        onToggle={() => setShowAllVenueRecurrence((current) => !current)}
                        collapsedLabel="Mostrar más sedes"
                        expandedLabel="Mostrar menos sedes"
                        className="py-[0.25rem]"
                        lineClassName="border-[#edf1f6]"
                        buttonClassName="border-[#d9e1eb] text-[var(--accent)] hover:border-[#efc2cb] hover:bg-[#fff6f8] hover:text-[var(--accent)]"
                      />
                    ) : null}
                  </div>
                </div>
              </div>
            </article>
          </section>

          <section className="grid gap-8 xl:grid-cols-[minmax(0,1.7fr)_minmax(340px,1fr)]">
            <article className="panel-surface border border-[var(--border)] bg-[var(--surface)] p-8">
              <div className="mb-6 flex items-center justify-between">
                <h3 className="text-2xl font-black text-[var(--foreground)]">
                  Reportes por personal
                </h3>
                <span className="text-[10px] font-black uppercase tracking-[0.16em] text-[#11915a]">
                  Top performance
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full text-left">
                  <thead>
                    <tr className="border-b border-[#edf1f6] text-[11px] font-black uppercase tracking-[0.16em] text-[#94a3b8]">
                      {rankingColumnOrder.map((column) =>
                        renderRankingHeader(column),
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#edf1f6]">
                    {responsibleRanking.map((item) => (
                      <tr key={item.responsible} className="transition hover:bg-[#fafbfd]">
                        {rankingColumnOrder.map((column) =>
                          renderRankingCell(item, column),
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>

            <div>
              <article className="rounded-[var(--panel-radius)] bg-[var(--accent)] p-6 text-white shadow-[0_18px_40px_rgba(230,18,56,0.18)]">
                <div className="flex items-center gap-2">
                  <Bot className="size-5" />
                  <h3 className="text-xl font-black">Insights de IA</h3>
                </div>
                <div className="mt-6 space-y-3">
                  {summaryInsights.slice(0, 2).map((insight, index) => (
                    <div
                      key={insight}
                      className="rounded-[var(--panel-radius)] border border-white/15 bg-white/10 p-4"
                    >
                      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/70">
                        {index === 0 ? "Anomalía detectada" : "Lectura de periodo"}
                      </p>
                      <p className="mt-2 text-sm font-medium leading-6">{insight}</p>
                    </div>
                  ))}
                </div>
                <button className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-[var(--panel-radius)] bg-white px-4 py-3 text-sm font-extrabold text-[var(--accent)] transition hover:bg-white/95">
                  <Sparkles className="size-4" />
                  Generar reporte detallado
                </button>
              </article>
            </div>
          </section>
        </div>
        </>
      ) : (
        <div
          className={cn(
            "grid gap-6 transition-colors",
            hasNonSummaryDrawer
              ? "xl:grid-cols-[minmax(0,1fr)_390px]"
              : "grid-cols-1",
          )}
        >
          <div className="flex min-w-0 flex-col gap-3">
            <SectionPageHeader
              title={summaryTitle}
              description={summaryDescription}
              actions={headerActions}
            />
            {tabsNavigation}
            {activeView === "control" ? (
              <div className="-mt-1">{controlWorkspaceContent}</div>
            ) : (
              <IncidentsWorkspace
                incidents={incidents}
                hasGeminiKey={hasGeminiKey}
                embedded
                headerActionsPortalTarget={incidentsHeaderActionsPortalTarget}
                drawerPortalTarget={incidentsDrawerPortalTarget}
                onSelectedIdChange={setSelectedEmbeddedIncidentId}
              />
            )}
          </div>
          {activeView === "control" ? selectedReportDrawer : hasEmbeddedIncidentDrawer ? (
            <div ref={setIncidentsDrawerPortalTarget} className="min-w-0 self-start" />
          ) : null}
        </div>
      )}
    </div>
  );
}
