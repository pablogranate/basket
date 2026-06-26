import Link from "next/link";
import { notFound } from "next/navigation";
import {
  CalendarDays,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Clock3,
  Home,
  MapPin,
  Megaphone,
  PencilLine,
  Plus,
  RadioTower,
  Repeat2,
  ShieldAlert,
  UsersRound,
  XCircle,
} from "lucide-react";

import {
  deleteMatchAction,
  updateMatchAction,
  upsertAssignmentAction,
} from "@/app/actions/matches";
import {
  AssignmentNotifyConfirm,
  type NotifyRecipient,
} from "@/components/match/assignment-notify-confirm";
import { GroupActions } from "@/components/match/group-actions";
import { HistoryTimeline } from "@/components/match/history-timeline";
import { TeamLogoMark } from "@/components/team-logo-mark";
import { SetupPanel } from "@/components/layout/setup-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageMessage } from "@/components/ui/page-message";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import { requireUserContext } from "@/lib/auth";
import { ALL_CLUB_OPTIONS, CLUB_COMPETITIONS } from "@/lib/club-catalog";
import {
  getProductionModeLabel,
  MATCH_STATUS_OPTIONS,
  PRODUCTION_MODE_OPTIONS,
  PRODUCTION_SHORT_LABEL,
} from "@/lib/constants";
import { getMatchDetailData } from "@/lib/data/dashboard";
import { summarizeAttendance } from "@/lib/attendance";
import { formatMatchDate, formatMatchTime } from "@/lib/date";
import { getRoleDisplayName } from "@/lib/display";
import type { PersonRow } from "@/lib/database.types";
import {
  type PersonFunctionKey,
  peopleAssignableTo,
  roleNameToFunctionKey,
} from "@/lib/functions";
import { isSupabaseConfigured } from "@/lib/env";
import { normalizeToWhatsAppChatId } from "@/lib/integrations/openwa";
import {
  buildGoogleCalendarLink,
  buildGroupMessage,
  buildGroupName,
  getWhatsAppRoster,
} from "@/lib/integrations";
import { parseNotice } from "@/lib/search-params";
import type { AssignmentDetail } from "@/lib/types";
import { cn } from "@/lib/utils";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type PersonOption = Pick<PersonRow, "id" | "full_name" | "phone" | "email" | "active"> & {
  functions: PersonFunctionKey[];
};

type ConflictNotice = {
  personId: string;
  personName: string;
  roleName: string;
  otherMatchId: string;
  otherMatchLabel: string;
  otherKickoffAt: string;
};

const primaryCategories = new Set(["Coordinacion", "Produccion", "Talento"]);

const pageStatusStyles: Record<string, string> = {
  Pendiente: "border-[#ecdcb0] bg-[#fff8ea] text-[#9a5a0f]",
  Confirmado: "border-[#cce8db] bg-[#effaf4] text-[#17654d]",
  Realizado: "border-[var(--n-200)] bg-[var(--n-50)] text-[var(--n-600)]",
};

function getInitials(name?: string | null) {
  const source = (name ?? "Pendiente").trim();
  const parts = source.split(/\s+/).filter(Boolean).slice(0, 2);

  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "P";
}

function sortAssignments(items: AssignmentDetail[]) {
  return [...items].sort((left, right) => left.role.sort_order - right.role.sort_order);
}

function getConflictForAssignment(
  assignment: AssignmentDetail,
  conflicts: ConflictNotice[],
) {
  if (!assignment.person_id) {
    return null;
  }

  return (
    conflicts.find(
      (conflict) =>
        conflict.personId === assignment.person_id &&
        conflict.roleName === assignment.role.name,
    ) ?? null
  );
}

function AssignmentControls({
  assignment,
  people,
  canEdit,
  matchId,
  redirectTo,
  layout = "inline",
}: {
  assignment: AssignmentDetail;
  people: PersonOption[];
  canEdit: boolean;
  matchId: string;
  redirectTo: string;
  layout?: "inline" | "stack";
}) {
  const assignablePeople = peopleAssignableTo(
    people,
    roleNameToFunctionKey(assignment.role.name),
  );

  return (
    <form
      action={upsertAssignmentAction}
      className={cn(
        "gap-3",
        layout === "inline"
          ? "grid md:grid-cols-[minmax(0,1.15fr)_minmax(0,0.9fr)_auto]"
          : "grid",
      )}
    >
      <input type="hidden" name="matchId" value={matchId} />
      <input type="hidden" name="roleId" value={assignment.role.id} />
      <input type="hidden" name="redirectTo" value={redirectTo} />

      <label className="space-y-2">
        <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--muted)]">
          Persona
        </span>
        <Select
          name="personId"
          defaultValue={assignment.person_id ?? ""}
          disabled={!canEdit}
        >
          <option value="">Sin asignar</option>
          {assignablePeople.map((person) => (
            <option key={person.id} value={person.id}>
              {person.full_name}
            </option>
          ))}
        </Select>
      </label>

      <label className="space-y-2">
        <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--muted)]">
          Notas
        </span>
        <Input
          name="notes"
          defaultValue={assignment.notes ?? ""}
          placeholder="Observación operativa"
          disabled={!canEdit}
        />
      </label>

      <div className="flex flex-col justify-end gap-3">
        <label className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--background-soft)] px-4 py-3 text-sm font-semibold text-[var(--foreground)]">
          <input
            type="checkbox"
            name="confirmed"
            defaultChecked={assignment.confirmed}
            disabled={!canEdit}
            className="size-4 rounded border-[var(--border)]"
          />
          Confirmado
        </label>
        {canEdit ? (
          <SubmitButton pendingLabel="Guardando..." className="w-full">
            Guardar
          </SubmitButton>
        ) : (
          <Button variant="secondary" disabled className="w-full">
            Solo lectura
          </Button>
        )}
      </div>
    </form>
  );
}

// Attendance confirmation by the assigned person (PRD #7). Read-only here: the
// producer view only surfaces state, it never sets it. Kept visually distinct
// from the post-match "reporte"/confirmed indicator.
function AttendanceBadge({
  assignment,
  timezone,
}: {
  assignment: AssignmentDetail;
  timezone: string;
}) {
  if (!assignment.person) {
    return null;
  }

  if (assignment.attendance_response === "declined") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-[#fdecec] px-2 py-0.5 text-[11px] font-semibold text-[#c0271f]">
        <XCircle className="size-3" />
        No asistirá
        {assignment.attendance_note ? ` · ${assignment.attendance_note}` : ""}
      </span>
    );
  }

  if (assignment.attendance_response === "attending") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-[#e8f6ef] px-2 py-0.5 text-[11px] font-semibold text-[#1c8052]">
        <CheckCircle2 className="size-3" />
        Asistencia confirmada
        {assignment.attendance_confirmed_at
          ? ` · ${formatMatchDate(assignment.attendance_confirmed_at, timezone, "d MMM")}`
          : ""}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-[var(--background-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--muted)]">
      <Clock3 className="size-3" />
      Asistencia pendiente
    </span>
  );
}

function PrincipalAssignmentCard({
  assignment,
  people,
  canEdit,
  matchId,
  redirectTo,
  conflict,
  timezone,
}: {
  assignment: AssignmentDetail;
  people: PersonOption[];
  canEdit: boolean;
  matchId: string;
  redirectTo: string;
  conflict: ConflictNotice | null;
  timezone: string;
}) {
  const assignedName = assignment.person?.full_name ?? "Pendiente asignar";

  return (
    <details
      id={`assignment-${assignment.role.id}`}
      className={cn(
        "panel-surface group border bg-[var(--surface)] transition",
        conflict
          ? "border-[var(--accent-border)] bg-[var(--accent-soft)]"
          : "border-[var(--border)] hover:border-[var(--accent-border)]",
      )}
    >
      <summary className="flex cursor-pointer list-none items-center gap-4 p-4 [&::-webkit-details-marker]:hidden">
        <div
          className={cn(
            "flex size-12 shrink-0 items-center justify-center rounded-full border text-sm font-extrabold",
            conflict
              ? "border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent)]"
              : "border-[var(--border)] bg-[var(--background-soft)] text-[var(--foreground)]",
          )}
        >
          {getInitials(assignment.person?.full_name)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-[var(--accent)]">
            {getRoleDisplayName(assignment.role.name)}
          </p>
          <div className="mt-1 flex items-center gap-2">
            <p
              className={cn(
                "text-base leading-tight",
                assignment.person
                  ? "font-semibold text-[var(--foreground)]"
                  : "font-medium italic text-[var(--muted)]",
              )}
            >
              {assignedName}
            </p>
            {conflict ? <CircleAlert className="size-4 text-[var(--accent)]" /> : null}
          </div>
          {conflict ? (
            <p className="mt-1 text-xs font-medium text-[var(--accent)]">
              Conflicto con: {conflict.otherMatchLabel} (
              {formatMatchTime(conflict.otherKickoffAt)})
            </p>
          ) : assignment.notes ? (
            <p className="mt-1 text-xs text-[var(--muted)]">{assignment.notes}</p>
          ) : null}
          <div className="mt-2">
            <AttendanceBadge assignment={assignment} timezone={timezone} />
          </div>
        </div>
        <div className="flex items-center gap-3">
          {assignment.confirmed ? (
            <CheckCircle2 className="size-4 text-[#24a267]" />
          ) : (
            <Repeat2 className="size-4 text-[var(--muted)]" />
          )}
          <ChevronDown className="size-4 text-[var(--muted)] transition group-open:rotate-180" />
        </div>
      </summary>
      <div className="border-t border-[var(--border)] bg-[var(--surface-muted)] p-4">
        <AssignmentControls
          assignment={assignment}
          people={people}
          canEdit={canEdit}
          matchId={matchId}
          redirectTo={redirectTo}
        />
      </div>
    </details>
  );
}

function CameraAssignmentCard({
  assignment,
  people,
  canEdit,
  matchId,
  redirectTo,
  conflict,
  timezone,
}: {
  assignment: AssignmentDetail;
  people: PersonOption[];
  canEdit: boolean;
  matchId: string;
  redirectTo: string;
  conflict: ConflictNotice | null;
  timezone: string;
}) {
  const pending = !assignment.person;

  return (
    <details
      id={`assignment-${assignment.role.id}`}
      className={cn(
        "panel-surface group border bg-[var(--surface)] transition",
        conflict
          ? "border-[var(--accent-border)] bg-[var(--accent-soft)]"
          : pending
            ? "border-[#ecdcb0] bg-[#fffdf7]"
            : "border-[var(--border)]",
      )}
    >
      <summary className="cursor-pointer list-none p-4 [&::-webkit-details-marker]:hidden">
        <div className="flex items-start justify-between gap-3">
          <span className="rounded-md bg-[var(--background-soft)] px-2 py-1 text-[11px] font-bold text-[var(--muted)]">
            {getRoleDisplayName(assignment.role.name)}
          </span>
          {conflict ? (
            <CircleAlert className="size-4 text-[var(--accent)]" />
          ) : assignment.person ? (
            <CheckCircle2 className="size-4 text-[#24a267]" />
          ) : (
            <Repeat2 className="size-4 text-[#c39a1d]" />
          )}
        </div>
        <p
          className={cn(
            "mt-4 text-sm leading-tight",
            pending
              ? "font-medium italic text-[var(--muted)]"
              : "font-semibold text-[var(--foreground)]",
          )}
        >
          {assignment.person?.full_name ?? "Pendiente asignar"}
        </p>
        <p className="mt-1 text-xs text-[var(--muted)]">
          {assignment.notes ?? (assignment.confirmed ? "Confirmado" : "Sin confirmación")}
        </p>
        <div className="mt-2">
          <AttendanceBadge assignment={assignment} timezone={timezone} />
        </div>
        <div className="mt-3 flex items-center justify-end gap-2 text-xs font-semibold text-[var(--muted)]">
          Editar
          <ChevronDown className="size-4 transition group-open:rotate-180" />
        </div>
      </summary>
      <div className="border-t border-[var(--border)] bg-[var(--surface-muted)] p-4">
        <AssignmentControls
          assignment={assignment}
          people={people}
          canEdit={canEdit}
          matchId={matchId}
          redirectTo={redirectTo}
          layout="stack"
        />
      </div>
    </details>
  );
}

function TransmissionAssignmentRow({
  assignment,
  people,
  canEdit,
  matchId,
  redirectTo,
  timezone,
}: {
  assignment: AssignmentDetail;
  people: PersonOption[];
  canEdit: boolean;
  matchId: string;
  redirectTo: string;
  timezone: string;
}) {
  const stateClass = assignment.confirmed
    ? "bg-[#effaf4] text-[#17654d]"
    : "bg-[var(--background-soft)] text-[var(--muted)]";

  return (
    <details className="panel-surface group border border-[var(--border)] bg-[var(--surface)]">
      <summary className="cursor-pointer list-none p-4 [&::-webkit-details-marker]:hidden">
        <div className="flex items-center gap-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--background-soft)] text-[var(--muted)]">
            <RadioTower className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-extrabold text-[var(--foreground)]">
              {getRoleDisplayName(assignment.role.name)}
            </p>
            <p className="mt-1 text-xs text-[var(--muted)]">
              {assignment.person?.full_name ?? "Pendiente asignar"}
              {assignment.notes ? ` · ${assignment.notes}` : ""}
            </p>
            <div className="mt-2">
              <AttendanceBadge assignment={assignment} timezone={timezone} />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className={cn("rounded-full px-3 py-1 text-xs font-semibold", stateClass)}>
              {assignment.confirmed ? "Confirmado" : "Pendiente"}
            </span>
            <ChevronDown className="size-4 text-[var(--muted)] transition group-open:rotate-180" />
          </div>
        </div>
      </summary>
      <div className="border-t border-[var(--border)] bg-[var(--surface-muted)] p-4">
        <AssignmentControls
          assignment={assignment}
          people={people}
          canEdit={canEdit}
          matchId={matchId}
          redirectTo={redirectTo}
          layout="stack"
        />
      </div>
    </details>
  );
}

export default async function MatchDetailPage({
  params,
  searchParams,
}: PageProps) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  const { intent, notice, notify } = parseNotice(resolvedSearchParams);

  if (!isSupabaseConfigured) {
    return <SetupPanel />;
  }

  const user = await requireUserContext();
  const redirectTo = `/match/${resolvedParams.id}`;
  const data = await getMatchDetailData(user, resolvedParams.id).catch(
    () => null,
  );

  if (!data) {
    notFound();
  }

  const { match, people, history, conflicts } = data;
  const calendarLink = buildGoogleCalendarLink(match);
  const groupName = buildGroupName(match);
  const groupMessage = buildGroupMessage(match);
  const roster = getWhatsAppRoster(match.assignments);
  const peopleMap = new Map(people.map((person) => [person.id, person.full_name]));

  const notifyIds = new Set(notify);
  const notifyRecipients: NotifyRecipient[] = notifyIds.size
    ? match.assignments
        .filter(
          (assignment) => notifyIds.has(assignment.id) && assignment.person?.phone,
        )
        .map((assignment) => {
          const chatId = normalizeToWhatsAppChatId(assignment.person?.phone);
          return {
            assignmentId: assignment.id,
            personName: assignment.person?.full_name ?? "Sin asignar",
            roleName: getRoleDisplayName(assignment.role.name),
            resolvedNumber: chatId.replace(/@s\.whatsapp\.net$/, ""),
            willSend: Boolean(chatId),
          };
        })
    : [];

  const principalAssignments = sortAssignments(
    match.assignments.filter((assignment) => primaryCategories.has(assignment.role.category)),
  );
  const cameraAssignments = sortAssignments(
    match.assignments.filter((assignment) => assignment.role.category === "Camaras"),
  );
  const transmissionAssignments = sortAssignments(
    match.assignments.filter((assignment) => assignment.role.category === "Transmision"),
  );

  const principalAssignedCount = principalAssignments.filter((assignment) => assignment.person_id).length;
  const nextOpenPrincipal = principalAssignments.find((assignment) => !assignment.person_id) ?? null;
  const attendance = summarizeAttendance(match.assignments);

  return (
    <div className="space-y-8">
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-sm">
        <Link
          href="/grid"
          className="inline-flex items-center gap-1.5 font-medium text-[var(--muted)] transition hover:text-[var(--accent)]"
        >
          <Home className="size-4" />
          Inicio
        </Link>
        <ChevronRight className="size-4 text-[var(--n-300)]" />
        <Link
          href="/grid"
          className="font-medium text-[var(--muted)] transition hover:text-[var(--accent)]"
        >
          Producción
        </Link>
        <ChevronRight className="size-4 text-[var(--n-300)]" />
        <span className="font-semibold text-[var(--foreground)]">Detalle de Partido</span>
      </nav>

      <section className="panel-surface relative overflow-hidden border border-[var(--border)] bg-[var(--surface)] p-6">
        <div className="absolute inset-y-0 right-0 w-72 bg-gradient-to-l from-[rgba(227,27,35,0.06)] to-transparent pointer-events-none" />
        <div className="relative z-10 flex flex-wrap justify-between gap-6">
          <div className="flex max-w-3xl flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <Badge className={pageStatusStyles[match.status] ?? pageStatusStyles.Pendiente}>
                {match.status}
              </Badge>
              <Badge>{match.competition ?? "Sin liga"}</Badge>
              <Badge>{getProductionModeLabel(match.production_mode) || "Sin definir"}</Badge>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <TeamLogoMark
                teamName={match.home_team}
                competition={match.competition}
                className="size-14 rounded-full"
                imageClassName="p-2"
                initialsClassName="text-sm"
              />
              <h1 className="text-3xl font-black tracking-[-0.03em] text-[var(--foreground)] sm:text-4xl">
                {match.home_team} vs {match.away_team}
              </h1>
              <TeamLogoMark
                teamName={match.away_team}
                competition={match.competition}
                className="size-14 rounded-full"
                imageClassName="p-2"
                initialsClassName="text-sm"
              />
            </div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm font-medium text-[var(--muted)] sm:text-base">
              <div className="flex items-center gap-1.5">
                <CalendarDays className="size-4" />
                {formatMatchDate(match.kickoff_at, match.timezone, "dd MMM yyyy")}
              </div>
              <div className="flex items-center gap-1.5">
                <Clock3 className="size-4" />
                {formatMatchTime(match.kickoff_at, match.timezone)} {match.timezone}
              </div>
              <div className="flex items-center gap-1.5">
                <MapPin className="size-4" />
                {match.venue ?? "Sede sin definir"}
              </div>
            </div>
          </div>

          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <Link
              href={calendarLink}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--foreground)] transition hover:bg-[var(--background-soft)]"
            >
              <CalendarDays className="size-4" />
              Google Calendar
            </Link>
            <Link
              href="#grupo"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[var(--accent-border)] bg-[var(--accent-soft)] px-4 text-sm font-semibold text-[var(--accent)] transition hover:bg-[var(--accent-border)]"
            >
              <UsersRound className="size-4" />
              GRUPO
            </Link>
            <Link
              href={`/match/${match.id}/notificar`}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[var(--accent-border)] bg-[var(--accent-soft)] px-4 text-sm font-semibold text-[var(--accent)] transition hover:bg-[var(--accent-border)]"
            >
              <Megaphone className="size-4" />
              Notificar
            </Link>
            <a
              href="#operativa"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-5 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(227,27,35,0.18)] transition hover:bg-[var(--accent-strong)]"
            >
              <PencilLine className="size-4" />
              Editar asignaciones
            </a>
          </div>
        </div>
      </section>

      <PageMessage intent={intent} message={notice} />

      {notifyRecipients.length ? (
        <AssignmentNotifyConfirm matchId={match.id} recipients={notifyRecipients} />
      ) : null}

      {conflicts.length ? (
        <div className="panel-surface border border-[var(--accent-border)] bg-[var(--accent-soft)] p-4">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
              <ShieldAlert className="size-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-[var(--foreground)]">
                Hay conflictos de horario detectados para este partido.
              </p>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Revisa las filas marcadas en rojo dentro del equipo principal y cámaras.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      <details className="panel-surface border border-[var(--border)] bg-[var(--surface)]">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 [&::-webkit-details-marker]:hidden">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-[var(--accent)]">
              Partido
            </p>
            <h2 className="mt-1 text-lg font-extrabold text-[var(--foreground)]">
              Datos operativos y observaciones
            </h2>
          </div>
          <ChevronDown className="size-4 text-[var(--muted)] transition group-open:rotate-180" />
        </summary>
        <div className="border-t border-[var(--border)] bg-[var(--surface-muted)] p-5">
          <form action={updateMatchAction} className="space-y-4">
            <input type="hidden" name="matchId" value={match.id} />
            <input type="hidden" name="redirectTo" value={redirectTo} />

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <label className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--muted)]">
                  Local
                </span>
                <Input
                  name="homeTeam"
                  list="match-club-catalog"
                  defaultValue={match.home_team}
                  disabled={!user.canEdit}
                />
              </label>
              <label className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--muted)]">
                  Visitante
                </span>
                <Input
                  name="awayTeam"
                  list="match-club-catalog"
                  defaultValue={match.away_team}
                  disabled={!user.canEdit}
                />
              </label>
              <label className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--muted)]">
                  Fecha
                </span>
                <Input
                  type="date"
                  name="date"
                  defaultValue={formatMatchDate(match.kickoff_at, match.timezone, "yyyy-MM-dd")}
                  disabled={!user.canEdit}
                />
              </label>
              <label className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--muted)]">
                  Hora
                </span>
                <Input
                  type="time"
                  name="time"
                  defaultValue={formatMatchTime(match.kickoff_at, match.timezone, "HH:mm")}
                  disabled={!user.canEdit}
                />
              </label>
              <label className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--muted)]">
                  Liga
                </span>
                <Input
                  name="competition"
                  list="match-competition-catalog"
                  defaultValue={match.competition ?? ""}
                  disabled={!user.canEdit}
                />
              </label>
              <label className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--muted)]">
                  {PRODUCTION_SHORT_LABEL}
                </span>
                <Select
                  name="productionMode"
                  defaultValue={getProductionModeLabel(match.production_mode)}
                  disabled={!user.canEdit}
                >
                  <option value="">Sin definir</option>
                  {PRODUCTION_MODE_OPTIONS.map((mode) => (
                    <option key={mode} value={mode}>
                      {mode}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--muted)]">
                  Estado
                </span>
                <Select name="status" defaultValue={match.status} disabled={!user.canEdit}>
                  {MATCH_STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--muted)]">
                  Responsable
                </span>
                <Select
                  name="ownerId"
                  defaultValue={match.owner_id ?? ""}
                  disabled={!user.canEdit}
                >
                  <option value="">Sin responsable</option>
                  {peopleAssignableTo(people, "Responsable").map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.full_name}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--muted)]">
                  Sede
                </span>
                <Input name="venue" defaultValue={match.venue ?? ""} disabled={!user.canEdit} />
              </label>
              <label className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--muted)]">
                  Duración
                </span>
                <Input
                  type="number"
                  min={30}
                  name="durationMinutes"
                  defaultValue={match.duration_minutes}
                  disabled={!user.canEdit}
                />
              </label>
            </div>

            <input type="hidden" name="timezone" value={match.timezone} />
            <datalist id="match-competition-catalog">
              {CLUB_COMPETITIONS.map((competition) => (
                <option key={competition} value={competition} />
              ))}
            </datalist>
            <datalist id="match-club-catalog">
              {ALL_CLUB_OPTIONS.map((club) => (
                <option key={club} value={club} />
              ))}
            </datalist>

            <label className="space-y-2">
              <span className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--muted)]">
                Observaciones
              </span>
              <Textarea
                name="notes"
                defaultValue={match.notes ?? ""}
                disabled={!user.canEdit}
              />
            </label>

            <div className="flex flex-wrap gap-3">
              {user.canEdit ? (
                <>
                  <SubmitButton pendingLabel="Guardando...">Guardar cambios</SubmitButton>
                  <button
                    type="submit"
                    formAction={deleteMatchAction}
                    className="inline-flex items-center justify-center rounded-xl border border-[var(--accent-border)] bg-[var(--accent-soft)] px-4 py-2.5 text-sm font-semibold text-[var(--accent-strong)] transition hover:bg-[var(--accent-border)]"
                  >
                    Eliminar
                  </button>
                </>
              ) : (
                <Button variant="secondary" disabled>
                  Solo lectura
                </Button>
              )}
            </div>
          </form>
        </div>
      </details>

      <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
        <span className="flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
          <CheckCircle2 className="size-4 text-[#1c8052]" />
          Asistencia confirmada
        </span>
        <span className="text-sm font-bold text-[var(--foreground)]">
          {attendance.confirmed}/{attendance.total} confirmados
        </span>
      </div>

      <div
        id="operativa"
        className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1.02fr)_minmax(0,0.98fr)]"
      >
        <section className="space-y-4">
          <div className="flex items-center justify-between border-b border-[var(--border)] pb-2">
            <h2 className="flex items-center gap-2 text-xl font-bold text-[var(--foreground)]">
              <UsersRound className="size-5 text-[var(--accent)]" />
              Equipo Técnico Principal
            </h2>
            <span className="text-sm font-medium text-[#b0888f]">
              {principalAssignedCount} Asignados
            </span>
          </div>

          <div className="space-y-3">
            {principalAssignments.map((assignment) => (
              <PrincipalAssignmentCard
                key={assignment.role.id}
                assignment={assignment}
                people={people}
                canEdit={user.canEdit}
                matchId={match.id}
                redirectTo={redirectTo}
                conflict={getConflictForAssignment(assignment, conflicts)}
                timezone={match.timezone}
              />
            ))}

            {nextOpenPrincipal ? (
              <a
                href={`#assignment-${nextOpenPrincipal.role.id}`}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--accent-border)] bg-[var(--accent-soft)] text-sm font-semibold text-[var(--accent-strong)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
              >
                <Plus className="size-4" />
                Añadir Miembro
              </a>
            ) : null}
          </div>
        </section>

        <section className="space-y-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-2">
              <h2 className="flex items-center gap-2 text-xl font-bold text-[var(--foreground)]">
                <Camera className="size-5 text-[var(--accent)]" />
                Cámaras y Operadores
              </h2>
              <span className="text-sm font-medium text-[#b0888f]">
                {cameraAssignments.length} Req.
              </span>
            </div>

            {cameraAssignments.length ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {cameraAssignments.map((assignment) => (
                  <CameraAssignmentCard
                    key={assignment.role.id}
                    assignment={assignment}
                    people={people}
                    canEdit={user.canEdit}
                    matchId={match.id}
                    redirectTo={redirectTo}
                    conflict={getConflictForAssignment(assignment, conflicts)}
                    timezone={match.timezone}
                  />
                ))}
              </div>
            ) : (
              <div className="panel-surface border border-dashed border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-[var(--muted)]">
                No hay roles de cámara activos en este partido.
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-2">
              <h2 className="flex items-center gap-2 text-xl font-bold text-[var(--foreground)]">
                <RadioTower className="size-5 text-[var(--accent)]" />
                Transmisión
              </h2>
            </div>

            {transmissionAssignments.length ? (
              <div className="space-y-3">
                {transmissionAssignments.map((assignment) => (
                  <TransmissionAssignmentRow
                    key={assignment.role.id}
                    assignment={assignment}
                    people={people}
                    canEdit={user.canEdit}
                    matchId={match.id}
                    redirectTo={redirectTo}
                    timezone={match.timezone}
                  />
                ))}
              </div>
            ) : (
              <div className="panel-surface border border-dashed border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-[var(--muted)]">
                Aún no hay datos cargados para transmisión.
              </div>
            )}
          </div>

          <div id="grupo">
            <GroupActions groupName={groupName} message={groupMessage} roster={roster} />
          </div>
        </section>
      </div>

      <HistoryTimeline
        history={history}
        assignments={match.assignments}
        people={peopleMap}
      />
    </div>
  );
}
