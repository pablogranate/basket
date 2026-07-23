import { parseISO, addDays, subDays } from "date-fns";

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
import { createSupabaseServerClient } from "@/lib/supabase/server";
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

function normalizeGridAssignments(params: {
  matchId: string;
  roles: ActiveRole[];
  assignments: GridAssignment[];
}) {
  const assignmentMap = new Map(
    params.assignments.map((assignment) => [assignment.role_id, assignment]),
  );

  return params.roles.map((role) => {
    const existing = assignmentMap.get(role.id);

    if (existing) {
      return existing;
    }

    return {
      id: `${params.matchId}:${role.id}`,
      match_id: params.matchId,
      role_id: role.id,
      person_id: null,
      confirmed: false,
      attendance_confirmed_at: null,
      attendance_response: null,
      attendance_note: null,
      notes: null,
      role,
      person: null,
    };
  });
}

export async function getGridData(ctx: UserContext, filters: GridFilters) {
  void ctx;
  const supabase = await createSupabaseServerClient();
  const window = resolveDateWindow({
    view: filters.view,
    date: filters.date,
    timezone: filters.timezone,
  });

  let query = supabase
    .from("matches")
    .select(
      "*, owner:people!matches_owner_id_fkey(id, full_name, phone), assignments(id, match_id, role_id, person_id, confirmed, attendance_response, attendance_note, notes, role:roles!assignments_role_id_fkey(id, name, category, sort_order, active), person:people!assignments_person_id_fkey(id, full_name, phone, email))",
    )
    .gte("kickoff_at", window.startUtc)
    .lte("kickoff_at", window.endUtc)
    .order("kickoff_at", { ascending: true });

  if (filters.league) {
    query = query.eq("competition", filters.league);
  }

  if (filters.mode) {
    query = query.eq("production_mode", filters.mode);
  }

  if (filters.status) {
    query = query.eq("status", filters.status as MatchRow["status"]);
  }

  if (filters.owner) {
    query = query.eq("owner_id", filters.owner);
  }

  if (filters.q) {
    const term = filters.q.replaceAll(",", " ").trim();
    query = query.or(
      `home_team.ilike.%${term}%,away_team.ilike.%${term}%,competition.ilike.%${term}%`,
    );
  }

  const [
    { data: matchesData, error: matchesError },
    ownersResult,
    rolesResult,
    functionsResult,
  ] =
    await Promise.all([
      query,
      supabase
        .from("people")
        .select("id, full_name, phone, email")
        .eq("active", true)
        .order("full_name"),
      supabase
        .from("roles")
        .select("id, name, category, sort_order, active")
        .eq("active", true)
        .order("sort_order", { ascending: true }),
      supabase.from("person_functions").select("person_id, function_key"),
    ]);

  if (matchesError) {
    throw matchesError;
  }

  if (ownersResult.error) {
    throw ownersResult.error;
  }

  if (rolesResult.error) {
    throw rolesResult.error;
  }

  if (functionsResult.error) {
    throw functionsResult.error;
  }

  const functionsByPerson = new Map<string, PersonFunctionKey[]>();

  for (const row of functionsResult.data ?? []) {
    if (!isPersonFunctionKey(row.function_key)) {
      continue;
    }

    const bucket = functionsByPerson.get(row.person_id) ?? [];
    bucket.push(row.function_key);
    functionsByPerson.set(row.person_id, bucket);
  }

  const activeRoles = (rolesResult.data ?? []) as ActiveRole[];
  // Assignments are embedded in the matches query (one round-trip) instead of a
  // follow-up `.in("match_id", [...])`, which built a multi-KB URL on wide date
  // windows and stalled/failed. `assignments` is split off each row here.
  const baseMatches = (matchesData ?? []) as Array<
    Omit<MatchListItem, "assignments"> & { assignments: GridAssignment[] | null }
  >;

  const matches = baseMatches.map(({ assignments, ...match }) => ({
    ...match,
    assignments: normalizeGridAssignments({
      matchId: match.id,
      roles: activeRoles,
      assignments: assignments ?? [],
    }),
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
    (ownersResult.data ?? []) as Pick<
      PersonRow,
      "id" | "full_name" | "phone" | "email"
    >[]
  ).map((owner) => ({
    ...owner,
    functions: functionsByPerson.get(owner.id) ?? [],
  }));

  return {
    dayGroups,
    owners,
  };
}

export async function getMatchDetailData(ctx: UserContext, matchId: string) {
  void ctx;
  const supabase = await createSupabaseServerClient();

  const [
    matchResult,
    assignmentsResult,
    peopleResult,
    rolesResult,
    historyResult,
    functionsResult,
  ] = await Promise.all([
      supabase
        .from("matches")
        .select(
          "*, owner:people!matches_owner_id_fkey(id, full_name, phone, email)",
        )
        .eq("id", matchId)
        .single(),
      supabase
        .from("assignments")
        .select(
          "*, role:roles!assignments_role_id_fkey(id, name, category, sort_order, active), person:people!assignments_person_id_fkey(id, full_name, phone, email)",
        )
        .eq("match_id", matchId)
        .order("created_at", { ascending: true }),
      supabase
        .from("people")
        .select("id, full_name, phone, email, active")
        .eq("active", true)
        .order("full_name"),
      supabase
        .from("roles")
        .select("id, name, category, sort_order, active")
        .eq("active", true)
        .order("sort_order", { ascending: true }),
      supabase
        .from("audit_log")
        .select(
          "*, actor:profiles!audit_log_changed_by_fkey(id, full_name, role)",
        )
        .eq("match_id", matchId)
        .order("created_at", { ascending: false })
        .limit(30),
      supabase.from("person_functions").select("person_id, function_key"),
    ]);

  if (matchResult.error) {
    throw matchResult.error;
  }

  if (assignmentsResult.error) {
    throw assignmentsResult.error;
  }

  if (peopleResult.error) {
    throw peopleResult.error;
  }

  if (functionsResult.error) {
    throw functionsResult.error;
  }

  if (rolesResult.error) {
    throw rolesResult.error;
  }

  if (historyResult.error) {
    throw historyResult.error;
  }

  const functionsByPerson = new Map<string, PersonFunctionKey[]>();

  for (const row of functionsResult.data ?? []) {
    if (!isPersonFunctionKey(row.function_key)) {
      continue;
    }

    const bucket = functionsByPerson.get(row.person_id) ?? [];
    bucket.push(row.function_key);
    functionsByPerson.set(row.person_id, bucket);
  }

  const roles = (rolesResult.data ?? []) as Pick<
    RoleRow,
    "id" | "name" | "category" | "sort_order" | "active"
  >[];
  const rawAssignments = (assignmentsResult.data ?? []) as MatchDetail["assignments"];
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
    ...(matchResult.data as MatchDetail),
    assignments: normalizedAssignments,
  };

  const conflicts = await getAssignmentConflicts({
    match,
    assignments: normalizedAssignments as MatchDetail["assignments"],
  });

  return {
    match,
    people: (
      (peopleResult.data ?? []) as Pick<
        PersonRow,
        "id" | "full_name" | "phone" | "email" | "active"
      >[]
    ).map((person) => ({
      ...person,
      functions: functionsByPerson.get(person.id) ?? [],
    })),
    roles,
    history: (historyResult.data ?? []) as AuditEntry[],
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

  const supabase = await createSupabaseServerClient();

  // Single round-trip: the date-window filter runs on the embedded match via
  // !inner, replacing the previous matches-in-window pre-query whose ids fed
  // a second, serialized assignments query.
  const result = await supabase
    .from("assignments")
    .select(
      "id, person_id, role_id, match_id, role:roles!assignments_role_id_fkey(id, name, category, sort_order, active), person:people!assignments_person_id_fkey(id, full_name, phone, email), match:matches!assignments_match_id_fkey!inner(id, home_team, away_team, kickoff_at, duration_minutes, timezone)",
    )
    .in("person_id", personIds)
    .neq("match_id", params.match.id)
    .gte("match.kickoff_at", windowStart)
    .lte("match.kickoff_at", windowEnd);

  if (result.error) {
    throw result.error;
  }

  const overlappingAssignments = (result.data ?? []) as Array<{
    person_id: string | null;
    role: { name: string } | null;
    person: { full_name: string | null } | null;
    match: {
      id: string;
      home_team: string;
      away_team: string;
      kickoff_at: string;
      duration_minutes: number;
      timezone: string;
    };
  }>;

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
  const supabase = await createSupabaseServerClient();
  const now = new Date();
  // Bound the assignments read to matches that could still be current. The
  // count only cares about matches whose end is >= now; a 1-day lower bound on
  // kickoff safely covers any in-progress match without scanning all history.
  const windowStartIso = subDays(now, 1).toISOString();
  const [peopleResult, assignmentsResult, functionsResult, rolesResult] =
    await Promise.all([
      supabase.from("people").select("*").order("full_name"),
      supabase
        .from("assignments")
        .select(
          "person_id, match:matches!assignments_match_id_fkey!inner(kickoff_at, duration_minutes)",
        )
        .not("person_id", "is", null)
        .gte("match.kickoff_at", windowStartIso),
      supabase.from("person_functions").select("person_id, function_key"),
      supabase.from("roles").select("id, name"),
    ]);

  if (peopleResult.error) {
    throw peopleResult.error;
  }

  if (assignmentsResult.error) {
    throw assignmentsResult.error;
  }

  if (functionsResult.error) {
    throw functionsResult.error;
  }

  if (rolesResult.error) {
    throw rolesResult.error;
  }

  const functionsByPerson = new Map<string, PersonFunctionKey[]>();

  for (const row of functionsResult.data ?? []) {
    if (!isPersonFunctionKey(row.function_key)) {
      continue;
    }

    const bucket = functionsByPerson.get(row.person_id) ?? [];
    bucket.push(row.function_key);
    functionsByPerson.set(row.person_id, bucket);
  }

  const roleNameById = new Map<string, string>();

  for (const role of rolesResult.data ?? []) {
    roleNameById.set(role.id, role.name);
  }

  const currentCountByPerson = new Map<string, number>();

  for (const assignment of (assignmentsResult.data ?? []) as PersonAssignmentSummary[]) {
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

  return ((peopleResult.data ?? []) as PersonRow[]).map((person) => {
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
      teams: [],
    };
  });
}

export async function getPeopleContactList(
  ctx: UserContext,
): Promise<TeamResponsiblePerson[]> {
  void ctx;
  const supabase = await createSupabaseServerClient();
  const result = await supabase
    .from("people")
    .select("full_name, phone, email, active, notes")
    .order("full_name");

  if (result.error) {
    throw result.error;
  }

  return (result.data ?? []) as TeamResponsiblePerson[];
}

export async function getRolesData(ctx: UserContext): Promise<{
  roles: RoleRow[];
  grouped: Array<{ category: string; roles: RoleRow[] }>;
}> {
  void ctx;
  const supabase = await createSupabaseServerClient();
  const result = await supabase
    .from("roles")
    .select("*")
    .order("sort_order");

  if (result.error) {
    throw result.error;
  }

  const roles = (result.data ?? []) as RoleRow[];
  const grouped = ROLE_CATEGORY_ORDER.map((category) => ({
    category,
    roles: roles.filter((role) => role.category === category),
  })).filter((group) => group.roles.length > 0);

  return {
    roles,
    grouped,
  };
}
