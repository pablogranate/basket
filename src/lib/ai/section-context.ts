import "server-only";

import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

import {
  type SectionAiContextRef,
  type SectionKey,
} from "@/lib/ai/section-keys";
import type { UserContext } from "@/lib/auth";
import { DEFAULT_TIMEZONE, isDashboardPathAllowedForRole } from "@/lib/constants";
import {
  type CollaboratorAssignmentItem,
  getCollaboratorDayData,
} from "@/lib/data/collaborators";
import {
  type GridFilters,
  getGridData,
  getPeopleData,
  getRolesData,
} from "@/lib/data/dashboard";
import { getTeamDirectory } from "@/lib/data/teams";
import { formatMatchDate } from "@/lib/date";
import { appEnv } from "@/lib/env";
import {
  getAssignmentStateDisplayName,
  getRoleCategoryDisplayName,
  getRoleDisplayName,
} from "@/lib/display";
import type { PeopleAiContextItem } from "@/lib/people-ai";
import { applyPeopleFilters, parsePeopleFilters } from "@/lib/people-filters";
import { parsePersonNotesMeta } from "@/lib/people-notes";
import { personCoverageNames } from "@/lib/team-responsibles";
import type { MatchListItem, PersonListItem } from "@/lib/types";
import type { RoleRow } from "@/lib/database.types";
import type { TeamDirectoryItem } from "@/lib/team-directory";

// Dashboard path each section mirrors for authorization. `mi-jornada` is open to
// every authenticated role (and guests in demo mode), so it is not gated here.
const SECTION_DASHBOARD_PATH: Record<
  Exclude<SectionKey, "mi-jornada">,
  string
> = {
  grid: "/grid",
  people: "/people",
  teams: "/teams",
  roles: "/roles",
};

export function isSectionAllowedForContext(
  section: SectionKey,
  ctx: UserContext,
): boolean {
  if (section === "mi-jornada") {
    return true;
  }

  return (
    Boolean(ctx.userId) &&
    isDashboardPathAllowedForRole(SECTION_DASHBOARD_PATH[section], ctx.role)
  );
}

export function toPeopleAiContext(
  people: PersonListItem[],
): PeopleAiContextItem[] {
  return people.map((person) => {
    const meta = parsePersonNotesMeta(person.notes);

    return {
      fullName: person.full_name,
      role: meta.role || person.primary_role || "",
      city: meta.city || "",
      coverage: personCoverageNames(person).join(", "),
      phone: person.phone ?? "",
      email: person.email ?? "",
      status: getAssignmentStateDisplayName(person.assignment_state),
      notes: meta.notes ?? "",
    };
  });
}

export function toTeamsAiContext(teams: TeamDirectoryItem[]) {
  return teams.map((team) => ({
    equipo: team.official_name,
    liga: team.competition,
    estadio: team.stadium ?? "Sin estadio cargado",
    responsable: team.manager ?? "Sin responsable",
    web: team.website ?? "",
    instagram: team.instagram ?? "",
    enlace_oficial: team.official_url ?? "",
    incidencias: team.incident_count,
  }));
}

export function toRolesAiContext(roles: RoleRow[]) {
  return roles.map((role) => ({
    nombre: getRoleDisplayName(role.name),
    categoria: getRoleCategoryDisplayName(role.category),
    orden: role.sort_order,
    activo: role.active ? "Sí" : "No",
  }));
}

export function toGridAiContext(matches: MatchListItem[]) {
  return matches.map((match) => ({
    partido: `${match.home_team} vs ${match.away_team}`,
    liga: match.competition,
    modo: match.production_mode,
    estado: match.status,
    responsable: match.owner?.full_name ?? "Sin responsable",
    fecha: formatMatchDate(match.kickoff_at, match.timezone, "dd/MM/yyyy"),
    hora: formatMatchDate(match.kickoff_at, match.timezone, "HH:mm"),
    sede: match.venue ?? "",
    asignaciones_confirmadas: match.assignments.filter(
      (assignment) => assignment.person && assignment.confirmed,
    ).length,
  }));
}

function capitalizeSentence(value: string) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

function formatAssignmentDateLabel(dateTimeValue: string) {
  return capitalizeSentence(
    format(parseISO(dateTimeValue), "d MMM yyyy", { locale: es }),
  );
}

export function toMiJornadaAiContext(assignments: CollaboratorAssignmentItem[]) {
  return assignments.map((assignment) => ({
    partido: `${assignment.homeTeam} vs ${assignment.awayTeam}`,
    liga: assignment.competition ?? "Sin liga",
    fecha: formatAssignmentDateLabel(assignment.kickoffAt),
    hora: assignment.timeLabel,
    sede: assignment.venue ?? "Sede por definir",
    responsable:
      assignment.responsibleName ?? assignment.ownerName ?? "Sin asignar",
    modo: assignment.productionMode ?? "Sin definir",
    rol: assignment.roleName,
    camaras: assignment.cameraCount,
    asistencia: assignment.attendanceResponse ?? "pendiente",
  }));
}

// Mirrors the demo assignment the page shows when the user has no upcoming
// matches, so the badge count and the assistant answer stay identical.
function buildMiJornadaDemoContext(collaboratorName: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: appEnv.appTimezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const todayKey = formatter.format(new Date());
  const kickoffAt = `${todayKey}T19:30:00-05:00`;

  return {
    partido: "Boca Juniors vs Atenas de Córdoba",
    liga: "Liga Nacional",
    fecha: formatAssignmentDateLabel(kickoffAt),
    hora: "19:30",
    sede: "Luis Conde, Buenos Aires",
    responsable: collaboratorName,
    modo: "Encoder",
    rol: "Realizador",
    camaras: 4,
    asistencia: "pendiente",
  };
}

function buildGridFilters(params: Record<string, string>): GridFilters {
  return {
    view: params.view === "day" ? "day" : "month",
    date: params.date ?? "",
    q: params.q ?? "",
    league: params.league ?? "",
    mode: params.mode ?? "",
    status: params.status ?? "",
    owner: params.owner ?? "",
    timezone: params.timezone || DEFAULT_TIMEZONE,
  };
}

// Rebuilds a section's AI context server-side from the same loaders the pages
// use, so the initial payload only carries a count and the dataset is derived
// at question time (never trusting a client-posted blob).
export async function resolveSectionAiContext(
  ctx: UserContext,
  ref: SectionAiContextRef,
): Promise<unknown[]> {
  const params = ref.params ?? {};

  switch (ref.section) {
    case "people": {
      const people = await getPeopleData(ctx);
      const filters = parsePeopleFilters(params);
      const query = params.q ?? "";
      return toPeopleAiContext(
        applyPeopleFilters({ people, filters, query }),
      );
    }
    case "teams": {
      const teams = await getTeamDirectory(ctx);
      return toTeamsAiContext(teams);
    }
    case "roles": {
      const { roles } = await getRolesData(ctx);
      return toRolesAiContext(roles);
    }
    case "grid": {
      const { dayGroups } = await getGridData(ctx, buildGridFilters(params));
      return toGridAiContext(dayGroups.flatMap((group) => group.items));
    }
    case "mi-jornada": {
      const data = await getCollaboratorDayData(ctx, {
        email: ctx.email,
        profileName: ctx.profile?.full_name ?? null,
      });

      if (data.upcomingAssignments.length === 0) {
        const collaboratorName =
          data.person?.full_name?.trim() ||
          ctx.profile?.full_name?.trim() ||
          "Modo invitado";
        return [buildMiJornadaDemoContext(collaboratorName)];
      }

      return toMiJornadaAiContext(data.upcomingAssignments);
    }
  }
}
