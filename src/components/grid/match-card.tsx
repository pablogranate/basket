import {
  CalendarDays,
  Clock3,
  Hash,
  PencilLine,
  type LucideIcon,
  MapPin,
  Mic2,
  ShieldUser,
  SlidersHorizontal,
  Video,
} from "lucide-react";

import { MatchCardActions } from "@/components/grid/match-card-actions";
import { TeamLogoMark } from "@/components/team-logo-mark";
import { LeagueLogoMarkClient } from "@/components/league-logo-mark-client";
import { QuickMatchFieldEditor } from "@/components/grid/quick-match-field-editor";
import { badgeBaseClassName } from "@/components/ui/badge";
import { HoverAvatarBadge } from "@/components/ui/hover-avatar-badge";
import {
  getProductionModeLabel,
  PRODUCTION_SHORT_LABEL,
  RESPONSIBLE_DISPLAY_LABEL,
} from "@/lib/constants";
import { formatMatchTime } from "@/lib/date";
import { getRoleDisplayName } from "@/lib/display";
import { getGridLeagueColor } from "@/lib/league-grid-colors";
import { getTeamLeagueLabel } from "@/lib/team-directory";
import type { MatchListItem } from "@/lib/types";
import { cn } from "@/lib/utils";

type SectionRow = {
  label: string;
  value: string;
  muted?: boolean;
  compactValue?: boolean;
  multiline?: boolean;
};

function formatGridDate(kickoffAt: string, timezone: string) {
  const parts = new Intl.DateTimeFormat("es-AR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: timezone,
  }).formatToParts(new Date(kickoffAt));

  const weekday = parts.find((part) => part.type === "weekday")?.value ?? "";
  const day = parts.find((part) => part.type === "day")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const year = parts.find((part) => part.type === "year")?.value ?? "";

  return [weekday, day, month, year]
    .filter(Boolean)
    .join(" ")
    .replaceAll(".", "")
    .replaceAll(",", "")
    .toUpperCase();
}

function getAssignmentValue(
  match: MatchListItem,
  roleName: string,
  fallback?: string | null,
) {
  const assignment = match.assignments.find((item) => item.role.name === roleName);
  const value = assignment?.person?.full_name ?? fallback ?? "TBD";

  return {
    value,
    muted: !assignment?.person?.full_name && !fallback,
  };
}

function buildProductionRows(match: MatchListItem): SectionRow[] {
  const responsible = getAssignmentValue(
    match,
    "Responsable",
    match.owner?.full_name ?? null,
  );
  const director = getAssignmentValue(match, "Realizador");
  const control = getAssignmentValue(match, "Operador de Control");
  const support = getAssignmentValue(match, "Soporte tecnico");

  return [
    {
      label: RESPONSIBLE_DISPLAY_LABEL,
      value: responsible.value,
      muted: responsible.muted,
      compactValue: true,
    },
    {
      label: "Realizador",
      value: director.value,
      muted: director.muted,
      compactValue: true,
    },
    {
      label: "Operador de Control",
      value: control.value,
      muted: control.muted,
      compactValue: true,
    },
    {
      label: "Soporte tecnico",
      value: support.value,
      muted: support.muted,
      compactValue: true,
    },
  ];
}

function buildCategoryRows(
  match: MatchListItem,
  category: string,
  limit = 4,
): SectionRow[] {
  return match.assignments
    .filter((assignment) => assignment.role.category === category)
    .sort((left, right) => left.role.sort_order - right.role.sort_order)
    .slice(0, limit)
    .map((assignment) => ({
      label: assignment.role.name,
      value: assignment.person?.full_name ?? "TBD",
      muted: !assignment.person?.full_name,
      compactValue: true,
    }));
}

function buildNamedRows(
  match: MatchListItem,
  roleNames: string[],
): SectionRow[] {
  return roleNames.map((roleName) => {
    const item = getAssignmentValue(match, roleName);

    return {
      label: roleName,
      value: item.value,
      muted: item.muted,
      compactValue: true,
    };
  });
}

function buildObservationRows(match: MatchListItem): SectionRow[] {
  const transport = match.transport?.trim() ?? "";
  const notes = match.notes?.trim() ?? "";

  return [
    {
      label: "Transporte",
      value: transport || "Sin datos",
      muted: !transport,
      multiline: true,
    },
    {
      label: "Observaciones",
      value: notes || "Sin observaciones",
      muted: !notes,
      multiline: true,
    },
  ];
}

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function getCompactPersonName(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);

  if (parts.length <= 1 || name === "TBD") {
    return name;
  }

  const surnameCandidate =
    parts.length >= 3 ? parts[1] : parts[parts.length - 1];

  return `${parts[0]?.[0]?.toUpperCase() ?? ""}. ${surnameCandidate}`;
}

function formatProductionModeLabel(mode: string | null | undefined) {
  return getProductionModeLabel(mode);
}

function isUnassignedLeagueLabel(value: string) {
  return (
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim() === "sin liga"
  );
}

function Section({
  title,
  icon: Icon,
  rows,
}: {
  title: string;
  icon: LucideIcon;
  rows: SectionRow[];
}) {
  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-center gap-2 border-b border-[var(--border)] pb-3">
        <Icon className="size-4 text-[var(--accent)]" />
        <h4 className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-[var(--accent)]">
          {title}
        </h4>
      </div>

      <div className="flex flex-1 flex-col gap-4">
        {rows.map((row) => {
          const displayValue =
            row.compactValue && !row.muted
              ? getCompactPersonName(row.value)
              : row.value;

          return (
            <div key={row.label} className="space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#a08f91]">
                {getRoleDisplayName(row.label)}
              </p>
              <p
                className={cn(
                  "text-sm text-[var(--foreground)]",
                  row.multiline ? "leading-6 font-medium whitespace-pre-line" : "font-bold",
                  row.muted &&
                    (row.multiline
                      ? "text-[var(--muted)] italic"
                      : "text-[var(--muted)] italic font-semibold"),
                )}
              >
                {displayValue}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function MatchCard({
  match,
  redirectTo,
  canEdit,
}: {
  match: MatchListItem;
  redirectTo: string;
  canEdit: boolean;
}) {
  const cameraRows = buildCategoryRows(match, "Camaras");
  const talentRows = buildNamedRows(match, [
    "Relator",
    "Comentario 1",
    "Comentario 2",
    "Campo",
  ]);
  const observationRows = buildObservationRows(match);
  const responsible = getAssignmentValue(
    match,
    "Responsable",
    match.owner?.full_name ?? null,
  );
  const director = getAssignmentValue(match, "Realizador");
  const narrator = getAssignmentValue(match, "Relator");
  const commentator1 = getAssignmentValue(match, "Comentario 1");
  const commentator2 = getAssignmentValue(match, "Comentario 2");
  const commentator = commentator1.muted ? commentator2 : commentator1;
  const leagueLabel = getTeamLeagueLabel(match.competition ?? "Sin liga");
  const isUnassignedLeague = isUnassignedLeagueLabel(leagueLabel);
  const leagueColor = getGridLeagueColor(match.competition);
  const venueLabel = match.venue ?? "Sede sin definir";
  const statusAccentClass =
    match.status === "Realizado" ? "bg-[#26b36a]" : "bg-[#d7dde7]";
  const detailsId = `match-card-${match.id}`;

  return (
    <details
      id={detailsId}
      className={cn(
        "panel-surface group relative overflow-visible border border-[var(--border)] bg-[var(--surface)] transition [&_summary::-webkit-details-marker]:hidden [&_summary::marker]:hidden",
      )}
    >
      <summary className="relative cursor-pointer list-none">
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute left-[-12px] top-1/2 z-0 h-[118px] w-[30px] -translate-y-1/2 rounded-l-[10px] rounded-r-[6px] shadow-[inset_-1px_0_0_rgba(255,255,255,0.16),0_8px_18px_rgba(15,23,42,0.06)]",
            statusAccentClass,
          )}
        />
        <div className="relative z-10 overflow-visible rounded-t-[10px] rounded-b-[10px]">
          <div className="overflow-hidden rounded-t-[10px] rounded-b-[10px] flex flex-col xl:grid xl:grid-cols-[6.5rem_minmax(12.5rem,17rem)_repeat(4,minmax(10rem,1fr))_4.75rem] xl:items-stretch 2xl:grid-cols-[7rem_minmax(17.5rem,25rem)_repeat(4,minmax(10.25rem,1fr))_4.75rem]">
          <div
            className={cn(
              "relative z-10 flex flex-col items-center justify-center gap-3 border-b border-[var(--border)] px-4 py-5 text-center xl:border-b-0 xl:border-r",
              !leagueColor && "bg-[var(--surface)]",
            )}
            style={
              leagueColor ? { backgroundColor: leagueColor.background } : undefined
            }
          >
            <LeagueLogoMarkClient
              league={leagueLabel}
              className={cn(
                "h-16 w-16",
                isUnassignedLeague && "rounded-2xl bg-[#e4eaf1]",
              )}
            />
            <p
              className={cn(
                "text-[10px] font-bold uppercase tracking-[0.18em] text-[#70819b]",
                isUnassignedLeague && "text-[#7f8ca0]",
              )}
              style={leagueColor ? { color: leagueColor.text } : undefined}
            >
              {leagueLabel}
            </p>
          </div>

          <div className="flex min-w-0 items-center border-b border-[var(--border)] px-5 py-5 xl:border-b-0 xl:border-r xl:px-4 2xl:px-6">
            <div className="mx-auto w-full max-w-[16rem] 2xl:max-w-[20.5rem]">
              <div className="grid items-center justify-center gap-2 sm:grid-cols-[minmax(0,1fr)_1.75rem_minmax(0,1fr)] sm:gap-3 2xl:gap-3 2xl:sm:grid-cols-[8.5rem_2.25rem_8.5rem] 2xl:sm:gap-4">
                <div className="flex min-w-0 flex-col items-center text-center">
                  {canEdit ? (
                    <QuickMatchFieldEditor
                      field="homeTeam"
                      value={match.home_team}
                      matchId={match.id}
                      redirectTo={redirectTo}
                      title="Cambiar local"
                      listId="grid-club-catalog"
                      panelClassName="w-[19rem]"
                    >
                      <TeamLogoMark
                        teamName={match.home_team}
                        competition={match.competition}
                        className="size-12 rounded-full 2xl:size-14"
                      />
                    </QuickMatchFieldEditor>
                  ) : (
                    <TeamLogoMark
                      teamName={match.home_team}
                      competition={match.competition}
                      className="size-12 rounded-full 2xl:size-14"
                    />
                  )}
                  <p
                    title={match.home_team}
                    className="mt-2 min-h-[2.1em] text-center text-[0.84rem] font-black leading-[1.04] tracking-[-0.03em] text-[var(--foreground)] [display:-webkit-box] overflow-hidden text-ellipsis [-webkit-box-orient:vertical] [-webkit-line-clamp:2] 2xl:mt-3 2xl:min-h-[2.16em] 2xl:text-[0.98rem]"
                  >
                    {match.home_team}
                  </p>
                </div>

                <span className="self-center justify-self-center text-sm font-semibold uppercase tracking-[0.18em] text-[#93a0b2] 2xl:text-base">
                  vs
                </span>

                <div className="flex min-w-0 flex-col items-center text-center">
                  {canEdit ? (
                    <QuickMatchFieldEditor
                      field="awayTeam"
                      value={match.away_team}
                      matchId={match.id}
                      redirectTo={redirectTo}
                      title="Cambiar visitante"
                      listId="grid-club-catalog"
                      panelClassName="w-[19rem]"
                    >
                      <TeamLogoMark
                        teamName={match.away_team}
                        competition={match.competition}
                        className="size-12 rounded-full 2xl:size-14"
                      />
                    </QuickMatchFieldEditor>
                  ) : (
                    <TeamLogoMark
                      teamName={match.away_team}
                      competition={match.competition}
                      className="size-12 rounded-full 2xl:size-14"
                    />
                  )}
                  <p
                    title={match.away_team}
                    className="mt-2 min-h-[2.1em] text-center text-[0.84rem] font-black leading-[1.04] tracking-[-0.03em] text-[var(--foreground)] [display:-webkit-box] overflow-hidden text-ellipsis [-webkit-box-orient:vertical] [-webkit-line-clamp:2] 2xl:mt-3 2xl:min-h-[2.16em] 2xl:text-[0.98rem]"
                  >
                    {match.away_team}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-center gap-2 text-center text-[12px] font-semibold text-[#94a3b8]">
                <MapPin className="size-3.5 shrink-0" />
                <span className="truncate" title={venueLabel}>
                  {venueLabel}
                </span>
              </div>
            </div>
          </div>

          <div className="grid gap-4 border-b border-[var(--border)] px-5 py-5 xl:border-b-0 xl:border-r xl:px-6">
            <div className="flex items-center gap-2">
              <ShieldUser className="size-3.5 text-[#a7b4c8]" />
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#a7b4c8]">
                Staff
              </p>
            </div>
            <div className="flex items-center gap-3">
              <HoverAvatarBadge
                initials={getInitials(responsible.value)}
                roleLabel={RESPONSIBLE_DISPLAY_LABEL}
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
                  {getCompactPersonName(responsible.value)}
                </p>
                <p className="text-xs font-semibold text-[var(--muted)]">
                  {RESPONSIBLE_DISPLAY_LABEL}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <HoverAvatarBadge
                initials={getInitials(director.value)}
                roleLabel="Realizador integral"
                showTooltip={false}
                tone="neutral"
                size="sm"
              />
              <div className="min-w-0">
                <p
                  className={cn(
                    "truncate text-sm font-bold text-[var(--foreground)]",
                    director.muted && "text-[var(--muted)] italic font-semibold",
                  )}
                >
                  {getCompactPersonName(director.value)}
                </p>
                <p className="text-xs font-semibold text-[var(--muted)]">
                  Realizador Integral
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-4 border-b border-[var(--border)] px-5 py-5 xl:border-b-0 xl:border-r xl:px-6">
            <div className="flex items-center gap-2">
              <Mic2 className="size-3.5 text-[#a7b4c8]" />
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#a7b4c8]">
                Relatos
              </p>
            </div>
            <div className="flex items-center gap-3">
              <HoverAvatarBadge
                initials={getInitials(narrator.value)}
                roleLabel="Relatos"
                showTooltip={false}
                tone="neutral"
                size="sm"
              />
              <div className="min-w-0">
                <p className="mt-1 text-sm font-bold text-[var(--foreground)]">
                  {getCompactPersonName(narrator.value)}
                </p>
                <p className="text-xs font-semibold italic text-[var(--muted)]">
                  Relatos
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <HoverAvatarBadge
                initials={getInitials(commentator.value)}
                roleLabel="Comentarios"
                showTooltip={false}
                tone="neutral"
                size="sm"
              />
              <div className="min-w-0">
                <p
                  className={cn(
                    "truncate text-sm font-bold text-[var(--foreground)]",
                    commentator.muted && "text-[var(--muted)] italic font-semibold",
                  )}
                >
                  {getCompactPersonName(commentator.value)}
                </p>
                <p className="text-xs font-semibold italic text-[var(--muted)]">
                  Comentarios
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-4 border-b border-[var(--border)] px-5 py-5 xl:border-b-0 xl:border-r xl:px-6">
            {match.production_code ? (
              <div>
                <p className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[#a7b4c8]">
                  <Hash className="size-3.5 text-[#a7b4c8]" />
                  ID evento
                </p>
                <div className="mt-2">
                  <span
                    className={cn(
                      badgeBaseClassName,
                      "border border-[#f3cfd8] bg-[#fff3f6] text-[var(--accent)]",
                    )}
                  >
                    {match.production_code}
                  </span>
                </div>
              </div>
            ) : null}
            <div>
              <p className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[#a7b4c8]">
                <Video className="size-3.5 text-[#a7b4c8]" />
                {PRODUCTION_SHORT_LABEL}
              </p>
              <div className="mt-2">
                <span
                  className={cn(
                    badgeBaseClassName,
                    "border border-[#dbe1ea] bg-[#f7f8fa] text-[#637083]",
                  )}
                >
                  {formatProductionModeLabel(match.production_mode)}
                </span>
              </div>
            </div>
          </div>

          <div className="grid gap-4 border-b border-[var(--border)] px-5 py-5 xl:border-b-0 xl:px-6">
            <div>
              <p className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[#a7b4c8]">
                <CalendarDays className="size-3.5 text-[#a7b4c8]" />
                Fecha
              </p>
              <p className="mt-2 text-[1.12rem] font-extrabold leading-tight tracking-[-0.03em] text-[var(--foreground)]">
                {formatGridDate(match.kickoff_at, match.timezone)}
              </p>
            </div>
            <div>
              <p className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[#a7b4c8]">
                <Clock3 className="size-3.5 text-[#a7b4c8]" />
                Hora
              </p>
              <p className="mt-1 text-4xl font-black tracking-[-0.06em] text-[var(--accent)]">
                {formatMatchTime(match.kickoff_at, match.timezone)}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-end border-t border-[var(--border)] px-4 py-4 xl:justify-center xl:border-l xl:border-t-0 xl:px-0 xl:py-0">
            <MatchCardActions
              canEdit={canEdit}
              detailsId={detailsId}
              match={match}
              redirectTo={redirectTo}
            />
          </div>
          </div>

        </div>
      </summary>

      <div className="overflow-hidden rounded-b-[10px] border-t border-[var(--border)] bg-[#fffefd] px-5 py-5 sm:px-6">
        <div className="grid gap-6 xl:grid-cols-4">
          <Section
            title="Producción y Dirección"
            icon={SlidersHorizontal}
            rows={buildProductionRows(match)}
          />
          <Section title="Cámaras" icon={Video} rows={cameraRows} />
          <Section
            title="Relatos & Comentarios"
            icon={Mic2}
            rows={talentRows}
          />
          <Section
            title="Observaciones / Transporte"
            icon={PencilLine}
            rows={observationRows}
          />
        </div>
      </div>
    </details>
  );
}
