import {
  CalendarDays,
  Clock3,
  Hash,
  MapPin,
  Mic2,
  ShieldUser,
  Video,
} from "lucide-react";

import { MatchCardActions } from "@/components/grid/match-card-actions";
import {
  MatchCardDetails,
  type MatchCardSection,
  type SectionRow,
} from "@/components/grid/match-card-details";
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
import { getCompactPersonName } from "@/lib/display";
import { getAttendanceState, getAttendanceTextClass } from "@/lib/grid/attendance";
import { getGridLeagueColor } from "@/lib/league-grid-colors";
import { toMatchEditPrefill } from "@/lib/grid/match-prefill";
import { getTeamLeagueLabel } from "@/lib/team-directory";
import type { MatchListItem } from "@/lib/types";
import { cn } from "@/lib/utils";

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
    attendanceState: getAttendanceState(
      assignment?.attendance_response ?? null,
      assignment?.person_id ?? null,
    ),
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
      attendanceState: responsible.attendanceState,
    },
    {
      label: "Realizador",
      value: director.value,
      muted: director.muted,
      compactValue: true,
      attendanceState: director.attendanceState,
    },
    {
      label: "Operador de Control",
      value: control.value,
      muted: control.muted,
      compactValue: true,
      attendanceState: control.attendanceState,
    },
    {
      label: "Soporte tecnico",
      value: support.value,
      muted: support.muted,
      compactValue: true,
      attendanceState: support.attendanceState,
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
      attendanceState: getAttendanceState(
        assignment.attendance_response,
        assignment.person_id,
      ),
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
      attendanceState: item.attendanceState,
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
    match.status === "Realizado" ? "bg-[#26b36a]" : "bg-[var(--n-200)]";
  const detailsId = `match-card-${match.id}`;
  const sections: MatchCardSection[] = [
    { key: "production", rows: buildProductionRows(match) },
    { key: "cameras", rows: cameraRows },
    { key: "talent", rows: talentRows },
    { key: "observations", rows: observationRows },
  ];

  return (
    <details
      id={detailsId}
      className={cn(
        "mc-card panel-surface group relative overflow-visible border border-[var(--border)] bg-[var(--surface)] transition [&_summary::-webkit-details-marker]:hidden [&_summary::marker]:hidden",
      )}
    >
      <summary className="relative cursor-pointer list-none">
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute left-[-12px] top-1/2 z-0 h-[118px] w-[30px] -translate-y-1/2 rounded-l-[10px] rounded-r-[6px] shadow-[inset_-1px_0_0_rgba(255,255,255,0.16),0_8px_18px_rgba(28,13,16,0.06)]",
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
                isUnassignedLeague && "rounded-2xl bg-[var(--n-100)]",
              )}
            />
            <p
              className={cn(
                "text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--n-500)]",
                isUnassignedLeague && "text-[var(--n-500)]",
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
                    className="mc-team-name"
                  >
                    {match.home_team}
                  </p>
                </div>

                <span className="self-center justify-self-center text-sm font-semibold uppercase tracking-[0.18em] text-[var(--n-400)] 2xl:text-base">
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
                    className="mc-team-name"
                  >
                    {match.away_team}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-center gap-2 text-center text-[12px] font-semibold text-[var(--n-400)]">
                <MapPin className="size-3.5 shrink-0" />
                <span className="truncate" title={venueLabel}>
                  {venueLabel}
                </span>
              </div>
            </div>
          </div>

          <div className="mc-col xl:border-r">
            <div className="flex items-center gap-2">
              <ShieldUser className="mc-icon" />
              <p className="mc-col-tag">
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
                    "mc-person-name",
                    responsible.muted && "text-[var(--muted)] italic font-semibold",
                    getAttendanceTextClass(responsible.attendanceState),
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
                    "mc-person-name",
                    director.muted && "text-[var(--muted)] italic font-semibold",
                    getAttendanceTextClass(director.attendanceState),
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

          <div className="mc-col xl:border-r">
            <div className="flex items-center gap-2">
              <Mic2 className="mc-icon" />
              <p className="mc-col-tag">
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
                <p
                  className={cn(
                    "mt-1 text-sm font-bold text-[var(--foreground)]",
                    getAttendanceTextClass(narrator.attendanceState),
                  )}
                >
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
                    "mc-person-name",
                    commentator.muted && "text-[var(--muted)] italic font-semibold",
                    getAttendanceTextClass(commentator.attendanceState),
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

          <div className="mc-col xl:border-r">
            {match.production_code ? (
              <div>
                <p className="mc-col-label">
                  <Hash className="mc-icon" />
                  ID evento
                </p>
                <div className="mt-2">
                  <span
                    className={cn(
                      badgeBaseClassName,
                      "border border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent)]",
                    )}
                  >
                    {match.production_code}
                  </span>
                </div>
              </div>
            ) : null}
            <div>
              <p className="mc-col-label">
                <Video className="mc-icon" />
                {PRODUCTION_SHORT_LABEL}
              </p>
              <div className="mt-2">
                <span
                  className={cn(
                    badgeBaseClassName,
                    "border border-[var(--n-200)] bg-[var(--n-50)] text-[var(--n-600)]",
                  )}
                >
                  {formatProductionModeLabel(match.production_mode)}
                </span>
              </div>
            </div>
          </div>

          <div className="mc-col">
            <div>
              <p className="mc-col-label">
                <CalendarDays className="mc-icon" />
                Fecha
              </p>
              <p className="mt-2 text-[1.12rem] font-extrabold leading-tight tracking-[-0.03em] text-[var(--foreground)]">
                {formatGridDate(match.kickoff_at, match.timezone)}
              </p>
            </div>
            <div>
              <p className="mc-col-label">
                <Clock3 className="mc-icon" />
                Hora
              </p>
              <p className="font-[family-name:var(--font-oswald)] mt-1 text-4xl font-bold tracking-[-0.06em] text-[var(--accent)]">
                {formatMatchTime(match.kickoff_at, match.timezone)}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-end border-t border-[var(--border)] px-4 py-4 xl:justify-center xl:border-l xl:border-t-0 xl:px-0 xl:py-0">
            <MatchCardActions
              canEdit={canEdit}
              detailsId={detailsId}
              match={toMatchEditPrefill(match)}
              redirectTo={redirectTo}
            />
          </div>
          </div>

        </div>
      </summary>

      <MatchCardDetails
        detailsId={detailsId}
        matchId={match.id}
        matchLabel={`${match.home_team} vs ${match.away_team}`}
        sections={sections}
      />
    </details>
  );
}
