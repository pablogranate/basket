"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { addMinutes, format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import {
  CalendarDays,
  Camera,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Hash,
  History,
  Mail,
  MapPin,
  Megaphone,
  MessageCircleMore,
  Mic2,
  ShieldUser,
  UserRound,
  Video,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";

import { setAttendanceConfirmationAction } from "@/app/actions/matches";
import { LeagueLogoMarkClient } from "@/components/league-logo-mark-client";
import { ClientTeamLogoMark } from "@/components/team-logo-mark-client";
import dynamic from "next/dynamic";
import { badgeBaseClassName } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { HoverAvatarBadge } from "@/components/ui/hover-avatar-badge";
import { UnderlineTabs } from "@/components/ui/underline-tabs";
import {
  PRODUCTION_SHORT_LABEL,
  RESPONSIBLE_DISPLAY_LABEL,
} from "@/lib/constants";
import type {
  CollaboratorAssignmentItem,
  CollaboratorGroupContact,
} from "@/lib/data/collaborators";
import { getProductionModeLabel } from "@/lib/constants";
import { getRoleDisplayName } from "@/lib/display";
import { buildWhatsAppUrl, cn, normalizeText } from "@/lib/utils";

// Lazy: the report form (~49KB) only mounts when a collaborator opens the
// reporting flow, so keep it out of the initial /mi-jornada bundle.
const CollaboratorReportForm = dynamic(
  () =>
    import("@/components/collaborators/collaborator-report-form").then(
      (mod) => mod.CollaboratorReportForm,
    ),
  { ssr: false },
);

type MyDayAssignmentsPanelProps = {
  hasLinkedPerson: boolean;
  showDemoToday: boolean;
  // Externo (collaborator/viewer) users cannot reach /grid; hide the shortcut.
  canViewGrid: boolean;
  // Today's date onward — the primary list.
  assignments: CollaboratorAssignmentItem[];
  // Earlier than today but within the current month — revealed on demand.
  pastAssignments: CollaboratorAssignmentItem[];
  topContent?: ReactNode;
};

type GroupDrawerTab = "group" | "context";
type MyDayViewMode = "cards" | "table";
const TABLE_DESKTOP_MEDIA_QUERY = "(min-width: 1280px)";

const NAME_CONNECTORS = new Set([
  "de",
  "del",
  "la",
  "las",
  "los",
  "da",
  "das",
  "do",
  "dos",
  "van",
  "von",
  "y",
]);

function capitalizeSentence(value: string) {
  if (!value) {
    return value;
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}

function abbreviatePersonName(value: string | null | undefined) {
  if (!value?.trim()) {
    return "Sin asignar";
  }

  const parts = value.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 1) {
    return capitalizeSentence(parts[0]);
  }

  const surname =
    parts
      .slice(1)
      .find((part) => !NAME_CONNECTORS.has(normalizeText(part))) ?? parts[1];

  return `${parts[0][0]?.toUpperCase() ?? ""}. ${capitalizeSentence(surname)}`;
}

function getInitials(value: string | null | undefined) {
  if (!value?.trim()) {
    return "--";
  }

  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function getAssignmentLeagueAccentColor(league: string | null | undefined) {
  const normalizedLeague = normalizeText(league ?? "");

  if (normalizedLeague.includes("liga nacional")) {
    return "#e61238";
  }

  if (normalizedLeague.includes("liga federal")) {
    return "#e67b18";
  }

  if (
    normalizedLeague.includes("liga proximo") ||
    normalizedLeague.includes("liga próximo")
  ) {
    return "#22a35a";
  }

  if (normalizedLeague.includes("acb") || normalizedLeague.includes("liga endesa")) {
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

  return "#e61238";
}

function getAssignmentContacts(
  assignment: CollaboratorAssignmentItem,
): CollaboratorGroupContact[] {
  if (assignment.contacts.length) {
    return assignment.contacts;
  }

  return [
    {
      roleName: "Responsable",
      roleCategory: "Coordinacion",
      sortOrder: 10,
      personName: assignment.responsibleName ?? assignment.ownerName,
      phone: assignment.ownerPhone,
      email: assignment.ownerEmail,
    },
    {
      roleName: "Realizador",
      roleCategory: "Produccion",
      sortOrder: 20,
      personName: assignment.realizerName,
      phone: null,
      email: null,
    },
    {
      roleName: "Productor",
      roleCategory: "Produccion",
      sortOrder: 50,
      personName: assignment.producerName,
      phone: null,
      email: null,
    },
    {
      roleName: "Relator",
      roleCategory: "Talento",
      sortOrder: 60,
      personName: assignment.relatorName,
      phone: null,
      email: null,
    },
  ].filter((contact) => contact.personName);
}

function formatAssignmentDrawerDate(assignment: CollaboratorAssignmentItem) {
  return capitalizeSentence(
    format(parseISO(assignment.kickoffAt), "d MMM yyyy", { locale: es }),
  );
}

function formatAssignmentPlanillaDate(assignment: CollaboratorAssignmentItem) {
  return capitalizeSentence(
    format(parseISO(assignment.kickoffAt), "dd 'de' MMMM 'de' yyyy", { locale: es }),
  );
}

function getAssignmentTablePersonValue(value: string | null | undefined) {
  const normalized = value?.trim();

  return {
    value: normalized || "TBD",
    muted: !normalized,
  };
}

function formatAssignmentProductionModeLabel(mode: string | null | undefined) {
  const label = getProductionModeLabel(mode);

  if (!label) {
    return "SIN MODO";
  }

  return label;
}

function formatAssignmentProductionMeta(assignment: CollaboratorAssignmentItem) {
  const roleLabel = getRoleDisplayName(assignment.roleName) || "Sin rol";
  const cameraLabel =
    assignment.cameraCount > 0
      ? `${assignment.cameraCount} ${assignment.cameraCount === 1 ? "camara" : "camaras"}`
      : "sin camaras";

  return `${roleLabel} · ${cameraLabel}`;
}

function AssignmentDetailPill({
  icon: Icon,
  label,
  value,
  tone = "default",
  highlight = false,
  variant = "icon",
  compact = false,
}: {
  icon: typeof UserRound;
  label: string;
  value: string;
  tone?: "default" | "success";
  highlight?: boolean;
  variant?: "icon" | "person";
  compact?: boolean;
}) {
  return (
    <div className={cn("flex min-w-0 items-start", compact ? "gap-2.5" : "gap-3")}>
      {variant === "person" ? (
        <span
          className={cn(
            "mt-0.5 inline-flex shrink-0 items-center justify-center rounded-full border border-[var(--accent-border)] bg-[var(--accent-soft)] font-black text-[var(--accent)]",
            compact ? "size-8 text-[9px]" : "size-9 text-[10px]",
          )}
        >
          {getInitials(value)}
        </span>
      ) : (
        <span
          className={cn(
            "mt-0.5 inline-flex shrink-0 items-center justify-center rounded-full",
            tone === "success"
              ? "bg-[#eafaf0] text-[#1daa59]"
              : "bg-[var(--n-100)] text-[var(--n-400)]",
            compact ? "size-8" : "size-9",
          )}
        >
          <Icon className={compact ? "size-3.5" : "size-4"} />
        </span>
      )}

      <div className="min-w-0">
        <div
          className={cn(
            "font-black uppercase text-[var(--n-400)]",
            compact ? "text-[9px] tracking-[0.14em]" : "text-[10px] tracking-[0.16em]",
          )}
        >
          {label}
        </div>
        <p
          className={cn(
            "mt-1 font-extrabold leading-tight text-[var(--foreground)]",
            compact ? "text-[12px]" : "text-[13px]",
            highlight && "text-[var(--accent)]",
            tone === "success" && "flex items-center gap-2",
          )}
        >
          {tone === "success" ? (
            <span className={cn("rounded-full bg-[#23b25f]", compact ? "size-2" : "size-2.5")} />
          ) : null}
          <span>{value}</span>
        </p>
      </div>
    </div>
  );
}

function getAssignmentOperationalItems(assignment: CollaboratorAssignmentItem) {
  const responsibleLabel = abbreviatePersonName(
    assignment.responsibleName ?? assignment.ownerName,
  );
  const relatorLabel = abbreviatePersonName(
    assignment.relatorName ?? assignment.talentLabel?.split("/")[0]?.trim() ?? null,
  );
  const producerLabel = abbreviatePersonName(assignment.producerName);
  const productionLabel = getProductionModeLabel(assignment.productionMode) || "Sin definir";
  const roleLabel = getRoleDisplayName(assignment.roleName) || "Por definir";
  const cameraLabel =
    assignment.cameraCount > 0
      ? `${assignment.cameraCount} ${assignment.cameraCount === 1 ? "unidad" : "unidades"}`
      : "Sin definir";

  return [
    {
      key: "produ",
      icon: Video,
      label: "Produ",
      value: productionLabel,
      tone: "success" as const,
    },
    {
      key: "responsable",
      icon: ShieldUser,
      label: RESPONSIBLE_DISPLAY_LABEL,
      value: responsibleLabel,
      variant: "person" as const,
    },
    {
      key: "productor",
      icon: UserRound,
      label: "Productor",
      value: producerLabel,
      variant: "person" as const,
    },
    {
      key: "relator",
      icon: Mic2,
      label: "Relator",
      value: relatorLabel,
      variant: "person" as const,
    },
    {
      key: "modo",
      icon: CalendarDays,
      label: PRODUCTION_SHORT_LABEL,
      value: roleLabel,
      highlight: true,
    },
    {
      key: "camaras",
      icon: Camera,
      label: "Cámaras",
      value: cameraLabel,
    },
  ];
}

function AssignmentOperationalSummary({
  assignment,
  compact = false,
}: {
  assignment: CollaboratorAssignmentItem;
  compact?: boolean;
}) {
  const items = getAssignmentOperationalItems(assignment);

  return (
    <div
      className={cn(
        "grid grid-cols-2",
        compact
          ? "min-w-0 gap-x-4 gap-y-3 xl:grid-cols-3 xl:gap-x-5"
          : "gap-x-5 gap-y-4",
      )}
    >
      {items.map((item) => (
        <AssignmentDetailPill
          key={`${assignment.assignmentId}-${item.key}`}
          compact={compact}
          icon={item.icon}
          label={item.label}
          value={item.value}
          tone={item.tone}
          highlight={item.highlight}
          variant={item.variant}
        />
      ))}
    </div>
  );
}

function AssignmentCard({
  assignment,
  onOpenGroup,
  onOpenReport,
}: {
  assignment: CollaboratorAssignmentItem;
  onOpenGroup: (assignmentId: string) => void;
  onOpenReport: (assignmentId: string) => void;
}) {
  const leagueLabel = assignment.competition ?? "Sin liga";
  const leagueAccent = getAssignmentLeagueAccentColor(leagueLabel);

  return (
    <Card className="relative z-0 w-full max-w-full overflow-hidden rounded-[var(--panel-radius)] border border-[#eee7e1] bg-[#fffdfa] p-0 shadow-[0_10px_24px_rgba(28,13,16,0.05)] transition duration-200 will-change-transform hover:z-10 hover:-translate-y-0.5 hover:scale-[1.015] hover:shadow-[0_16px_32px_rgba(28,13,16,0.08)] sm:w-[330px] sm:max-w-[330px]">
      <div className="relative px-4 pb-0">
        <div
          className="-mx-4 -mt-px px-4 py-2.5"
          style={{ backgroundColor: leagueAccent }}
        >
          <div className="relative flex items-center justify-between gap-4">
            <div className="flex justify-start">
              <LeagueLogoMarkClient
                league={leagueLabel}
                className="size-9 rounded-full ring-2 ring-white/20"
              />
            </div>

            <div className="pointer-events-none absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-center px-14">
              <span className="max-w-[10rem] text-center text-[10px] font-black uppercase tracking-[0.16em] text-white">
                {leagueLabel}
              </span>
            </div>

            <div className="ml-auto min-w-[64px] text-right">
              <p className="text-[20px] font-black leading-none text-white">
                {assignment.timeLabel}
              </p>
            </div>
          </div>
        </div>

        <div
          className="-mx-4 border-t-2 bg-[var(--n-100)] px-4 py-4"
          style={{ borderTopColor: leagueAccent }}
        >
          <div className="relative z-10">
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
              <div className="flex justify-center">
                <ClientTeamLogoMark
                  teamName={assignment.homeTeam}
                  competition={assignment.competition}
                  className="size-16 rounded-full border border-[var(--n-200)] bg-white shadow-[0_10px_22px_rgba(28,13,16,0.08)]"
                  imageClassName="p-2"
                  initialsClassName="text-sm"
                />
              </div>

              <div className="flex shrink-0 flex-col items-center justify-center">
                <div className="h-px w-8 bg-[var(--n-200)]" />
                <span className="py-1.5 text-[18px] font-black italic text-[var(--accent)]">
                  vs
                </span>
                <div className="h-px w-8 bg-[var(--n-200)]" />
              </div>

              <div className="flex justify-center">
                <ClientTeamLogoMark
                  teamName={assignment.awayTeam}
                  competition={assignment.competition}
                  className="size-16 rounded-full border border-[var(--n-200)] bg-white shadow-[0_10px_22px_rgba(28,13,16,0.08)]"
                  imageClassName="p-2"
                  initialsClassName="text-sm"
                />
              </div>
            </div>

            <div className="mt-3 grid grid-cols-[1fr_auto_1fr] gap-3">
              <div className="flex justify-center">
                <p className="max-w-[7rem] text-center text-[14px] font-black leading-tight tracking-tight text-[var(--foreground)]">
                  {assignment.homeTeam}
                </p>
              </div>

              <div />

              <div className="flex justify-center">
                <p className="max-w-[7rem] text-center text-[14px] font-black leading-tight tracking-tight text-[var(--foreground)]">
                  {assignment.awayTeam}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-3.5 flex items-center justify-center gap-2 text-center text-[12px] font-semibold text-[var(--n-400)]">
            <MapPin className="size-3.5" />
            <span className="truncate">{assignment.venue ?? "Sede por definir"}</span>
          </div>
        </div>

        <div className="-mx-4 border-t border-[#efe7e1] bg-white px-4 py-4">
          <AssignmentOperationalSummary assignment={assignment} />
        </div>

        <div className="-mx-4 border-t border-[#efe7e1] bg-white px-4 py-4">
          <AttendanceInlineControl assignment={assignment} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 border-t border-[#efe7e1] bg-[#fbfaf7] p-4">
        <button
          type="button"
          onClick={() => onOpenGroup(assignment.assignmentId)}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-[var(--panel-radius)] bg-[#1faa52] px-3 text-xs font-black text-white shadow-[0_14px_28px_rgba(31,170,82,0.18)] transition hover:brightness-105"
        >
          <span className="inline-flex size-6 items-center justify-center rounded-full bg-[var(--n-100)] shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
            <MessageCircleMore className="size-3.5 text-[#1faa52]" />
          </span>
          Grupo
        </button>

        <button
          type="button"
          onClick={() => onOpenReport(assignment.assignmentId)}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-[var(--panel-radius)] bg-[var(--accent)] px-3 text-xs font-black text-white shadow-[0_14px_28px_rgba(227,27,35,0.22)] transition hover:brightness-105"
        >
          <span className="inline-flex size-6 items-center justify-center rounded-full bg-[var(--n-100)] shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
            <Megaphone className="size-3.5 text-[var(--accent)]" />
          </span>
          Reportar
        </button>
      </div>
    </Card>
  );
}

function AssignmentTable({
  assignments,
  selectedAssignmentId,
  onOpenGroup,
  onOpenReport,
}: {
  assignments: CollaboratorAssignmentItem[];
  selectedAssignmentId: string | null;
  onOpenGroup: (assignmentId: string) => void;
  onOpenReport: (assignmentId: string) => void;
}) {
  return (
    <div className="flex min-h-[42rem] flex-col gap-3 rounded-[var(--panel-radius)]">
      {assignments.map((assignment) => {
        const isSelected = selectedAssignmentId === assignment.assignmentId;
        const leagueLabel = assignment.competition ?? "Sin liga";
        const statusAccentClass = assignment.confirmed ? "bg-[#26b36a]" : "bg-[var(--n-200)]";
        const responsible = getAssignmentTablePersonValue(
          assignment.responsibleName ?? assignment.ownerName,
        );
        const realizer = getAssignmentTablePersonValue(assignment.realizerName);
        const producer = getAssignmentTablePersonValue(assignment.producerName);
        const relator = getAssignmentTablePersonValue(assignment.relatorName);

        return (
          <article
            key={`${assignment.assignmentId}-${assignment.matchId}`}
            onClick={() => onOpenGroup(assignment.assignmentId)}
            className={cn(
              "panel-surface group relative overflow-visible border border-[var(--border)] bg-[var(--surface)] transition",
              "cursor-pointer hover:shadow-[0_16px_36px_rgba(28,13,16,0.08)]",
              isSelected && "border-[var(--accent-border)] shadow-[0_16px_36px_rgba(227,27,35,0.08)]",
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "pointer-events-none absolute left-[-12px] top-1/2 z-0 h-[118px] w-[30px] -translate-y-1/2 rounded-l-[10px] rounded-r-[6px] shadow-[inset_-1px_0_0_rgba(255,255,255,0.16),0_8px_18px_rgba(28,13,16,0.06)]",
                statusAccentClass,
              )}
            />

            <div className="relative z-10 overflow-visible rounded-t-[10px] rounded-b-[10px]">
              <div
                className={cn(
                  "overflow-hidden rounded-t-[10px] rounded-b-[10px] flex flex-col xl:grid xl:grid-cols-[6rem_minmax(15rem,1.45fr)_minmax(12rem,1fr)_minmax(12rem,1fr)_minmax(12.5rem,1.05fr)_minmax(10.5rem,0.92fr)] xl:items-stretch",
                )}
              >
                <div className="relative z-10 flex flex-col items-center justify-center gap-3 border-b border-[var(--border)] bg-[var(--surface)] px-4 py-5 text-center xl:border-b-0 xl:border-r">
                  <LeagueLogoMarkClient league={leagueLabel} className="h-16 w-16" />
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--n-500)]">
                    {leagueLabel}
                  </p>
                </div>

                <div className="flex min-w-0 items-center border-b border-[var(--border)] px-5 py-5 xl:border-b-0 xl:border-r xl:px-5 2xl:px-6">
                  <div className="mx-auto w-full max-w-[22rem]">
                    <div className="grid items-center justify-center gap-2 sm:grid-cols-[minmax(0,1fr)_1.75rem_minmax(0,1fr)] sm:gap-3">
                      <div className="flex min-w-0 flex-col items-center text-center">
                        <ClientTeamLogoMark
                          teamName={assignment.homeTeam}
                          competition={assignment.competition}
                          className="size-12 rounded-full 2xl:size-14"
                        />
                        <p
                          title={assignment.homeTeam}
                          className="mt-2 min-h-[2.16em] text-center text-[0.9rem] font-black leading-[1.08] tracking-[-0.03em] text-[var(--foreground)] [display:-webkit-box] overflow-hidden text-ellipsis [-webkit-box-orient:vertical] [-webkit-line-clamp:2]"
                        >
                          {assignment.homeTeam}
                        </p>
                      </div>

                      <span className="self-center justify-self-center text-sm font-semibold uppercase tracking-[0.18em] text-[var(--n-400)]">
                        vs
                      </span>

                      <div className="flex min-w-0 flex-col items-center text-center">
                        <ClientTeamLogoMark
                          teamName={assignment.awayTeam}
                          competition={assignment.competition}
                          className="size-12 rounded-full 2xl:size-14"
                        />
                        <p
                          title={assignment.awayTeam}
                          className="mt-2 min-h-[2.16em] text-center text-[0.9rem] font-black leading-[1.08] tracking-[-0.03em] text-[var(--foreground)] [display:-webkit-box] overflow-hidden text-ellipsis [-webkit-box-orient:vertical] [-webkit-line-clamp:2]"
                        >
                          {assignment.awayTeam}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-center gap-2 text-center text-[12px] font-semibold text-[var(--n-400)]">
                      <MapPin className="size-3.5 shrink-0" />
                      <span className="truncate">{assignment.venue ?? "Sede por definir"}</span>
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 border-b border-[var(--border)] px-5 py-5 xl:border-b-0 xl:border-r xl:px-6">
                  <div className="flex items-center gap-2">
                    <ShieldUser className="size-3.5 text-[var(--n-400)]" />
                    <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--n-400)]">
                      Staff
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <HoverAvatarBadge
                      initials={getInitials(responsible.value)}
                      roleLabel="Responsable"
                      showTooltip={false}
                      tone="neutral"
                      size="sm"
                    />
                    <div className="min-w-0">
                      <p
                        className={cn(
                          "truncate text-sm font-bold text-[var(--foreground)]",
                          responsible.muted && "text-[var(--muted)] italic font-semibold",
                        )}
                      >
                        {responsible.muted
                          ? responsible.value
                          : abbreviatePersonName(responsible.value)}
                      </p>
                      <p className="text-xs font-semibold text-[var(--muted)]">
                        Responsable
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <HoverAvatarBadge
                      initials={getInitials(realizer.value)}
                      roleLabel="Realizador"
                      showTooltip={false}
                      tone="neutral"
                      size="sm"
                    />
                    <div className="min-w-0">
                      <p
                        className={cn(
                          "truncate text-sm font-bold text-[var(--foreground)]",
                          realizer.muted && "text-[var(--muted)] italic font-semibold",
                        )}
                      >
                        {realizer.muted ? realizer.value : abbreviatePersonName(realizer.value)}
                      </p>
                      <p className="text-xs font-semibold text-[var(--muted)]">Realizador</p>
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 border-b border-[var(--border)] px-5 py-5 xl:border-b-0 xl:border-r xl:px-6">
                  <div className="flex items-center gap-2">
                    <Mic2 className="size-3.5 text-[var(--n-400)]" />
                    <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--n-400)]">
                      Cobertura
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <HoverAvatarBadge
                      initials={getInitials(producer.value)}
                      roleLabel="Productor"
                      showTooltip={false}
                      tone="neutral"
                      size="sm"
                    />
                    <div className="min-w-0">
                      <p
                        className={cn(
                          "truncate text-sm font-bold text-[var(--foreground)]",
                          producer.muted && "text-[var(--muted)] italic font-semibold",
                        )}
                      >
                        {producer.muted ? producer.value : abbreviatePersonName(producer.value)}
                      </p>
                      <p className="text-xs font-semibold text-[var(--muted)]">Productor</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <HoverAvatarBadge
                      initials={getInitials(relator.value)}
                      roleLabel="Relator"
                      showTooltip={false}
                      tone="accent"
                      size="sm"
                    />
                    <div className="min-w-0">
                      <p
                        className={cn(
                          "truncate text-sm font-bold text-[var(--foreground)]",
                          relator.muted && "text-[var(--muted)] italic font-semibold",
                        )}
                      >
                        {relator.muted ? relator.value : abbreviatePersonName(relator.value)}
                      </p>
                      <p className="text-xs font-semibold italic text-[var(--muted)]">
                        Relator
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 border-b border-[var(--border)] px-5 py-5 xl:border-b-0 xl:border-r xl:px-6">
                  {assignment.productionCode ? (
                    <div>
                      <p className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--n-400)]">
                        <Hash className="size-3.5 text-[var(--n-400)]" />
                        ID evento
                      </p>
                      <div className="mt-2">
                        <span
                          className={cn(
                            badgeBaseClassName,
                            "border border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent)]",
                          )}
                        >
                          {assignment.productionCode}
                        </span>
                      </div>
                    </div>
                  ) : null}
                  <div>
                    <p className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--n-400)]">
                      <Video className="size-3.5 text-[var(--n-400)]" />
                      {PRODUCTION_SHORT_LABEL}
                    </p>
                    <div className="mt-2">
                      <span
                        className={cn(
                          badgeBaseClassName,
                          "border border-[var(--n-200)] bg-[var(--n-50)] text-[var(--n-600)]",
                        )}
                      >
                        {formatAssignmentProductionModeLabel(assignment.productionMode)}
                      </span>
                    </div>
                    <p className="mt-2 text-xs font-semibold text-[var(--muted)]">
                      {formatAssignmentProductionMeta(assignment)}
                    </p>
                  </div>
                </div>

                <div className="grid gap-4 border-b border-[var(--border)] px-5 py-5 xl:border-b-0 xl:px-6 xl:pr-24">
                  <div>
                    <p className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--n-400)]">
                      <CalendarDays className="size-3.5 text-[var(--n-400)]" />
                      Fecha
                    </p>
                    <p className="mt-2 text-sm font-bold text-[var(--foreground)]">
                      {formatAssignmentPlanillaDate(assignment)}
                    </p>
                  </div>
                  <div>
                    <p className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--n-400)]">
                      <Clock3 className="size-3.5 text-[var(--n-400)]" />
                      Hora
                    </p>
                    <p className="font-[family-name:var(--font-oswald)] mt-1 text-4xl font-bold tracking-[-0.06em] text-[var(--accent)]">
                      {assignment.timeLabel}
                    </p>
                  </div>
                </div>

              </div>

              <div
                onClick={(event) => event.stopPropagation()}
                className="border-t border-[var(--border)] px-5 py-4 xl:pr-24"
              >
                <AttendanceInlineControl assignment={assignment} />
              </div>

              <div className="flex items-center justify-center gap-2 border-t border-[var(--border)] px-4 py-4 xl:absolute xl:inset-y-0 xl:right-0 xl:z-20 xl:w-[5.5rem] xl:flex-col xl:border-l xl:border-t-0 xl:border-[var(--border)] xl:bg-transparent xl:px-0 xl:py-0">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpenGroup(assignment.assignmentId);
                  }}
                  className="inline-flex size-10 items-center justify-center rounded-full bg-[#1faa52] text-white shadow-[0_12px_24px_rgba(31,170,82,0.18)] transition hover:brightness-105"
                  aria-label="Abrir grupo"
                  title="Abrir grupo"
                >
                  <MessageCircleMore className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpenReport(assignment.assignmentId);
                  }}
                  className="inline-flex size-10 items-center justify-center rounded-full bg-[var(--accent)] text-white shadow-[0_12px_24px_rgba(227,27,35,0.22)] transition hover:brightness-105"
                  aria-label="Abrir reporte"
                  title="Abrir reporte"
                >
                  <Megaphone className="size-4" />
                </button>
              </div>
            </div>
          </article>
        );
      })}

      {!assignments.length ? (
        <div className="flex min-h-[42rem] items-center justify-center rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--surface)] text-sm font-semibold text-[var(--n-500)]">
          No hay partidos para mostrar en esta vista.
        </div>
      ) : (
        <div className="min-h-[calc(42rem-10.5rem)] rounded-[var(--panel-radius)] border border-transparent" />
      )}
    </div>
  );
}

function AssignmentAssistantShell({
  children,
  onClose,
}: {
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <>
      <div
        className="fixed inset-0 z-[90] flex items-end justify-center bg-[var(--n-900)]/55 p-3 backdrop-blur-sm xl:hidden"
        onClick={onClose}
      >
        <div
          className="max-h-[calc(100vh-1.5rem)] w-full max-w-md overflow-y-auto"
          onClick={(event) => event.stopPropagation()}
        >
          {children}
        </div>
      </div>

      <aside className="hidden min-w-0 self-start xl:block xl:sticky xl:top-20">
        {children}
      </aside>
    </>
  );
}

function DrawerSectionHeading({ children }: { children: ReactNode }) {
  return (
    <h4 className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--n-400)]">
      {children}
    </h4>
  );
}

function DrawerHighlightCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[var(--panel-radius)] border border-[var(--n-200)] bg-[var(--n-50)] px-4 py-4">
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--n-500)]">
        {label}
      </p>
      <p className="mt-2 text-[1.55rem] font-black leading-tight tracking-[-0.03em] text-[var(--foreground)]">
        {value}
      </p>
    </div>
  );
}

function DrawerPersonCard({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "accent" | "neutral";
}) {
  return (
    <div className="panel-radius flex min-h-[84px] items-center gap-3 border border-[var(--border)] bg-white p-4">
      <HoverAvatarBadge
        initials={getInitials(value)}
        roleLabel={label}
        showTooltip={false}
        tone={tone}
        size="md"
      />
      <div className="min-w-0">
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--n-400)]">
          {label}
        </p>
        <p className="mt-1 text-sm font-bold leading-tight text-[var(--foreground)]">
          {value}
        </p>
      </div>
    </div>
  );
}

function DrawerInfoCard({
  icon: Icon,
  label,
  value,
  valueClassName,
}: {
  icon: typeof Camera;
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="panel-radius flex min-h-[84px] items-center gap-3 border border-[var(--border)] bg-white p-4">
      <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--n-100)] text-[var(--n-500)]">
        <Icon className="size-[18px]" />
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--n-400)]">
          {label}
        </p>
        <p className={cn("mt-1 text-sm font-bold leading-tight text-[var(--foreground)]", valueClassName)}>
          {value}
        </p>
      </div>
    </div>
  );
}

function DrawerStatusCard({
  confirmed,
}: {
  confirmed: boolean;
}) {
  return (
    <div
      className={cn(
        "panel-radius flex min-h-[84px] items-center justify-between gap-3 border px-4 py-3",
        confirmed
          ? "border-[#d7eadf] bg-[#f3fcf6]"
          : "border-[var(--n-200)] bg-[var(--n-50)]",
      )}
    >
      <div>
        <p
          className={cn(
            "text-[10px] font-black uppercase tracking-[0.16em]",
            confirmed ? "text-[#178a56]" : "text-[var(--n-600)]",
          )}
        >
          Estado del reporte
        </p>
        <p
          className={cn(
            "mt-2 text-sm font-bold",
            confirmed ? "text-[#178a56]" : "text-[var(--foreground)]",
          )}
        >
          {confirmed ? "Reportado" : "Pendiente de reporte"}
        </p>
      </div>
      <span
        className={cn(
          "inline-flex size-10 items-center justify-center rounded-full",
          confirmed ? "bg-[#dcfce7] text-[#12b76a]" : "bg-[var(--n-100)] text-[var(--n-500)]",
        )}
      >
        {confirmed ? <CheckCircle2 className="size-7" /> : <Clock3 className="size-5" />}
      </span>
    </div>
  );
}

const ATTENDANCE_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function AttendanceSubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className={cn(
        "inline-flex h-9 items-center justify-center rounded-full px-5 text-xs font-black transition",
        disabled
          ? "cursor-not-allowed bg-[var(--n-100)] text-[var(--n-300)]"
          : "bg-[#178a56] text-white hover:bg-[#13744a]",
        pending && "opacity-70",
      )}
    >
      {pending ? "Guardando…" : "Confirmar"}
    </button>
  );
}

function AttendanceChoiceButton({
  active,
  tone,
  onClick,
  children,
}: {
  active: boolean;
  tone: "attend" | "decline";
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full border px-3 text-xs font-black transition",
        active
          ? tone === "attend"
            ? "border-[#178a56] bg-[#178a56] text-white"
            : "border-[var(--accent)] bg-[var(--accent)] text-white"
          : "border-[var(--border)] bg-white text-[var(--n-600)] hover:border-[var(--n-200)]",
      )}
    >
      {children}
    </button>
  );
}

// Inline attendance response by the assigned person (PRD #7). Every assignment in
// this panel already belongs to the logged-in person (data is scoped by their
// linked person), so the control is inherently "only the assigned person".
// Server-side recordAttendanceConfirmation re-checks ownership + the window.
function AttendanceInlineControl({
  assignment,
}: {
  assignment: CollaboratorAssignmentItem;
}) {
  const [choice, setChoice] = useState<"attending" | null>(
    assignment.attendanceResponse === "attending" ? "attending" : null,
  );
  const [note, setNote] = useState(assignment.attendanceNote ?? "");

  // Demo/guest rows carry a non-uuid id and have no real assignment to update.
  if (!ATTENDANCE_UUID_RE.test(assignment.assignmentId)) {
    return null;
  }

  const response = assignment.attendanceResponse;
  const ended =
    addMinutes(parseISO(assignment.kickoffAt), assignment.durationMinutes) <
    new Date();

  // Past matches: frozen read-only state, no toggle.
  if (ended) {
    const label =
      response === "attending"
        ? "Confirmaste tu asistencia"
        : response === "declined"
          ? "Avisaste que no asistirías"
          : "Sin respuesta";

    return (
      <div className="panel-radius border border-[var(--n-200)] bg-[var(--n-50)] px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--n-600)]">
              Asistencia
            </p>
            <p className="mt-1.5 text-sm font-bold text-[var(--foreground)]">{label}</p>
          </div>
          <span className="inline-flex size-9 items-center justify-center rounded-full bg-[var(--n-100)] text-[var(--n-500)]">
            {response === "attending" ? (
              <CheckCircle2 className="size-6" />
            ) : (
              <Clock3 className="size-5" />
            )}
          </span>
        </div>
        {assignment.attendanceNote?.trim() ? (
          <p className="mt-2 text-xs font-semibold leading-5 text-[var(--n-600)]">
            “{assignment.attendanceNote.trim()}”
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <form
      action={setAttendanceConfirmationAction}
      className={cn(
        "panel-radius border px-4 py-3",
        response === "attending"
          ? "border-[#d7eadf] bg-[#f3fcf6]"
          : "border-[var(--n-200)] bg-[var(--n-50)]",
      )}
    >
      <input type="hidden" name="assignmentId" value={assignment.assignmentId} />
      <input type="hidden" name="redirectTo" value="/mi-jornada" />
      <input type="hidden" name="response" value={choice ?? ""} />

      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--n-600)]">
        ¿Vas a asistir?
      </p>

      <div className="mt-2 flex items-stretch gap-2">
        <AttendanceChoiceButton
          active={choice === "attending"}
          tone="attend"
          onClick={() => setChoice("attending")}
        >
          <CheckCircle2 className="size-3.5" />
          Asistiré
        </AttendanceChoiceButton>
      </div>

      <textarea
        name="note"
        value={note}
        onChange={(event) => setNote(event.currentTarget.value)}
        rows={2}
        placeholder="Notas (opcional)"
        className="mt-2 w-full resize-none rounded-[var(--panel-radius)] border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--foreground)] outline-none placeholder:text-[var(--n-400)] focus:border-[var(--accent)]"
      />

      <div className="mt-2.5 flex items-center justify-end">
        <AttendanceSubmitButton disabled={!choice} />
      </div>
    </form>
  );
}

function GroupAssistantDrawer({
  assignment,
  tab,
  onChangeTab,
  onClose,
}: {
  assignment: CollaboratorAssignmentItem;
  tab: GroupDrawerTab;
  onChangeTab: (tab: GroupDrawerTab) => void;
  onClose: () => void;
}) {
  const contacts = getAssignmentContacts(assignment);
  const leagueAccent = getAssignmentLeagueAccentColor(assignment.competition);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const isDesktop = window.matchMedia("(min-width: 1280px)").matches;
    if (isDesktop) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  const drawerContent = (
    <div className="min-w-0 rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[0_18px_40px_rgba(28,13,16,0.08)]">
      <div className="relative border-b border-[var(--border)] p-6">
        <div className="mb-4 flex items-center justify-center gap-4 xl:justify-between">
          <div className="flex flex-wrap items-center justify-center gap-2 xl:justify-start">
            {assignment.productionMode ? (
              <span className="inline-flex rounded-full border border-[var(--accent-border)] bg-[var(--accent-soft)] px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-[var(--accent)]">
                {getProductionModeLabel(assignment.productionMode)}
              </span>
            ) : null}
            <span
              className="inline-flex rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em]"
              style={{
                backgroundColor: `${leagueAccent}14`,
                color: leagueAccent,
              }}
            >
              {assignment.competition ?? "Sin liga"}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="absolute right-3 top-3 inline-flex size-10 items-center justify-center rounded-full bg-[var(--background-soft)] text-[var(--n-400)] sm:right-4 sm:top-4"
            aria-label="Cerrar asistente de grupo"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-1 text-center xl:text-left">
          <p className="text-[1.6rem] font-black leading-[1.05] tracking-[-0.04em] text-[var(--foreground)]">
            {assignment.homeTeam}
          </p>
          <div className="flex flex-wrap items-baseline justify-center gap-x-2 gap-y-1 text-[1.6rem] font-black leading-[1.05] tracking-[-0.04em] text-[var(--foreground)] xl:justify-start">
            <span className="text-[var(--accent)]">vs</span>
            <span>{assignment.awayTeam}</span>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm text-[var(--n-500)] xl:justify-start">
          <span className="inline-flex items-center gap-2">
            <CalendarDays className="size-4 text-[var(--n-300)]" />
            {formatAssignmentDrawerDate(assignment)}
          </span>
          <span className="inline-flex items-center gap-2">
            <Clock3 className="size-4 text-[var(--n-300)]" />
            {assignment.timeLabel}
          </span>
        </div>
        <div className="mt-2 inline-flex w-full items-start justify-center gap-2 text-sm text-[var(--n-500)] xl:w-auto xl:justify-start">
          <MapPin className="mt-0.5 size-4 shrink-0 text-[var(--n-300)]" />
          <span>{assignment.venue ?? "Sede por definir"}</span>
        </div>
      </div>

      <UnderlineTabs
        columns={2}
        className="px-5"
        items={[
          {
            key: "group",
            label: "Grupo",
            active: tab === "group",
            onClick: () => onChangeTab("group"),
          },
          {
            key: "context",
            label: "Planilla",
            active: tab === "context",
            onClick: () => onChangeTab("context"),
          },
        ]}
      />

      <div className="space-y-5 px-5 py-5">

        {tab === "group" ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[var(--n-400)]">
                Integrantes
              </p>
              <div className="space-y-4">
                {contacts.length ? (
                  contacts.map((contact, index) => {
                    const contactWhatsapp = buildWhatsAppUrl(contact.phone);
                    const contactEmail = contact.email ? `mailto:${contact.email}` : null;

                    return (
                      <div
                        key={`${assignment.assignmentId}-${contact.roleName}-${contact.personName}`}
                        className={cn(
                          "flex items-center justify-between gap-3",
                          index === contacts.length - 1
                            ? ""
                            : "border-b border-[var(--border)] pb-4",
                        )}
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-[#c9ead8] bg-[#eefbf3] text-[0.82rem] font-black text-[#1b8b56]">
                            {getInitials(contact.personName)}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-[0.92rem] font-bold text-[var(--foreground)]">
                              {contact.personName ?? "Sin asignar"}
                            </p>
                            <p className="mt-0.5 truncate text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--n-500)]">
                              {getRoleDisplayName(contact.roleName)}
                            </p>
                          </div>
                        </div>

                        <div className="flex shrink-0 gap-2">
                          {contactWhatsapp ? (
                            <Link
                              href={contactWhatsapp}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex size-10 items-center justify-center rounded-full border border-[#c9ead8] bg-[#eefbf3] text-[#1b8b56] transition hover:brightness-105"
                              aria-label={`Abrir WhatsApp de ${contact.personName ?? "contacto"}`}
                            >
                              <MessageCircleMore className="size-4" />
                            </Link>
                          ) : (
                            <span className="inline-flex size-10 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--n-50)] text-[var(--n-300)]">
                              <MessageCircleMore className="size-4" />
                            </span>
                          )}
                          {contactEmail ? (
                            <Link
                              href={contactEmail}
                              className="inline-flex size-10 items-center justify-center rounded-full border border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent)] transition hover:brightness-105"
                              aria-label={`Enviar correo a ${contact.personName ?? "contacto"}`}
                            >
                              <Mail className="size-4" />
                            </Link>
                          ) : (
                            <span className="inline-flex size-10 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--n-50)] text-[var(--n-300)]">
                              <Mail className="size-4" />
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--n-50)] px-4 py-5 text-sm font-semibold text-[var(--n-500)]">
                    Aún no hay integrantes vinculados a este partido.
                  </div>
                )}
              </div>
            </div>

          </div>
        ) : (
          <div className="space-y-5">
            <section className="space-y-4">
              <DrawerSectionHeading>{PRODUCTION_SHORT_LABEL}</DrawerSectionHeading>
              <DrawerHighlightCard
                label={PRODUCTION_SHORT_LABEL}
                value={getProductionModeLabel(assignment.productionMode) || "Sin definir"}
              />
              <div className="grid grid-cols-2 gap-3">
                <DrawerInfoCard
                  icon={CalendarDays}
                  label="Rol asignado"
                  value={getRoleDisplayName(assignment.roleName) || "Sin definir"}
                  valueClassName="text-[var(--accent)]"
                />
                <DrawerInfoCard
                  icon={Camera}
                  label="Cámaras"
                  value={
                    assignment.cameraCount > 0
                      ? `${assignment.cameraCount} ${assignment.cameraCount === 1 ? "unidad" : "unidades"}`
                      : "Sin definir"
                  }
                />
              </div>
            </section>

            <section className="space-y-4">
              <DrawerSectionHeading>Responsables</DrawerSectionHeading>
              <div className="grid grid-cols-2 gap-3">
                <DrawerPersonCard
                  label={RESPONSIBLE_DISPLAY_LABEL}
                  value={assignment.responsibleName ?? assignment.ownerName ?? "Sin asignar"}
                  tone="accent"
                />
                <DrawerPersonCard
                  label="Realizador"
                  value={assignment.realizerName ?? "Sin asignar"}
                />
              </div>
            </section>

            <section className="space-y-4">
              <DrawerSectionHeading>Contexto del partido</DrawerSectionHeading>
              <div className="grid grid-cols-2 gap-3">
                <DrawerPersonCard
                  label="Productor"
                  value={assignment.producerName ?? "Sin asignar"}
                />
                <DrawerPersonCard
                  label="Relator"
                  value={assignment.relatorName ?? "Sin asignar"}
                  tone="accent"
                />
                <DrawerPersonCard
                  label="Operador"
                  value={assignment.operatorControlName ?? "Sin asignar"}
                />
                <DrawerPersonCard
                  label="Encoder"
                  value={assignment.encoderName ?? "Sin asignar"}
                />
                <div className="col-span-2">
                  <DrawerInfoCard
                    icon={MapPin}
                    label="Sede"
                    value={assignment.venue ?? "Sede por definir"}
                  />
                </div>
              </div>
              <AttendanceInlineControl assignment={assignment} />
              <DrawerStatusCard confirmed={assignment.confirmed} />
            </section>

            {[
              { label: "Transporte", value: assignment.transport },
              { label: "Plan de comentarios", value: assignment.commentaryPlan },
              { label: "Observaciones", value: assignment.matchNotes ?? assignment.notes },
            ]
              .filter((item) => item.value?.trim())
              .length ? (
              <section className="space-y-4">
                <DrawerSectionHeading>Notas operativas</DrawerSectionHeading>
                {[
                  { label: "Transporte", value: assignment.transport },
                  { label: "Plan de comentarios", value: assignment.commentaryPlan },
                  { label: "Observaciones", value: assignment.matchNotes ?? assignment.notes },
                ]
                  .filter((item) => item.value?.trim())
                  .map((item) => (
                    <div
                      key={`${assignment.assignmentId}-${item.label}`}
                      className="rounded-[var(--panel-radius)] border border-[var(--border)] bg-white px-4 py-4"
                    >
                      <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--n-400)]">
                        {item.label}
                      </p>
                      <p className="mt-2 text-sm font-semibold leading-6 text-[var(--n-600)]">
                        {item.value}
                      </p>
                    </div>
                  ))}
              </section>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );

  return <AssignmentAssistantShell onClose={onClose}>{drawerContent}</AssignmentAssistantShell>;
}

function ReportAssistantDrawer({
  assignment,
  onClose,
}: {
  assignment: CollaboratorAssignmentItem;
  onClose: () => void;
}) {
  const leagueAccent = getAssignmentLeagueAccentColor(assignment.competition);
  const drawerContent = (
    <div className="min-w-0 rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[0_18px_40px_rgba(28,13,16,0.08)]">
      <div className="relative border-b border-[var(--border)] p-6">
        <div className="mb-4 flex items-center justify-center gap-4 xl:justify-between">
          <div className="flex flex-wrap items-center justify-center gap-2 xl:justify-start">
            {assignment.productionMode ? (
              <span className="inline-flex rounded-full border border-[var(--accent-border)] bg-[var(--accent-soft)] px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-[var(--accent)]">
                {getProductionModeLabel(assignment.productionMode)}
              </span>
            ) : null}
            <span
              className="inline-flex rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em]"
              style={{
                backgroundColor: `${leagueAccent}14`,
                color: leagueAccent,
              }}
            >
              {assignment.competition ?? "Sin liga"}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="absolute right-3 top-3 inline-flex size-10 items-center justify-center rounded-full bg-[var(--background-soft)] text-[var(--n-400)] sm:right-4 sm:top-4"
            aria-label="Cerrar reporte"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-1 text-center xl:text-left">
          <p className="text-[1.6rem] font-black leading-[1.05] tracking-[-0.04em] text-[var(--foreground)]">
            {assignment.homeTeam}
          </p>
          <div className="flex flex-wrap items-baseline justify-center gap-x-2 gap-y-1 text-[1.6rem] font-black leading-[1.05] tracking-[-0.04em] text-[var(--foreground)] xl:justify-start">
            <span className="text-[var(--accent)]">vs</span>
            <span>{assignment.awayTeam}</span>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm text-[var(--n-500)] xl:justify-start">
          <span className="inline-flex items-center gap-2">
            <CalendarDays className="size-4 text-[var(--n-300)]" />
            {formatAssignmentDrawerDate(assignment)}
          </span>
          <span className="inline-flex items-center gap-2">
            <Clock3 className="size-4 text-[var(--n-300)]" />
            {assignment.timeLabel}
          </span>
        </div>
        <div className="mt-2 inline-flex w-full items-start justify-center gap-2 text-sm text-[var(--n-500)] xl:w-auto xl:justify-start">
          <MapPin className="mt-0.5 size-4 shrink-0 text-[var(--n-300)]" />
          <span>{assignment.venue ?? "Sede por definir"}</span>
        </div>
      </div>

      <div className="space-y-5 px-5 py-5">
        <CollaboratorReportForm
          assignment={assignment}
          showMatchSummary={false}
        />
      </div>
    </div>
  );

  return <AssignmentAssistantShell onClose={onClose}>{drawerContent}</AssignmentAssistantShell>;
}

// Past-month assignments are deferred: their (logo-heavy) nodes only mount once
// expanded, mirroring the grid's "Ver días anteriores" pattern.
function MyDayPastToggle({
  count,
  children,
}: {
  count: number;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <section className="space-y-4">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className={cn(
          "inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-semibold text-[var(--muted)] shadow-[0_8px_18px_rgba(28,13,16,0.06)] transition hover:border-[rgba(227,27,35,0.24)] hover:text-[var(--accent)]",
          open && "border-[rgba(227,27,35,0.18)] bg-[var(--accent-soft)] text-[var(--accent)]",
        )}
      >
        <History className="size-4" />
        {open
          ? "Ocultar partidos anteriores"
          : `Ver partidos anteriores del mes (${count})`}
      </button>
      {open ? <div className="space-y-4">{children}</div> : null}
    </section>
  );
}

export function MyDayAssignmentsPanel({
  hasLinkedPerson,
  showDemoToday,
  canViewGrid,
  assignments,
  pastAssignments,
  topContent,
}: MyDayAssignmentsPanelProps) {
  const [selectedGroupAssignmentId, setSelectedGroupAssignmentId] = useState<string | null>(
    null,
  );
  const [selectedReportAssignmentId, setSelectedReportAssignmentId] = useState<string | null>(
    null,
  );
  const [drawerTab, setDrawerTab] = useState<GroupDrawerTab>("group");
  // Desktop (≥1280px) shows only the table; below that, only the fichas. No
  // user-facing toggle — the breakpoint decides.
  const [tableViewEnabled, setTableViewEnabled] = useState(false);

  const allAssignments = useMemo(
    () => [...assignments, ...pastAssignments],
    [assignments, pastAssignments],
  );
  const selectedGroupAssignment =
    allAssignments.find((assignment) => assignment.assignmentId === selectedGroupAssignmentId) ??
    null;
  const selectedReportAssignment =
    allAssignments.find((assignment) => assignment.assignmentId === selectedReportAssignmentId) ??
    null;
  const selectedPanelAssignmentId =
    selectedReportAssignmentId ?? selectedGroupAssignmentId ?? null;
  const effectiveViewMode: MyDayViewMode = tableViewEnabled ? "table" : "cards";

  useEffect(() => {
    const mediaQuery = window.matchMedia(TABLE_DESKTOP_MEDIA_QUERY);
    const sync = () => setTableViewEnabled(mediaQuery.matches);

    sync();
    mediaQuery.addEventListener("change", sync);

    return () => mediaQuery.removeEventListener("change", sync);
  }, []);

  function handleOpenGroup(assignmentId: string) {
    setSelectedReportAssignmentId(null);
    setSelectedGroupAssignmentId(assignmentId);
    setDrawerTab("group");
  }

  function handleOpenReport(assignmentId: string) {
    setSelectedGroupAssignmentId(null);
    setSelectedReportAssignmentId(assignmentId);
  }

  const cardGridClassName = "flex flex-wrap items-start gap-3";

  function renderList(items: CollaboratorAssignmentItem[]) {
    return effectiveViewMode === "cards" ? (
      <div className={cardGridClassName}>
        {items.map((assignment) => (
          <AssignmentCard
            key={`${assignment.assignmentId}-${assignment.matchId}`}
            assignment={assignment}
            onOpenGroup={handleOpenGroup}
            onOpenReport={handleOpenReport}
          />
        ))}
      </div>
    ) : (
      <AssignmentTable
        assignments={items}
        selectedAssignmentId={selectedPanelAssignmentId}
        onOpenGroup={handleOpenGroup}
        onOpenReport={handleOpenReport}
      />
    );
  }

  return (
    <div
      className={cn(
        "grid gap-6",
        selectedPanelAssignmentId ? "xl:grid-cols-[minmax(0,1fr)_390px]" : "grid-cols-1",
      )}
    >
      <div className="space-y-8">
        {topContent}

        {showDemoToday ? (
          <div className="rounded-[var(--panel-radius)] border border-[var(--n-200)] bg-[var(--n-50)] px-4 py-3 text-sm font-semibold text-[var(--n-600)]">
            {!hasLinkedPerson ? "Aún no encontramos tu vínculo en Personal. " : null}
            Te dejamos una{" "}
            <span className="font-black text-[var(--accent)]">vista demo</span>{" "}
            para que valides cómo se ve `Mi jornada`.
          </div>
        ) : null}

        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl font-black tracking-tight text-[var(--foreground)]">
                Tus partidos
              </h2>
              <p className="mt-1 text-sm text-[var(--n-600)]">
                Partidos asignados de hoy en adelante.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-[var(--n-400)]">
                {assignments.length} próximos
              </span>
              {canViewGrid ? (
                <Link
                  href="/grid"
                  className="hidden items-center gap-2 text-sm font-black text-[var(--accent)] md:inline-flex"
                >
                  Ver Producción
                  <ChevronDown className="size-4 -rotate-90" />
                </Link>
              ) : null}
            </div>
          </div>

          {assignments.length ? (
            renderList(assignments)
          ) : (
            <Card className="space-y-3 rounded-[var(--panel-radius)] p-6">
              <p className="text-[11px] font-black uppercase tracking-[0.24em] text-[var(--n-400)]">
                Sin partidos próximos
              </p>
              <h3 className="text-2xl font-black tracking-tight text-[var(--foreground)]">
                No tienes partidos asignados de hoy en adelante
              </h3>
              <p className="text-sm leading-7 text-[var(--n-600)]">
                {pastAssignments.length
                  ? "Revisa los partidos anteriores del mes más abajo."
                  : "Cuando te asignen un partido aparecerá aquí."}
              </p>
            </Card>
          )}
        </section>

        {pastAssignments.length ? (
          <MyDayPastToggle count={pastAssignments.length}>
            {renderList(pastAssignments)}
          </MyDayPastToggle>
        ) : null}
      </div>

      {selectedGroupAssignment ? (
        <GroupAssistantDrawer
          assignment={selectedGroupAssignment}
          tab={drawerTab}
          onChangeTab={setDrawerTab}
          onClose={() => setSelectedGroupAssignmentId(null)}
        />
      ) : null}
      {selectedReportAssignment ? (
        <ReportAssistantDrawer
          assignment={selectedReportAssignment}
          onClose={() => setSelectedReportAssignmentId(null)}
        />
      ) : null}
    </div>
  );
}
