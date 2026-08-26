import { and, eq, exists, gte, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import {
  formatMatchDate,
  formatMatchTime,
  getDateInputValue,
  getMonthInputValue,
  toDateKey,
} from "@/lib/date";
import type { UserContext } from "@/lib/auth";
import type { MatchStatus } from "@/lib/database.types";
import { db } from "@/lib/db/client";
import {
  assignments as assignmentsTable,
  matches as matchesTable,
  people as peopleTable,
  roles as rolesTable,
} from "@/lib/db/schema";
import {
  findLinkedPerson,
  type LinkedPerson,
} from "@/lib/data/linked-person";

export { findLinkedPerson };

type AssignmentRow = {
  id: string;
  confirmed: boolean;
  attendance_confirmed_at: string | null;
  attendance_response: string | null;
  attendance_note: string | null;
  encoder_number_1: number | null;
  encoder_number_2: number | null;
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
    // Every assignment of the match (all people), embedded so the crew
    // context arrives in the same round-trip as the person's assignments.
    context?: MatchAssignmentContextRow[] | null;
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
  attendanceResponse: "attending" | "declined" | null;
  attendanceNote: string | null;
  encoderNumber1: number | null;
  encoderNumber2: number | null;
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
  linkedBy: "email" | "profile" | null;
  allAssignments: CollaboratorAssignmentItem[];
  // From today's date onward (date-based, ascending). Primary list in Mi jornada.
  upcomingAssignments: CollaboratorAssignmentItem[];
  // Earlier than today but within the current month (date descending).
  pastMonthAssignments: CollaboratorAssignmentItem[];
  summary: {
    totalUpcoming: number;
    pendingUpcoming: number;
    nextKickoffLabel: string | null;
  };
};

export type CollaboratorMatchData = {
  person: LinkedPerson | null;
  linkedBy: "email" | "profile" | null;
  assignment: CollaboratorAssignmentItem | null;
  assignmentsForMatch: CollaboratorAssignmentItem[];
  trialAccess: boolean;
};

export function isUuidLike(value: string) {
  return UUID_PATTERN.test(value);
}

function normalizeAttendanceResponse(
  value: string | null,
): "attending" | "declined" | null {
  return value === "attending" || value === "declined" ? value : null;
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
    attendanceResponse: normalizeAttendanceResponse(assignment.attendance_response),
    attendanceNote: assignment.attendance_note,
    encoderNumber1: assignment.encoder_number_1,
    encoderNumber2: assignment.encoder_number_2,
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
  attendanceResponse?: "attending" | "declined" | null;
  attendanceNote?: string | null;
  encoderNumber1?: number | null;
  encoderNumber2?: number | null;
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
    attendanceResponse: params.attendanceResponse ?? null,
    attendanceNote: params.attendanceNote ?? null,
    encoderNumber1: params.encoderNumber1 ?? null,
    encoderNumber2: params.encoderNumber2 ?? null,
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

  const rawRows = await db
    .select({
      match_id: assignmentsTable.matchId,
      role: {
        name: rolesTable.name,
        category: rolesTable.category,
        sort_order: rolesTable.sortOrder,
      },
      person: {
        full_name: peopleTable.fullName,
        phone: peopleTable.phone,
        email: peopleTable.email,
      },
    })
    .from(assignmentsTable)
    .innerJoin(rolesTable, eq(assignmentsTable.roleId, rolesTable.id))
    .leftJoin(peopleTable, eq(assignmentsTable.personId, peopleTable.id))
    .where(inArray(assignmentsTable.matchId, matchIds));

  const rows: MatchAssignmentContextRow[] = rawRows.map((row) => ({
    match_id: row.match_id,
    role: row.role,
    person: row.person?.full_name != null ? row.person : null,
  }));
  const contextMap = new Map<string, MatchAssignmentContextRow[]>();

  rows.forEach((row) => {
    const current = contextMap.get(row.match_id) ?? [];
    current.push(row);
    contextMap.set(row.match_id, current);
  });

  return contextMap;
}

// The match's full crew, aggregated inside the assignments statement instead of
// fetched as a follow-up read. Emitted as JSON so one row per assignment still
// carries every crew member, and ordered so a match with two people in the same
// role resolves to the same one on every request (the old follow-up read left
// that to whatever order Postgres happened to return).
const CREW_CONTEXT_JSON = sql<MatchAssignmentContextRow[]>`(
    select coalesce(
      json_agg(
        json_build_object(
          'match_id', crew.match_id,
          'role', json_build_object(
            'name', crew_role.name,
            'category', crew_role.category,
            'sort_order', crew_role.sort_order
          ),
          'person', case
            when crew_person.full_name is null then null
            else json_build_object(
              'full_name', crew_person.full_name,
              'phone', crew_person.phone,
              'email', crew_person.email
            )
          end
        )
        order by crew_role.sort_order asc, crew_person.full_name asc nulls last
      ),
      '[]'::json
    )
    from assignments crew
    join roles crew_role on crew_role.id = crew.role_id
    left join people crew_person on crew_person.id = crew.person_id
    where crew.match_id = ${matchesTable.id}
  )`;

// One statement for the whole collaborator read: resolve the `people` row behind
// the user, their in-window assignments, and each match's crew. The three used to
// be serial round-trips, and every one of them sat between the request and the
// collaborator seeing their own name.
//
// The person is resolved in a CTE and LEFT JOINed to, so a collaborator with no
// assignments in the window still comes back identified — the page distinguishes
// "not linked to a person" from "linked, nothing scheduled".
async function selectAssignmentsForLinkedPerson(params: {
  personId?: string;
  personEmail?: string;
  sinceIso?: string;
  matchId?: string;
}) {
  const ownerPeople = alias(peopleTable, "owner_people");
  const windowMatch = alias(matchesTable, "window_match");
  const linkedPerson = db.$with("linked_person").as(
    db
      .select({
        id: peopleTable.id,
        full_name: peopleTable.fullName,
        email: peopleTable.email,
        phone: peopleTable.phone,
        active: peopleTable.active,
      })
      .from(peopleTable)
      .where(
        and(
          eq(peopleTable.active, true),
          isNull(peopleTable.deletedAt),
          params.personId
            ? eq(peopleTable.id, params.personId)
            : eq(peopleTable.email, params.personEmail ?? ""),
        ),
      )
      .limit(1),
  );

  const assignmentJoin: SQL[] = [eq(assignmentsTable.personId, linkedPerson.id)];

  // Bound the read: `sinceIso` trims the person's history to a kickoff window and
  // `matchId` scopes it to a single match, so callers never pull the whole
  // assignment history just to keep one slice. The window is an EXISTS on the
  // join rather than a WHERE on the outer matches join, so out-of-window
  // assignments are never fetched AND an empty window still yields the person.
  if (params.sinceIso) {
    assignmentJoin.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(windowMatch)
          .where(
            and(
              eq(windowMatch.id, assignmentsTable.matchId),
              gte(windowMatch.kickoffAt, params.sinceIso),
            ),
          ),
      ),
    );
  }

  if (params.matchId) {
    assignmentJoin.push(eq(assignmentsTable.matchId, params.matchId));
  }

  return db
    .with(linkedPerson)
    .select({
      person: {
        id: linkedPerson.id,
        full_name: linkedPerson.full_name,
        email: linkedPerson.email,
        phone: linkedPerson.phone,
        active: linkedPerson.active,
      },
      id: assignmentsTable.id,
      confirmed: assignmentsTable.confirmed,
      attendance_confirmed_at: assignmentsTable.attendanceConfirmedAt,
      attendance_response: assignmentsTable.attendanceResponse,
      attendance_note: assignmentsTable.attendanceNote,
      encoder_number_1: assignmentsTable.encoderNumber1,
      encoder_number_2: assignmentsTable.encoderNumber2,
      notes: assignmentsTable.notes,
      role: {
        id: rolesTable.id,
        name: rolesTable.name,
        category: rolesTable.category,
        sort_order: rolesTable.sortOrder,
      },
      match: {
        id: matchesTable.id,
        competition: matchesTable.competition,
        production_mode: matchesTable.productionMode,
        production_code: matchesTable.productionCode,
        status: matchesTable.status,
        home_team: matchesTable.homeTeam,
        away_team: matchesTable.awayTeam,
        venue: matchesTable.venue,
        notes: matchesTable.notes,
        transport: matchesTable.transport,
        kickoff_at: matchesTable.kickoffAt,
        duration_minutes: matchesTable.durationMinutes,
        timezone: matchesTable.timezone,
      },
      owner: {
        id: ownerPeople.id,
        full_name: ownerPeople.fullName,
        phone: ownerPeople.phone,
        email: ownerPeople.email,
      },
      context: CREW_CONTEXT_JSON,
    })
    .from(linkedPerson)
    .leftJoin(assignmentsTable, and(...assignmentJoin))
    .leftJoin(rolesTable, eq(assignmentsTable.roleId, rolesTable.id))
    .leftJoin(matchesTable, eq(assignmentsTable.matchId, matchesTable.id))
    .leftJoin(ownerPeople, eq(matchesTable.ownerId, ownerPeople.id));
}

async function getAssignmentsForPerson(
  personId: string,
  options: { sinceIso?: string; matchId?: string } = {},
) {
  const rows = await selectAssignmentsForLinkedPerson({ personId, ...options });

  return mapAssignmentRows(rows);
}

// A collaborator with no in-window assignments still returns one row (the person
// LEFT JOINed to nothing), so rows without a match are the "nothing scheduled"
// marker rather than data.
type LinkedPersonAssignmentRow = Awaited<
  ReturnType<typeof selectAssignmentsForLinkedPerson>
>[number];

function mapAssignmentRows(rows: LinkedPersonAssignmentRow[]) {
  const rawRows: AssignmentRow[] = rows
    .filter((row) => row.id !== null && row.match?.id != null)
    .map((row) => ({
      id: row.id!,
      confirmed: row.confirmed!,
      attendance_confirmed_at: row.attendance_confirmed_at,
      attendance_response: row.attendance_response,
      attendance_note: row.attendance_note,
      encoder_number_1: row.encoder_number_1,
      encoder_number_2: row.encoder_number_2,
      notes: row.notes,
      role: row.role,
      match: {
        ...row.match!,
        owner: row.owner?.id ? row.owner : null,
        context: row.context ?? [],
      },
    }));
  const matchContextMap = new Map<string, MatchAssignmentContextRow[]>();

  for (const row of rawRows) {
    if (row.match && !matchContextMap.has(row.match.id)) {
      matchContextMap.set(row.match.id, row.match.context ?? []);
    }
  }

  const assignments = rawRows
    .map(mapAssignmentRow)
    .filter((assignment): assignment is CollaboratorAssignmentItem => Boolean(assignment))
    .sort((left, right) => left.kickoffAt.localeCompare(right.kickoffAt));

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
        transport: "Llegar 120 minutos antes.",
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

  const ownerPeople = alias(peopleTable, "owner_people");
  const matchRows = await db
    .select({
      id: matchesTable.id,
      competition: matchesTable.competition,
      production_mode: matchesTable.productionMode,
      status: matchesTable.status,
      home_team: matchesTable.homeTeam,
      away_team: matchesTable.awayTeam,
      venue: matchesTable.venue,
      notes: matchesTable.notes,
      kickoff_at: matchesTable.kickoffAt,
      duration_minutes: matchesTable.durationMinutes,
      timezone: matchesTable.timezone,
      owner: {
        id: ownerPeople.id,
        full_name: ownerPeople.fullName,
        phone: ownerPeople.phone,
        email: ownerPeople.email,
      },
    })
    .from(matchesTable)
    .leftJoin(ownerPeople, eq(matchesTable.ownerId, ownerPeople.id))
    .where(eq(matchesTable.id, params.matchId))
    .limit(1);

  if (!matchRows[0]) {
    return null;
  }

  const match = {
    ...matchRows[0],
    owner: matchRows[0].owner?.id ? matchRows[0].owner : null,
  } as MatchContextMatchRow;
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
    profileId: string | null;
    email: string | null;
    profileName: string | null;
  },
): Promise<CollaboratorDayData> {
  void ctx;
  const todayKey = getDateInputValue();
  const currentMonth = getMonthInputValue();
  // The page only consumes assignments from the start of the current month
  // onward (past-month tail + today onward). Bounding at UTC month-start is safe
  // for the app's west-of-UTC timezones and never drops an in-window row.
  const monthStartIso = `${currentMonth}-01T00:00:00.000Z`;

  // The common path — the user's email matches a `people` row — resolves the
  // person, their assignments, and every match's crew in a single round-trip.
  const emailRows = params.email
    ? await selectAssignmentsForLinkedPerson({
      personEmail: params.email,
      sinceIso: monthStartIso,
    })
    : [];

  let person: LinkedPerson | null = emailRows[0]?.person ?? null;
  let linkedBy: "email" | "profile" | null = person ? "email" : null;
  let assignments = person ? mapAssignmentRows(emailRows) : [];

  // Fallback for users whose profile email is not on their `people` row: the
  // explicit people.profile_id link, then read the assignments separately. Rare
  // enough that its extra round-trips are not worth folding away.
  if (!person) {
    const byProfile = await findLinkedPerson({
      profileId: params.profileId,
      email: null,
    });

    if (byProfile.person) {
      person = byProfile.person;
      linkedBy = byProfile.linkedBy;
      assignments = await getAssignmentsForPerson(byProfile.person.id, {
        sinceIso: monthStartIso,
      });
    }
  }

  if (!person) {
    return {
      person: null,
      linkedBy: null,
      allAssignments: [],
      upcomingAssignments: [],
      pastMonthAssignments: [],
      summary: {
        totalUpcoming: 0,
        pendingUpcoming: 0,
        nextKickoffLabel: null,
      },
    };
  }

  // Today and later (date-based): the primary list.
  const upcomingAssignments = assignments.filter(
    (assignment) => toDateKey(assignment.kickoffAt, assignment.timezone) >= todayKey,
  );

  // Earlier than today but in the current month: revealed on demand.
  const pastMonthAssignments = assignments
    .filter((assignment) => {
      const dateKey = toDateKey(assignment.kickoffAt, assignment.timezone);
      return dateKey < todayKey && dateKey.slice(0, 7) === currentMonth;
    })
    .reverse();

  return {
    person,
    linkedBy,
    allAssignments: assignments,
    upcomingAssignments,
    pastMonthAssignments,
    summary: {
      totalUpcoming: upcomingAssignments.length,
      pendingUpcoming: upcomingAssignments.filter(
        (assignment) => !assignment.attendanceResponse,
      ).length,
      nextKickoffLabel: upcomingAssignments[0]
        ? `${formatMatchDate(upcomingAssignments[0].kickoffAt, upcomingAssignments[0].timezone, "EEE d MMM")} · ${upcomingAssignments[0].timeLabel}`
        : null,
    },
  };
}

export async function getCollaboratorMatchData(
  ctx: UserContext,
  params: {
    profileId: string | null;
    email: string | null;
    profileName: string | null;
    matchId: string;
  },
): Promise<CollaboratorMatchData> {
  void ctx;
  const { person, linkedBy } = await findLinkedPerson({
    profileId: params.profileId,
    email: params.email,
  });

  // Real matches are UUID-scoped straight in the query; demo/trial match ids
  // (non-UUID) never have a persisted assignment, so skip the read and let the
  // fallback build the trial view.
  const assignments =
    person && isUuidLike(params.matchId)
      ? await getAssignmentsForPerson(person.id, { matchId: params.matchId })
      : [];
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
