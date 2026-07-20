import { parseISO, addDays, subDays } from "date-fns";
import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNotNull,
  lte,
  ne,
  or,
  type SQL,
} from "drizzle-orm";

import { ROLE_CATEGORY_ORDER } from "@/lib/constants";
import {
  isPersonFunctionKey,
  type PersonFunctionKey,
} from "@/lib/functions";
import {
  getMatchEndIso,
  resolveDateWindow,
  toDateKey,
} from "@/lib/date";
import type { UserContext } from "@/lib/auth";
import { db } from "@/lib/db/client";
import {
  assignmentColumns,
  auditLogColumns,
  matchColumns,
  peopleColumns,
  roleColumns,
} from "@/lib/db/rows";
import {
  assignments as assignmentsTable,
  auditLog as auditLogTable,
  matches as matchesTable,
  people as peopleTable,
  personFunctions as personFunctionsTable,
  profiles as profilesTable,
  roles as rolesTable,
} from "@/lib/db/schema";
import type { TeamResponsiblePerson } from "@/lib/team-responsibles";
import type { MatchRow, PersonRow, RoleRow } from "@/lib/database.types";
import type {
  AuditEntry,
  GridOwner,
  MatchDetail,
  MatchListItem,
  PersonListItem,
} from "@/lib/types";

export type GridFilters = {
  view: "day" | "month";
  date: string;
  q: string;
  league: string;
  mode: string;
  status: string;
  owner: string;
  timezone: string;
};

type ActiveRole = Pick<
  RoleRow,
  "id" | "name" | "category" | "sort_order" | "active"
>;

type GridAssignment = MatchListItem["assignments"][number];
type PersonAssignmentSummary = {
  person_id: string | null;
  match: { kickoff_at: string; duration_minutes: number } | null;
};

export async function getGridData(ctx: UserContext, filters: GridFilters) {
  void ctx;
  const window = resolveDateWindow({
    view: filters.view,
    date: filters.date,
    timezone: filters.timezone,
  });

  const conditions: SQL[] = [
    gte(matchesTable.kickoffAt, window.startUtc),
    lte(matchesTable.kickoffAt, window.endUtc),
  ];

  if (filters.league) {
    conditions.push(eq(matchesTable.competition, filters.league));
  }

  if (filters.mode) {
    conditions.push(eq(matchesTable.productionMode, filters.mode));
  }

  if (filters.status) {
    conditions.push(eq(matchesTable.status, filters.status as MatchRow["status"]));
  }

  if (filters.owner) {
    conditions.push(eq(matchesTable.ownerId, filters.owner));
  }

  if (filters.q) {
    const term = filters.q.replaceAll(",", " ").trim();
    conditions.push(
      or(
        ilike(matchesTable.homeTeam, `%${term}%`),
        ilike(matchesTable.awayTeam, `%${term}%`),
        ilike(matchesTable.competition, `%${term}%`),
      )!,
    );
  }

  // One parallel round: the owner rides the match query as a join, and the
  // assignments query scopes itself with a subquery over the same window
  // conditions instead of waiting for the match ids in JS.
  const matchIdsInWindow = db
    .select({ id: matchesTable.id })
    .from(matchesTable)
    .where(and(...conditions));

  const [matchRows, ownersData, rolesData, functionsData, assignmentRows] =
    await Promise.all([
      db
        .select({
          ...matchColumns,
          owner: {
            id: peopleTable.id,
            full_name: peopleTable.fullName,
            phone: peopleTable.phone,
          },
        })
        .from(matchesTable)
        .leftJoin(peopleTable, eq(matchesTable.ownerId, peopleTable.id))
        .where(and(...conditions))
        // Secondary sort on id makes same-kickoff ordering deterministic (the
        // retired PostgREST query left ties to the query plan).
        .orderBy(asc(matchesTable.kickoffAt), asc(matchesTable.id)),
      db
        .select({
          id: peopleTable.id,
          full_name: peopleTable.fullName,
          phone: peopleTable.phone,
          email: peopleTable.email,
        })
        .from(peopleTable)
        .where(eq(peopleTable.active, true))
        .orderBy(asc(peopleTable.fullName)),
      db
        .select({
          id: rolesTable.id,
          name: rolesTable.name,
          category: rolesTable.category,
          sort_order: rolesTable.sortOrder,
          active: rolesTable.active,
        })
        .from(rolesTable)
        .where(eq(rolesTable.active, true))
        .orderBy(asc(rolesTable.sortOrder)),
      db
        .select({
          person_id: personFunctionsTable.personId,
          function_key: personFunctionsTable.functionKey,
        })
        .from(personFunctionsTable),
      db
        .select({
          id: assignmentsTable.id,
          match_id: assignmentsTable.matchId,
          role_id: assignmentsTable.roleId,
          person_id: assignmentsTable.personId,
          confirmed: assignmentsTable.confirmed,
          attendance_response: assignmentsTable.attendanceResponse,
          attendance_note: assignmentsTable.attendanceNote,
          notes: assignmentsTable.notes,
          role: {
            id: rolesTable.id,
            name: rolesTable.name,
            category: rolesTable.category,
            sort_order: rolesTable.sortOrder,
            active: rolesTable.active,
          },
          person: {
            id: peopleTable.id,
            full_name: peopleTable.fullName,
            phone: peopleTable.phone,
            email: peopleTable.email,
          },
        })
        .from(assignmentsTable)
        .innerJoin(rolesTable, eq(assignmentsTable.roleId, rolesTable.id))
        .leftJoin(peopleTable, eq(assignmentsTable.personId, peopleTable.id))
        .where(inArray(assignmentsTable.matchId, matchIdsInWindow))
        .orderBy(asc(rolesTable.sortOrder)),
    ]);

  const assignmentsByMatch = new Map<string, GridAssignment[]>();
  for (const row of assignmentRows) {
    const person = row.person?.id ? row.person : null;
    const bucket = assignmentsByMatch.get(row.match_id) ?? [];
    bucket.push({ ...row, person } as GridAssignment);
    assignmentsByMatch.set(row.match_id, bucket);
  }

  const functionsByPerson = new Map<string, PersonFunctionKey[]>();

  for (const row of functionsData) {
    if (!isPersonFunctionKey(row.function_key)) {
      continue;
    }

    const bucket = functionsByPerson.get(row.person_id) ?? [];
    bucket.push(row.function_key);
    functionsByPerson.set(row.person_id, bucket);
  }

  const activeRoles = rolesData as ActiveRole[];

  // Assignments stay sparse: only persisted rows travel with each match. The
  // table view rebuilds empty slots client-side from the `roles` list, so the
  // ~roles-per-match synthetic fillers never inflate the RSC payload.
  const matches = matchRows.map(({ owner, ...match }) => ({
    ...match,
    owner: owner?.id ? owner : null,
    assignments: assignmentsByMatch.get(match.id) ?? [],
  })) as MatchListItem[];

  const dayGroups = matches.reduce<
    Array<{ key: string; label: string; items: MatchListItem[] }>
  >((groups, match) => {
    const dateKey = toDateKey(match.kickoff_at, match.timezone);
    const existing = groups.find((group) => group.key === dateKey);

    if (existing) {
      existing.items.push(match);
      return groups;
    }

    groups.push({
      key: dateKey,
      label: dateKey,
      items: [match],
    });
    return groups;
  }, []);

  const owners: GridOwner[] = (
    ownersData as Pick<PersonRow, "id" | "full_name" | "phone" | "email">[]
  ).map((owner) => ({
    ...owner,
    functions: functionsByPerson.get(owner.id) ?? [],
  }));

  return {
    dayGroups,
    owners,
    roles: activeRoles,
  };
}

export async function getMatchDetailData(ctx: UserContext, matchId: string) {
  void ctx;

  const [matchRows, assignmentsData, peopleRows, rolesData, historyData, functionsData] =
    await Promise.all([
      db
        .select({
          ...matchColumns,
          owner: {
            id: peopleTable.id,
            full_name: peopleTable.fullName,
            phone: peopleTable.phone,
            email: peopleTable.email,
          },
        })
        .from(matchesTable)
        .leftJoin(peopleTable, eq(matchesTable.ownerId, peopleTable.id))
        .where(eq(matchesTable.id, matchId))
        .limit(1),
      db
        .select({
          ...assignmentColumns,
          role: {
            id: rolesTable.id,
            name: rolesTable.name,
            category: rolesTable.category,
            sort_order: rolesTable.sortOrder,
            active: rolesTable.active,
          },
          person: {
            id: peopleTable.id,
            full_name: peopleTable.fullName,
            phone: peopleTable.phone,
            email: peopleTable.email,
          },
        })
        .from(assignmentsTable)
        .innerJoin(rolesTable, eq(assignmentsTable.roleId, rolesTable.id))
        .leftJoin(peopleTable, eq(assignmentsTable.personId, peopleTable.id))
        .where(eq(assignmentsTable.matchId, matchId))
        .orderBy(asc(assignmentsTable.createdAt)),
      db
        .select({
          id: peopleTable.id,
          full_name: peopleTable.fullName,
          phone: peopleTable.phone,
          email: peopleTable.email,
          active: peopleTable.active,
        })
        .from(peopleTable)
        .where(eq(peopleTable.active, true))
        .orderBy(asc(peopleTable.fullName)),
      db
        .select({
          id: rolesTable.id,
          name: rolesTable.name,
          category: rolesTable.category,
          sort_order: rolesTable.sortOrder,
          active: rolesTable.active,
        })
        .from(rolesTable)
        .where(eq(rolesTable.active, true))
        .orderBy(asc(rolesTable.sortOrder)),
      db
        .select({
          ...auditLogColumns,
          actor: {
            id: profilesTable.id,
            full_name: profilesTable.fullName,
            role: profilesTable.role,
          },
        })
        .from(auditLogTable)
        .leftJoin(profilesTable, eq(auditLogTable.changedBy, profilesTable.id))
        .where(eq(auditLogTable.matchId, matchId))
        .orderBy(desc(auditLogTable.createdAt))
        .limit(30),
      db
        .select({
          person_id: personFunctionsTable.personId,
          function_key: personFunctionsTable.functionKey,
        })
        .from(personFunctionsTable),
    ]);

  // supabase-js `.single()` errored on a missing match; preserve the throw.
  if (!matchRows[0]) {
    throw new Error(`Match ${matchId} not found`);
  }
  const matchRow = {
    ...matchRows[0],
    owner: matchRows[0].owner?.id ? matchRows[0].owner : null,
  };

  const functionsByPerson = new Map<string, PersonFunctionKey[]>();

  for (const row of functionsData) {
    if (!isPersonFunctionKey(row.function_key)) {
      continue;
    }

    const bucket = functionsByPerson.get(row.person_id) ?? [];
    bucket.push(row.function_key);
    functionsByPerson.set(row.person_id, bucket);
  }

  const roles = rolesData as Pick<
    RoleRow,
    "id" | "name" | "category" | "sort_order" | "active"
  >[];
  const rawAssignments = assignmentsData.map((assignment) => ({
    ...assignment,
    person: assignment.person?.id ? assignment.person : null,
  })) as MatchDetail["assignments"];
  const assignmentMap = new Map(
    rawAssignments.map((assignment) => [assignment.role_id, assignment]),
  );

  const normalizedAssignments = roles.map((role) => {
    const existing = assignmentMap.get(role.id);

    if (existing) {
      return existing;
    }

    return {
      id: `${matchId}:${role.id}`,
      match_id: matchId,
      role_id: role.id,
      person_id: null,
      confirmed: false,
      attendance_confirmed_at: null,
      attendance_response: null,
      attendance_note: null,
      notes: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      created_by: null,
      updated_by: null,
      role,
      person: null,
    };
  });

  const match = {
    ...(matchRow as unknown as MatchDetail),
    assignments: normalizedAssignments,
  };

  const conflicts = await getAssignmentConflicts({
    match,
    assignments: normalizedAssignments as MatchDetail["assignments"],
  });

  return {
    match,
    people: (
      peopleRows as Pick<
        PersonRow,
        "id" | "full_name" | "phone" | "email" | "active"
      >[]
    ).map((person) => ({
      ...person,
      functions: functionsByPerson.get(person.id) ?? [],
    })),
    roles,
    history: historyData.map((entry) => ({
      ...entry,
      actor: entry.actor?.id ? entry.actor : null,
    })) as unknown as AuditEntry[],
    conflicts,
  };
}

async function getAssignmentConflicts(params: {
  match: MatchDetail;
  assignments: MatchDetail["assignments"];
}) {
  const personIds = params.assignments
    .map((assignment) => assignment.person_id)
    .filter(Boolean) as string[];

  if (!personIds.length) {
    return [];
  }

  const currentStart = parseISO(params.match.kickoff_at);
  const currentEnd = parseISO(
    getMatchEndIso(params.match.kickoff_at, params.match.duration_minutes),
  );
  const windowStart = subDays(currentStart, 1).toISOString();
  const windowEnd = addDays(currentEnd, 1).toISOString();

  // The date-window filter runs on the joined match (inner), so only
  // assignments whose match falls in the ±1 day window come back.
  const overlappingAssignments = await db
    .select({
      person_id: assignmentsTable.personId,
      role: { name: rolesTable.name },
      person: { full_name: peopleTable.fullName },
      match: {
        id: matchesTable.id,
        home_team: matchesTable.homeTeam,
        away_team: matchesTable.awayTeam,
        kickoff_at: matchesTable.kickoffAt,
        duration_minutes: matchesTable.durationMinutes,
        timezone: matchesTable.timezone,
      },
    })
    .from(assignmentsTable)
    .innerJoin(matchesTable, eq(assignmentsTable.matchId, matchesTable.id))
    .innerJoin(rolesTable, eq(assignmentsTable.roleId, rolesTable.id))
    .leftJoin(peopleTable, eq(assignmentsTable.personId, peopleTable.id))
    .where(
      and(
        inArray(assignmentsTable.personId, personIds),
        ne(assignmentsTable.matchId, params.match.id),
        gte(matchesTable.kickoffAt, windowStart),
        lte(matchesTable.kickoffAt, windowEnd),
      ),
    );

  return overlappingAssignments
    .filter((assignment) => assignment.person_id)
    .filter((assignment) => {
      const otherStart = parseISO(assignment.match.kickoff_at);
      const otherEnd = parseISO(
        getMatchEndIso(
          assignment.match.kickoff_at,
          assignment.match.duration_minutes,
        ),
      );

      return currentStart < otherEnd && otherStart < currentEnd;
    })
    .map((assignment) => ({
      personId: assignment.person_id as string,
      personName: assignment.person?.full_name ?? "Sin asignar",
      roleName: assignment.role?.name ?? "Rol",
      otherMatchId: assignment.match.id,
      otherMatchLabel: `${assignment.match.home_team} vs ${assignment.match.away_team}`,
      otherKickoffAt: assignment.match.kickoff_at,
    }));
}

export async function getPeopleData(ctx: UserContext): Promise<PersonListItem[]> {
  void ctx;
  const now = new Date();
  // Bound the assignments read to matches that could still be current. The
  // count only cares about matches whose end is >= now; a 1-day lower bound on
  // kickoff safely covers any in-progress match without scanning all history.
  const windowStartIso = subDays(now, 1).toISOString();
  const [peopleData, assignmentsData, functionsData, rolesData] =
    await Promise.all([
      db.select(peopleColumns).from(peopleTable).orderBy(asc(peopleTable.fullName)),
      db
        .select({
          person_id: assignmentsTable.personId,
          match: {
            kickoff_at: matchesTable.kickoffAt,
            duration_minutes: matchesTable.durationMinutes,
          },
        })
        .from(assignmentsTable)
        .innerJoin(matchesTable, eq(assignmentsTable.matchId, matchesTable.id))
        .where(
          and(
            isNotNull(assignmentsTable.personId),
            gte(matchesTable.kickoffAt, windowStartIso),
          ),
        ),
      db
        .select({
          person_id: personFunctionsTable.personId,
          function_key: personFunctionsTable.functionKey,
        })
        .from(personFunctionsTable),
      db
        .select({ id: rolesTable.id, name: rolesTable.name })
        .from(rolesTable),
    ]);

  const functionsByPerson = new Map<string, PersonFunctionKey[]>();

  for (const row of functionsData) {
    if (!isPersonFunctionKey(row.function_key)) {
      continue;
    }

    const bucket = functionsByPerson.get(row.person_id) ?? [];
    bucket.push(row.function_key);
    functionsByPerson.set(row.person_id, bucket);
  }

  const roleNameById = new Map<string, string>();

  for (const role of rolesData) {
    roleNameById.set(role.id, role.name);
  }

  const currentCountByPerson = new Map<string, number>();

  for (const assignment of assignmentsData as PersonAssignmentSummary[]) {
    const personId = assignment.person_id;

    if (!personId || !assignment.match) {
      continue;
    }

    const end = parseISO(
      getMatchEndIso(
        assignment.match.kickoff_at,
        assignment.match.duration_minutes,
      ),
    );

    if (end >= now) {
      currentCountByPerson.set(personId, (currentCountByPerson.get(personId) ?? 0) + 1);
    }
  }

  return (peopleData as PersonRow[]).map((person) => {
    const currentAssignmentCount = currentCountByPerson.get(person.id) ?? 0;
    const primaryRole = person.role_id
      ? roleNameById.get(person.role_id) ?? null
      : null;

    const assignmentState = !person.active
      ? "Inactivo"
      : currentAssignmentCount > 0
        ? "En asignacion"
        : "Disponible";

    return {
      ...person,
      primary_role: primaryRole,
      assignment_state: assignmentState,
      current_assignment_count: currentAssignmentCount,
      functions: functionsByPerson.get(person.id) ?? [],
    };
  });
}

export async function getPeopleContactList(
  ctx: UserContext,
): Promise<TeamResponsiblePerson[]> {
  void ctx;
  const rows = await db
    .select({
      full_name: peopleTable.fullName,
      phone: peopleTable.phone,
      email: peopleTable.email,
      active: peopleTable.active,
      notes: peopleTable.notes,
    })
    .from(peopleTable)
    .orderBy(asc(peopleTable.fullName));

  return rows as TeamResponsiblePerson[];
}

export async function getRolesData(ctx: UserContext): Promise<{
  roles: RoleRow[];
  grouped: Array<{ category: string; roles: RoleRow[] }>;
}> {
  void ctx;
  const rows = await db
    .select(roleColumns)
    .from(rolesTable)
    .orderBy(asc(rolesTable.sortOrder));

  const roles = rows as RoleRow[];
  const grouped = ROLE_CATEGORY_ORDER.map((category) => ({
    category,
    roles: roles.filter((role) => role.category === category),
  })).filter((group) => group.roles.length > 0);

  return {
    roles,
    grouped,
  };
}
