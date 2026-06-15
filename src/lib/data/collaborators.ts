import { parseISO } from "date-fns";

import {
  formatMatchDate,
  formatMatchTime,
  getDateInputValue,
  getMatchEndIso,
  toDateKey,
} from "@/lib/date";
import type { UserContext } from "@/lib/auth";
import type { MatchStatus } from "@/lib/database.types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  findLinkedPerson,
  type LinkedPerson,
} from "@/lib/data/linked-person";

export { findLinkedPerson };

type AssignmentRow = {
  id: string;
  confirmed: boolean;
  attendance_confirmed_at: string | null;
  notes: string | null;
  role: {
    id: string;
    name: string;
    category: string;
    sort_order: number;
  } | null;
  match: {
    id: string;
    competition: string | null;
    production_mode: string | null;
    production_code?: string | null;
    status: MatchStatus;
    home_team: string;
    away_team: string;
    venue: string | null;
    transport?: string | null;
    notes: string | null;
    kickoff_at: string;
    duration_minutes: number;
    timezone: string;
    owner: {
      id: string;
      full_name: string;
      phone: string | null;
      email: string | null;
    } | null;
  } | null;
};

type MatchAssignmentContextRow = {
  match_id: string;
  role: {
    name: string;
    category: string;
    sort_order: number;
  } | null;
  person: {
    full_name: string;
    phone: string | null;
    email: string | null;
  } | null;
};

type MatchContextMatchRow = NonNullable<AssignmentRow["match"]>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type CollaboratorAssignmentItem = {
  assignmentId: string;
  matchId: string;
  confirmed: boolean;
  attendanceConfirmedAt: string | null;
  notes: string | null;
  roleName: string | null;
  roleCategory: string | null;
  competition: string | null;
  productionMode: string | null;
  productionCode: string | null;
  status: MatchStatus;
  homeTeam: string;
  awayTeam: string;
  venue: string | null;
  kickoffAt: string;
  durationMinutes: number;
  timezone: string;
  ownerName: string | null;
  ownerPhone: string | null;
  ownerEmail: string | null;
  responsibleName: string | null;
  realizerName: string | null;
  operatorControlName: string | null;
  supportTechName: string | null;
  producerName: string | null;
  encoderName: string | null;
  relatorName: string | null;
  cameraCount: number;
  talentLabel: string | null;
  commentaryPlan: string | null;
  transport: string | null;
  matchNotes: string | null;
  contacts: CollaboratorGroupContact[];
  dateLabel: string;
  timeLabel: string;
};

export type CollaboratorGroupContact = {
  roleName: string;
  roleCategory: string | null;
  sortOrder: number;
  personName: string | null;
  phone: string | null;
  email: string | null;
};

export type CollaboratorDayData = {
  person: LinkedPerson | null;
  linkedBy: "email" | "name" | null;
  allAssignments: CollaboratorAssignmentItem[];
  todayAssignments: CollaboratorAssignmentItem[];
  upcomingAssignments: CollaboratorAssignmentItem[];
  summary: {
    totalToday: number;
    pendingToday: number;
    competitionsToday: number;
    nextKickoffLabel: string | null;
  };
};

export type CollaboratorMatchData = {
  person: LinkedPerson | null;
  linkedBy: "email" | "name" | null;
  assignment: CollaboratorAssignmentItem | null;
  assignmentsForMatch: CollaboratorAssignmentItem[];
  trialAccess: boolean;
};

export function isUuidLike(value: string) {
  return UUID_PATTERN.test(value);
}

function mapAssignmentRow(assignment: AssignmentRow): CollaboratorAssignmentItem | null {
  if (!assignment.match) {
    return null;
  }

  return buildAssignmentItem({
    assignmentId: assignment.id,
    match: assignment.match,
    confirmed: assignment.confirmed,
    attendanceConfirmedAt: assignment.attendance_confirmed_at,
    notes: assignment.notes,
    roleName: assignment.role?.name ?? null,
    roleCategory: assignment.role?.category ?? null,
  });
}

function buildAssignmentItem(params: {
  assignmentId: string;
  match: MatchContextMatchRow;
  confirmed?: boolean;
  attendanceConfirmedAt?: string | null;
  notes?: string | null;
  roleName?: string | null;
  roleCategory?: string | null;
  responsibleName?: string | null;
  realizerName?: string | null;
  operatorControlName?: string | null;
  supportTechName?: string | null;
  producerName?: string | null;
  encoderName?: string | null;
  relatorName?: string | null;
  cameraCount?: number;
  talentLabel?: string | null;
  contacts?: CollaboratorGroupContact[];
}) {
  const match = params.match;

  return {
    assignmentId: params.assignmentId,
    matchId: match.id,
    confirmed: params.confirmed ?? false,
    attendanceConfirmedAt: params.attendanceConfirmedAt ?? null,
    notes: params.notes ?? null,
    roleName: params.roleName ?? null,
    roleCategory: params.roleCategory ?? null,
    competition: match.competition,
    productionMode: match.production_mode,
    productionCode: match.production_code ?? null,
    status: match.status,
    homeTeam: match.home_team,
    awayTeam: match.away_team,
    venue: match.venue,
    kickoffAt: match.kickoff_at,
    durationMinutes: match.duration_minutes,
    timezone: match.timezone,
    ownerName: match.owner?.full_name ?? null,
    ownerPhone: match.owner?.phone ?? null,
    ownerEmail: match.owner?.email ?? null,
    responsibleName: params.responsibleName ?? null,
    realizerName: params.realizerName ?? null,
    operatorControlName: params.operatorControlName ?? null,
    supportTechName: params.supportTechName ?? null,
    producerName: params.producerName ?? null,
    encoderName: params.encoderName ?? null,
    relatorName: params.relatorName ?? null,
    cameraCount: params.cameraCount ?? 0,
    talentLabel: params.talentLabel ?? null,
    commentaryPlan: null,
    transport: match.transport ?? null,
    matchNotes: match.notes ?? null,
    contacts: params.contacts ?? [],
    dateLabel: formatMatchDate(match.kickoff_at, match.timezone, "EEE d MMM"),
    timeLabel: formatMatchTime(match.kickoff_at, match.timezone),
  } satisfies CollaboratorAssignmentItem;
}

function pickContextName(
  items: MatchAssignmentContextRow[],
  roleName: string,
): string | null {
  return (
    items.find((item) => item.role?.name === roleName)?.person?.full_name?.trim() ?? null
  );
}

function pickContextContact(
  items: MatchAssignmentContextRow[],
  roleName: string,
): CollaboratorGroupContact | null {
  const matched = items.find(
    (item) => item.role?.name === roleName && item.person?.full_name?.trim(),
  );

  if (!matched?.role || !matched.person?.full_name?.trim()) {
    return null;
  }

  return {
    roleName: matched.role.name,
    roleCategory: matched.role.category ?? null,
    sortOrder: matched.role.sort_order ?? 999,
    personName: matched.person.full_name.trim(),
    phone: matched.person.phone ?? null,
    email: matched.person.email ?? null,
  };
}

function buildTalentLabel(items: MatchAssignmentContextRow[]) {
  const orderedNames = items
    .filter((item) =>
      ["Relator", "Comentario 1", "Comentario 2", "Campo"].includes(
        item.role?.name ?? "",
      ),
    )
    .sort(
      (left, right) => (left.role?.sort_order ?? 0) - (right.role?.sort_order ?? 0),
    )
    .map((item) => item.person?.full_name?.trim())
    .filter((value): value is string => Boolean(value));

  if (!orderedNames.length) {
    return null;
  }

  return orderedNames.slice(0, 2).join(" / ");
}

function countCameraAssignments(items: MatchAssignmentContextRow[]) {
  return items.filter((item) => item.role?.category === "Camaras").length;
}

function buildGroupContacts(params: {
  items: MatchAssignmentContextRow[];
  fallbackResponsible?: {
    personName: string | null;
    phone: string | null;
    email: string | null;
  } | null;
}) {
  const contacts = params.items
    .filter((item) => item.role && item.person?.full_name?.trim())
    .map((item) => ({
      roleName: item.role!.name,
      roleCategory: item.role!.category ?? null,
      sortOrder: item.role!.sort_order ?? 999,
      personName: item.person!.full_name.trim(),
      phone: item.person!.phone ?? null,
      email: item.person!.email ?? null,
    }))
    .sort((left, right) => left.sortOrder - right.sortOrder);

  const hasResponsible = contacts.some((contact) => contact.roleName === "Responsable");

  if (!hasResponsible && params.fallbackResponsible?.personName) {
    contacts.unshift({
      roleName: "Responsable",
      roleCategory: "Coordinacion",
      sortOrder: 10,
      personName: params.fallbackResponsible.personName,
      phone: params.fallbackResponsible.phone ?? null,
      email: params.fallbackResponsible.email ?? null,
    });
  }

  return contacts;
}

async function getMatchContextMap(matchIds: string[]) {
  if (!matchIds.length) {
    return new Map<string, MatchAssignmentContextRow[]>();
  }

  const supabase = await createSupabaseServerClient();
  const result = await supabase
    .from("assignments")
    .select(
      "match_id, role:roles!assignments_role_id_fkey(name, category, sort_order), person:people!assignments_person_id_fkey(full_name, phone, email)",
    )
    .in("match_id", matchIds);

  if (result.error) {
    throw result.error;
  }

  const rows = (result.data ?? []) as MatchAssignmentContextRow[];
  const contextMap = new Map<string, MatchAssignmentContextRow[]>();

  rows.forEach((row) => {
    const current = contextMap.get(row.match_id) ?? [];
    current.push(row);
    contextMap.set(row.match_id, current);
  });

  return contextMap;
}

async function getAssignmentsForPerson(personId: string) {
  const supabase = await createSupabaseServerClient();
  const assignmentsResult = await supabase
    .from("assignments")
    .select(
      "id, confirmed, attendance_confirmed_at, notes, role:roles!assignments_role_id_fkey(id, name, category, sort_order), match:matches!assignments_match_id_fkey(id, competition, production_mode, production_code, status, home_team, away_team, venue, notes, transport, kickoff_at, duration_minutes, timezone, owner:people!matches_owner_id_fkey(id, full_name, phone, email))",
    )
    .eq("person_id", personId);

  if (assignmentsResult.error) {
    throw assignmentsResult.error;
  }

  const assignments = ((assignmentsResult.data ?? []) as AssignmentRow[])
    .map(mapAssignmentRow)
    .filter((assignment): assignment is CollaboratorAssignmentItem => Boolean(assignment))
    .sort((left, right) => left.kickoffAt.localeCompare(right.kickoffAt));

  const matchContextMap = await getMatchContextMap(
    assignments.map((assignment) => assignment.matchId),
  );

  return assignments.map((assignment) => {
    const contextRows = matchContextMap.get(assignment.matchId) ?? [];
    const responsibleName =
      pickContextName(contextRows, "Responsable") ?? assignment.ownerName ?? null;
    const responsibleContact =
      pickContextContact(contextRows, "Responsable") ??
      (assignment.ownerName
        ? {
            roleName: "Responsable",
            roleCategory: "Coordinacion",
            sortOrder: 10,
            personName: assignment.ownerName,
            phone: assignment.ownerPhone,
            email: assignment.ownerEmail,
          }
        : null);

    return {
      ...assignment,
      responsibleName,
      realizerName: pickContextName(contextRows, "Realizador"),
      operatorControlName: pickContextName(contextRows, "Operador de Control"),
      supportTechName: pickContextName(contextRows, "Soporte tecnico"),
      producerName: pickContextName(contextRows, "Productor"),
      encoderName: pickContextName(contextRows, "Encoder"),
      relatorName: pickContextName(contextRows, "Relator"),
      cameraCount: countCameraAssignments(contextRows),
      talentLabel: buildTalentLabel(contextRows),
      contacts: buildGroupContacts({
        items: contextRows,
        fallbackResponsible:
          responsibleContact && responsibleContact.personName
            ? {
                personName: responsibleContact.personName,
                phone: responsibleContact.phone,
                email: responsibleContact.email,
              }
            : null,
      }),
    };
  });
}

async function getFallbackAssignmentForMatch(params: {
  matchId: string;
  profileName: string | null;
}) {
  if (!isUuidLike(params.matchId)) {
    const demoKickoffAt = `${new Date().toISOString().slice(0, 10)}T19:30:00-05:00`;

    return buildAssignmentItem({
      assignmentId: `trial-${params.matchId}`,
      match: {
        id: params.matchId,
        competition: "Liga Nacional",
        production_mode: "Encoder",
        status: "Pendiente",
        home_team: "Boca Juniors",
        away_team: "Atenas de Córdoba",
        venue: "Luis Conde, Buenos Aires",
        transport: "Llegar 45 minutos antes. La sede suele abrir tarde.",
        notes: "Vista demo para validar el asistente de grupo y sus contactos.",
        kickoff_at: demoKickoffAt,
        duration_minutes: 150,
        timezone: "America/Bogota",
        owner: {
          id: "trial-owner",
          full_name: params.profileName ?? "Modo prueba",
          phone: null,
          email: null,
        },
      },
      roleName: "Colaborador",
      roleCategory: "Produccion",
      notes: "Modo prueba habilitado temporalmente.",
      responsibleName: params.profileName ?? "Modo prueba",
      realizerName: null,
      operatorControlName: "Mauro Ruiz Díaz",
      supportTechName: "Fary Leonardo Urriaga",
      producerName: null,
      encoderName: null,
      relatorName: null,
      cameraCount: 0,
      talentLabel: null,
      contacts: [
        {
          roleName: "Responsable",
          roleCategory: "Coordinacion",
          sortOrder: 10,
          personName: params.profileName ?? "Modo prueba",
          phone: null,
          email: null,
        },
        {
          roleName: "Operador de Control",
          roleCategory: "Produccion",
          sortOrder: 30,
          personName: "Mauro Ruiz Díaz",
          phone: "573001112233",
          email: "mauro.ruiz@basketproduction.pro",
        },
        {
          roleName: "Soporte tecnico",
          roleCategory: "Produccion",
          sortOrder: 40,
          personName: "Fary Leonardo Urriaga",
          phone: "573001112244",
          email: "fary.urriaga@basketproduction.pro",
        },
      ],
    });
  }

  const supabase = await createSupabaseServerClient();
  const matchResult = await supabase
    .from("matches")
    .select(
      "id, competition, production_mode, status, home_team, away_team, venue, notes, kickoff_at, duration_minutes, timezone, owner:people!matches_owner_id_fkey(id, full_name, phone, email)",
    )
    .eq("id", params.matchId)
    .maybeSingle();

  if (matchResult.error) {
    throw matchResult.error;
  }

  if (!matchResult.data) {
    return null;
  }

  const match = matchResult.data as MatchContextMatchRow;
  const contextRows = (await getMatchContextMap([params.matchId])).get(params.matchId) ?? [];
  const responsibleContact =
    pickContextContact(contextRows, "Responsable") ??
    (match.owner?.full_name
      ? {
          roleName: "Responsable",
          roleCategory: "Coordinacion",
          sortOrder: 10,
          personName: match.owner.full_name,
          phone: match.owner.phone ?? null,
          email: match.owner.email ?? null,
        }
      : null);

  return buildAssignmentItem({
    assignmentId: `trial-${params.matchId}`,
    match,
    roleName: "Colaborador",
    roleCategory: "Produccion",
    notes: "Modo prueba habilitado temporalmente.",
    responsibleName:
      pickContextName(contextRows, "Responsable") ??
      match.owner?.full_name ??
      params.profileName,
    realizerName: pickContextName(contextRows, "Realizador"),
    operatorControlName: pickContextName(contextRows, "Operador de Control"),
    supportTechName: pickContextName(contextRows, "Soporte tecnico"),
    producerName: pickContextName(contextRows, "Productor"),
    encoderName: pickContextName(contextRows, "Encoder"),
    relatorName: pickContextName(contextRows, "Relator"),
    cameraCount: countCameraAssignments(contextRows),
    talentLabel: buildTalentLabel(contextRows),
    contacts: buildGroupContacts({
      items: contextRows,
      fallbackResponsible:
        responsibleContact && responsibleContact.personName
          ? {
              personName: responsibleContact.personName,
              phone: responsibleContact.phone,
              email: responsibleContact.email,
            }
          : null,
    }),
  });
}

export async function getCollaboratorDayData(
  ctx: UserContext,
  params: {
    email: string | null;
    profileName: string | null;
    selectedDate?: string;
    timezone?: string;
  },
): Promise<CollaboratorDayData> {
  void ctx;
  const selectedDate = params.selectedDate ?? getDateInputValue();
  const { person, linkedBy } = await findLinkedPerson({
    email: params.email,
    profileName: params.profileName,
  });

  if (!person) {
    return {
      person: null,
      linkedBy: null,
      allAssignments: [],
      todayAssignments: [],
      upcomingAssignments: [],
      summary: {
        totalToday: 0,
        pendingToday: 0,
        competitionsToday: 0,
        nextKickoffLabel: null,
      },
    };
  }

  const assignments = await getAssignmentsForPerson(person.id);
  const now = new Date();

  const todayAssignments = assignments.filter(
    (assignment) => toDateKey(assignment.kickoffAt, assignment.timezone) === selectedDate,
  );

  const nextAssignments = assignments.filter((assignment) => {
    const end = parseISO(
      getMatchEndIso(assignment.kickoffAt, assignment.durationMinutes),
    );

    return end >= now;
  });

  const upcomingAssignments = nextAssignments
    .filter(
      (assignment) => toDateKey(assignment.kickoffAt, assignment.timezone) !== selectedDate,
    )
    .slice(0, 4);

  return {
    person,
    linkedBy,
    allAssignments: assignments,
    todayAssignments,
    upcomingAssignments,
    summary: {
      totalToday: todayAssignments.length,
      pendingToday: todayAssignments.filter((assignment) => !assignment.confirmed).length,
      competitionsToday: new Set(
        todayAssignments
          .map((assignment) => assignment.competition)
          .filter((value): value is string => Boolean(value)),
      ).size,
      nextKickoffLabel: nextAssignments[0]
        ? `${formatMatchDate(nextAssignments[0].kickoffAt, nextAssignments[0].timezone, "EEE d MMM")} · ${nextAssignments[0].timeLabel}`
        : null,
    },
  };
}

export async function getCollaboratorMatchData(
  ctx: UserContext,
  params: {
    email: string | null;
    profileName: string | null;
    matchId: string;
  },
): Promise<CollaboratorMatchData> {
  void ctx;
  const { person, linkedBy } = await findLinkedPerson({
    email: params.email,
    profileName: params.profileName,
  });

  const assignments = person ? await getAssignmentsForPerson(person.id) : [];
  const assignmentsForMatch = assignments.filter(
    (assignment) => assignment.matchId === params.matchId,
  );
  const assignment =
    assignmentsForMatch[0] ??
    (await getFallbackAssignmentForMatch({
      matchId: params.matchId,
      profileName: params.profileName,
    }));

  return {
    person,
    linkedBy,
    assignment,
    assignmentsForMatch,
    trialAccess: assignmentsForMatch.length === 0,
  };
}
