import { APP_NAME, APP_PORTAL_LABEL, PRODUCTION_SHORT_LABEL } from "@/lib/constants";
import { formatMatchDate, formatMatchTime, toCalendarDates } from "@/lib/date";
import { appEnv } from "@/lib/env";
import { getRoleDisplayName } from "@/lib/display";
import type { AssignmentDetail, MatchDetail } from "@/lib/types";
import { buildWhatsAppUrl } from "@/lib/utils";

type NotificationMatch = Pick<
  MatchDetail,
  | "away_team"
  | "competition"
  | "home_team"
  | "kickoff_at"
  | "production_mode"
  | "timezone"
  | "venue"
>;

export function buildGroupName(match: MatchDetail) {
  return `${match.home_team.toUpperCase()} VS ${match.away_team.toUpperCase()}`;
}

export function buildGoogleCalendarLink(match: MatchDetail) {
  const title = `${match.home_team} vs ${match.away_team}`;
  const details = [
    `Competencia: ${match.competition ?? "Sin definir"}`,
    `${PRODUCTION_SHORT_LABEL}: ${match.production_mode ?? "Sin definir"}`,
    `Responsable: ${match.owner?.full_name ?? "Sin definir"}`,
    "",
    "Asignaciones:",
    ...match.assignments
      .filter((assignment) => assignment.person)
      .map(
        (assignment) =>
          `${getRoleDisplayName(assignment.role.name)}: ${assignment.person?.full_name ?? "Pendiente"}`,
      ),
    "",
    `Observaciones: ${match.notes ?? "Sin observaciones"}`,
  ].join("\n");

  const url = new URL("https://calendar.google.com/calendar/render");
  url.searchParams.set("action", "TEMPLATE");
  url.searchParams.set("text", title);
  url.searchParams.set(
    "dates",
    toCalendarDates({
      kickoffAt: match.kickoff_at,
      durationMinutes: match.duration_minutes,
    }),
  );
  url.searchParams.set("details", details);
  url.searchParams.set("location", match.venue ?? "");

  return url.toString();
}

export function buildGroupMessage(match: MatchDetail) {
  const lines = [
    `GRUPO ${buildGroupName(match)}`,
    "",
    `Hora: ${match.kickoff_at}`,
    `Liga: ${match.competition ?? "Sin definir"}`,
    "",
    ...match.assignments
      .filter((assignment) => assignment.person)
      .map((assignment) => {
        const phone = assignment.person?.phone ?? "sin teléfono";
        return `${getRoleDisplayName(assignment.role.name)}: ${assignment.person?.full_name} (${phone})`;
      }),
  ];

  return lines.join("\n");
}

export function getWhatsAppRoster(assignments: AssignmentDetail[]) {
  return assignments
    .filter((assignment) => assignment.person?.phone)
    .map((assignment) => ({
      assignmentId: assignment.id,
      roleName: getRoleDisplayName(assignment.role.name),
      personName: assignment.person?.full_name ?? "Sin asignar",
      phone: assignment.person?.phone ?? "",
      href: buildWhatsAppUrl(assignment.person?.phone),
    }));
}

export function buildMatchNotificationSubject(match: NotificationMatch) {
  return `Convocatoria · ${match.home_team} vs ${match.away_team}`;
}

export function buildMatchNotificationMessage(params: {
  match: NotificationMatch;
  personName?: string | null;
  roleNames?: string[];
}) {
  const recipientName = params.personName?.trim() || "equipo";
  const roleLabel = params.roleNames?.length
    ? params.roleNames.join(", ")
    : "equipo asignado";
  const portalLink = `${appEnv.appUrl.replace(/\/$/, "")}/mi-jornada`;
  const dateLabel = formatMatchDate(
    params.match.kickoff_at,
    params.match.timezone,
    "EEEE dd 'de' MMMM 'de' yyyy",
  );
  const timeLabel = formatMatchTime(params.match.kickoff_at, params.match.timezone);

  return [
    `Hola ${recipientName},`,
    "",
    `Has sido convocado para ${params.match.home_team} vs ${params.match.away_team}.`,
    `Rol asignado: ${roleLabel}.`,
    "",
    `Liga: ${params.match.competition ?? "Sin liga"}`,
    `Fecha: ${dateLabel}`,
    `Hora: ${timeLabel} (${params.match.timezone})`,
    `Lugar: ${params.match.venue ?? "Sede por definir"}`,
    `${PRODUCTION_SHORT_LABEL}: ${params.match.production_mode ?? "Sin definir"}`,
    "",
    `Por favor confirma tu disponibilidad respondiendo este mensaje o revisando tu asignacion en el ${APP_PORTAL_LABEL}: ${portalLink}`,
    "",
    `Equipo ${APP_NAME}`,
  ].join("\n");
}

export function buildMatchNotificationMailtoHref(params: {
  email: string | null | undefined;
  match: NotificationMatch;
  personName?: string | null;
  roleNames?: string[];
}) {
  const email = params.email?.trim();

  if (!email) {
    return "";
  }

  const url = new URL(`mailto:${email}`);
  url.searchParams.set("subject", buildMatchNotificationSubject(params.match));
  url.searchParams.set(
    "body",
    buildMatchNotificationMessage({
      match: params.match,
      personName: params.personName,
      roleNames: params.roleNames,
    }),
  );

  return url.toString();
}

export function buildMatchNotificationWhatsAppHref(params: {
  phone: string | null | undefined;
  match: NotificationMatch;
  personName?: string | null;
  roleNames?: string[];
}) {
  const baseUrl = buildWhatsAppUrl(params.phone);

  if (!baseUrl) {
    return "";
  }

  const url = new URL(baseUrl);
  url.searchParams.set(
    "text",
    buildMatchNotificationMessage({
      match: params.match,
      personName: params.personName,
      roleNames: params.roleNames,
    }),
  );

  return url.toString();
}

export function buildBulkMatchNotificationMailtoHref(params: {
  emails: string[];
  match: NotificationMatch;
}) {
  const recipients = [...new Set(params.emails.map((email) => email.trim()).filter(Boolean))];

  if (!recipients.length) {
    return "";
  }

  const url = new URL("mailto:");
  url.searchParams.set("bcc", recipients.join(","));
  url.searchParams.set("subject", buildMatchNotificationSubject(params.match));
  url.searchParams.set(
    "body",
    buildMatchNotificationMessage({ match: params.match }),
  );

  return url.toString();
}
