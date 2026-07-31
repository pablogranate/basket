import { MatchCardActions } from "@/components/grid/match-card-actions";
import { MatchCardIcon } from "@/components/grid/match-card-icon-sprite";
import { MatchCardDetails } from "@/components/grid/match-card-details";
import { getAssignmentValue } from "@/lib/grid/match-card-sections";
import { TeamLogoMark } from "@/components/team-logo-mark";
import { LeagueLogoMarkClient } from "@/components/league-logo-mark-client";
import { QuickMatchFieldEditor } from "@/components/grid/quick-match-field-editor";
import { HoverAvatarBadge } from "@/components/ui/hover-avatar-badge";
import {
  getProductionModeLabel,
  PRODUCTION_SHORT_LABEL,
  RESPONSIBLE_DISPLAY_LABEL,
} from "@/lib/constants";
import { formatMatchTimeLabel, isPendingKickoffTime } from "@/lib/date";
import { getCompactPersonName, getInitials } from "@/lib/display";
import { getAttendanceTextClass } from "@/lib/grid/attendance";
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

// Year-less date for the compact mobile band, where the meta line shares space
// with the venue. The xl grid keeps the full `formatGridDate` (with year).
function formatGridDateShort(kickoffAt: string, timezone: string) {
  const parts = new Intl.DateTimeFormat("es-AR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    timeZone: timezone,
  }).formatToParts(new Date(kickoffAt));

  const weekday = parts.find((part) => part.type === "weekday")?.value ?? "";
  const day = parts.find((part) => part.type === "day")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";

  return [weekday, day, month]
    .filter(Boolean)
    .join(" ")
    .replaceAll(".", "")
    .replaceAll(",", "")
    .toUpperCase();
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
  // One shared prefill object for both MatchCardActions instances (mobile +
  // desktop): Flight dedupes by reference, so a second toMatchEditPrefill call
  // would serialize the whole prefill twice per card.
  const matchPrefill = toMatchEditPrefill(match);

  return (
    <details
      id={detailsId}
      className="mc-card panel-surface group"
    >
      <summary className="relative cursor-pointer list-none">
        {/* Mobile / tablet band card (< xl) — league-color band, teams hero,
            date+venue meta, and a responsable/mode footer. The xl grid below is
            unchanged; everything else stays behind the expand. */}
        <div className="overflow-hidden rounded-[10px] xl:hidden">
          <div
            className="mc-band-head"
            style={
              leagueColor
                ? { backgroundColor: leagueColor.background }
                : { backgroundColor: "var(--n-100)" }
            }
          >
            <LeagueLogoMarkClient
              league={leagueLabel}
              className={cn(
                "h-8 w-8 shrink-0",
                isUnassignedLeague && "rounded-lg bg-white/40",
              )}
            />
            <p
              className="mc-band-league"
              style={{ color: leagueColor?.text ?? "var(--n-600)" }}
            >
              {leagueLabel}
            </p>
            <span
              className={cn(
                "mc-band-time",
                isPendingKickoffTime(match.kickoff_at, match.timezone)
                  ? "text-sm"
                  : "text-2xl leading-none",
              )}
              style={{ color: leagueColor?.text ?? "var(--accent)" }}
            >
              {formatMatchTimeLabel(match.kickoff_at, match.timezone)}
            </span>
          </div>

          <div className="mc-band-hero">
            <div className="mc-hero-team">
              <TeamLogoMark
                teamName={match.home_team}
                competition={match.competition}
                className="size-14 rounded-full"
              />
              <p className="mc-hero-name">
                {match.home_team}
              </p>
            </div>
            <span className="mc-band-vs">
              vs
            </span>
            <div className="mc-hero-team">
              <TeamLogoMark
                teamName={match.away_team}
                competition={match.competition}
                className="size-14 rounded-full"
              />
              <p className="mc-hero-name">
                {match.away_team}
              </p>
            </div>
          </div>

          <div className="mc-band-meta">
            <span className="inline-flex items-center gap-1.5">
              <MatchCardIcon name="calendar-days" className="size-3.5" />
              {formatGridDateShort(match.kickoff_at, match.timezone)}
            </span>
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <MatchCardIcon name="map-pin" className="size-3.5 shrink-0" />
              <span className="truncate">{venueLabel}</span>
            </span>
          </div>

          <div className="mc-band-foot">
            <HoverAvatarBadge
              initials={getInitials(responsible.value)}
              roleLabel={RESPONSIBLE_DISPLAY_LABEL}
              showTooltip={false}
              tone="neutral"
              size="sm"
            />
            <p
              className={cn(
                "mc-band-owner",
                responsible.muted && "italic font-semibold text-[var(--muted)]",
                getAttendanceTextClass(responsible.attendanceState),
              )}
            >
              {getCompactPersonName(responsible.value)}
            </p>
            <span className="mc-badge-mode">
              {formatProductionModeLabel(match.production_mode)}
            </span>
            <MatchCardIcon name="chevron-down" className="mc-band-chev" />
          </div>

          <div className="mc-band-actions">
            <MatchCardActions
              canEdit={canEdit}
              detailsId={detailsId}
              match={matchPrefill}
              redirectTo={redirectTo}
              className="flex-row"
            />
          </div>
        </div>

        <span
          aria-hidden="true"
          className={cn(
            "mc-status-tab",
            statusAccentClass,
          )}
        />
        <div className="mc-desktop">
          <div className="mc-grid">
          <div
            className={cn(
              "mc-league-col",
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
                "mc-league-label",
                isUnassignedLeague && "text-[var(--n-500)]",
              )}
              style={leagueColor ? { color: leagueColor.text } : undefined}
            >
              {leagueLabel}
            </p>
          </div>

          <div className="mc-teams-col">
            <div className="mx-auto w-full max-w-[16rem] 2xl:max-w-[20.5rem]">
              <div className="mc-teams-grid">
                <div className="mc-team-block">
                  {canEdit ? (
                    <QuickMatchFieldEditor
                      field="homeTeam"
                      value={match.home_team}
                      matchId={match.id}
                      redirectTo={redirectTo}
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

                <span className="mc-vs">
                  vs
                </span>

                <div className="mc-team-block">
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

              <div className="mc-venue">
                <MatchCardIcon name="map-pin" className="size-3.5 shrink-0" />
                <span className="truncate" title={venueLabel}>
                  {venueLabel}
                </span>
              </div>
            </div>
          </div>

          <div className="mc-col xl:border-r">
            <div className="flex items-center gap-2">
              <MatchCardIcon name="shield-user" className="mc-icon" />
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
                <p className="mc-role-tag">
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
                <p className="mc-role-tag">
                  Realizador Integral
                </p>
              </div>
            </div>
          </div>

          <div className="mc-col xl:border-r">
            <div className="flex items-center gap-2">
              <MatchCardIcon name="mic-vocal" className="mc-icon" />
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
                    "mt-1 mc-person-name",
                    getAttendanceTextClass(narrator.attendanceState),
                  )}
                >
                  {getCompactPersonName(narrator.value)}
                </p>
                <p className="mc-role-tag-italic">
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
                <p className="mc-role-tag-italic">
                  Comentarios
                </p>
              </div>
            </div>
          </div>

          <div className="mc-col xl:border-r">
            {match.production_code ? (
              <div>
                <p className="mc-col-label">
                  <MatchCardIcon name="hash" className="mc-icon" />
                  ID Plataforma
                </p>
                <div className="mt-2">
                  <span className="mc-badge-id">
                    {match.production_code}
                  </span>
                </div>
              </div>
            ) : null}
            <div>
              <p className="mc-col-label">
                <MatchCardIcon name="video" className="mc-icon" />
                {PRODUCTION_SHORT_LABEL}
              </p>
              <div className="mt-2">
                <span className="mc-badge-neutral">
                  {formatProductionModeLabel(match.production_mode)}
                </span>
              </div>
            </div>
          </div>

          <div className="mc-col">
            <div>
              <p className="mc-col-label">
                <MatchCardIcon name="calendar-days" className="mc-icon" />
                Fecha
              </p>
              <p className="mc-date">
                {formatGridDate(match.kickoff_at, match.timezone)}
              </p>
            </div>
            <div>
              <p className="mc-col-label">
                <MatchCardIcon name="clock-3" className="mc-icon" />
                Hora
              </p>
              <p
                className={cn(
                  "mc-time",
                  isPendingKickoffTime(match.kickoff_at, match.timezone)
                    ? "text-lg"
                    : "text-4xl",
                )}
              >
                {formatMatchTimeLabel(match.kickoff_at, match.timezone)}
              </p>
            </div>
          </div>

          <div className="mc-actions-col">
            <MatchCardActions
              canEdit={canEdit}
              detailsId={detailsId}
              match={matchPrefill}
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
      />
    </details>
  );
}
