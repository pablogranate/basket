import { parseISO, addDays, subDays } from "date-fns";

import { PRODUCTION_MODE_OPTIONS, ROLE_CATEGORY_ORDER } from "@/lib/constants";
import {
  getMatchEndIso,
  resolveDateWindow,
  toDateKey,
} from "@/lib/date";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { MatchRow, PersonRow, RoleRow } from "@/lib/database.types";
import type {
  AuditEntry,
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

export type GridCalendarDaySummary = {
  date: string;
  total: number;
  competitions: Record<string, number>;
};

type ActiveRole = Pick<
  RoleRow,
  "id" | "name" | "category" | "sort_order" | "active"
>;

type GridAssignment = MatchListItem["assignments"][number];
type PersonAssignmentSummary = {
  person_id: string | null;
  updated_at: string;
  role: { name: string; sort_order: number } | null;
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
      notes: null,
      role,
      person: null,
    };
  });
}

export async function getGridData(filters: GridFilters) {
  const supabase = await createSupabaseServerClient();
  const window = resolveDateWindow({
    view: filters.view,
    date: filters.date,
    timezone: filters.timezone,
  });

  let query = supabase
    .from("matches")
    .select(
      "*, owner:people!matches_owner_id_fkey(id, full_name, phone)",
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
    optionsResult,
    ownersResult,
    rolesResult,
  ] =
    await Promise.all([
      query,
      supabase
        .from("matches")
        .select("competition")
        .gte("kickoff_at", new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString())
        .order("kickoff_at", { ascending: false }),
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
    ]);

  if (matchesError) {
    throw matchesError;
  }

  if (optionsResult.error) {
    throw optionsResult.error;
  }

  if (ownersResult.error) {
    throw ownersResult.error;
  }

  if (rolesResult.error) {
    throw rolesResult.error;
  }

  const activeRoles = (rolesResult.data ?? []) as ActiveRole[];
  const baseMatches = (matchesData ?? []) as Array<
    Omit<MatchListItem, "assignments">
  >;
  const matchIds = baseMatches.map((match) => match.id);

  let assignmentsData: GridAssignment[] = [];

  if (matchIds.length) {
    const assignmentsResult = await supabase
      .from("assignments")
      .select(
        "id, match_id, role_id, person_id, confirmed, notes, role:roles!assignments_role_id_fkey(id, name, category, sort_order, active), person:people!assignments_person_id_fkey(id, full_name, phone, email)",
      )
      .in("match_id", matchIds);

    if (assignmentsResult.error) {
      throw assignmentsResult.error;
    }

    assignmentsData = (assignmentsResult.data ?? []) as GridAssignment[];
  }

  const assignmentsByMatch = assignmentsData.reduce<Map<string, GridAssignment[]>>(
    (map, assignment) => {
      const existing = map.get(assignment.match_id) ?? [];
      existing.push(assignment);
      map.set(assignment.match_id, existing);
      return map;
    },
    new Map(),
  );

  const matches = baseMatches.map((match) => ({
    ...match,
    assignments: normalizeGridAssignments({
      matchId: match.id,
      roles: activeRoles,
      assignments: assignmentsByMatch.get(match.id) ?? [],
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

  const optionRows = optionsResult.data ?? [];
  const leagueOptions = [
    ...new Set(
      optionRows
        .map((row) => row.competition)
        .filter((value): value is string => Boolean(value)),
    ),
  ];
  const modeOptions = [
    ...PRODUCTION_MODE_OPTIONS,
  ];

  return {
    dayGroups,
    owners: (ownersResult.data ?? []) as Pick<PersonRow, "id" | "full_name" | "phone" | "email">[],
    leagueOptions,
    modeOptions,
  };
}

export async function getGridCalendarData({
  month,
  q,
  league,
  mode,
  status,
  owner,
  timezone,
}: Pick<GridFilters, "q" | "league" | "mode" | "status" | "owner" | "timezone"> & {
  month: string;
}) {
  const supabase = await createSupabaseServerClient();
  const window = resolveDateWindow({
    view: "month",
    date: month,
    timezone,
  });

  let query = supabase
    .from("matches")
    .select("kickoff_at, timezone, production_mode, competition, home_team, away_team, status, owner_id")
    .gte("kickoff_at", window.startUtc)
    .lte("kickoff_at", window.endUtc)
    .order("kickoff_at", { ascending: true });

  if (league) {
    query = query.eq("competition", league);
  }

  if (mode) {
    query = query.eq("production_mode", mode);
  }

  if (status) {
    query = query.eq("status", status as MatchRow["status"]);
  }

  if (owner) {
    query = query.eq("owner_id", owner);
  }

  if (q) {
    const term = q.replaceAll(",", " ").trim();
    query = query.or(
      `home_team.ilike.%${term}%,away_team.ilike.%${term}%,competition.ilike.%${term}%`,
    );
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  const matches = (data ?? []) as Array<
    Pick<
      MatchRow,
      | "kickoff_at"
      | "timezone"
      | "production_mode"
      | "competition"
      | "home_team"
      | "away_team"
      | "status"
      | "owner_id"
    >
  >;

  const byDay = matches.reduce<Map<string, GridCalendarDaySummary>>((map, match) => {
    const dateKey = toDateKey(match.kickoff_at, match.timezone ?? timezone);
    const existing = map.get(dateKey) ?? {
      date: dateKey,
      total: 0,
      competitions: {},
    };

    existing.total += 1;

    const competitionKey = match.competition?.trim() || "Sin liga";
    existing.competitions[competitionKey] =
      (existing.competitions[competitionKey] ?? 0) + 1;

    map.set(dateKey, existing);
    return map;
  }, new Map());

  return Array.from(byDay.values()).sort((left, right) =>
    left.date.localeCompare(right.date),
  );
}

export async function getMatchDetailData(matchId: string) {
  const supabase = await createSupabaseServerClient();

  const [matchResult, assignmentsResult, peopleResult, rolesResult, historyResult] =
    await Promise.all([
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

  if (rolesResult.error) {
    throw rolesResult.error;
  }

  if (historyResult.error) {
    throw historyResult.error;
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
    people: (peopleResult.data ?? []) as Pick<
      PersonRow,
      "id" | "full_name" | "phone" | "email" | "active"
    >[],
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

  const matchesInWindow = await supabase
    .from("matches")
    .select("id")
    .gte("kickoff_at", windowStart)
    .lte("kickoff_at", windowEnd)
    .neq("id", params.match.id);

  if (matchesInWindow.error) {
    throw matchesInWindow.error;
  }

  const nearbyMatchIds = (matchesInWindow.data ?? []).map((m) => m.id);
  if (!nearbyMatchIds.length) {
    return [];
  }

  const result = await supabase
    .from("assignments")
    .select(
      "id, person_id, role_id, match_id, role:roles!assignments_role_id_fkey(id, name, category, sort_order, active), person:people!assignments_person_id_fkey(id, full_name, phone, email), match:matches!assignments_match_id_fkey(id, home_team, away_team, kickoff_at, duration_minutes, timezone)",
    )
    .in("person_id", personIds)
    .in("match_id", nearbyMatchIds);

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

export async function getPeopleData(): Promise<PersonListItem[]> {
  const supabase = await createSupabaseServerClient();
  const [peopleResult, assignmentsResult] = await Promise.all([
    supabase
      .from("people")
      .select("*")
      .order("full_name"),
    supabase
      .from("assignments")
      .select(
        "person_id, updated_at, role:roles!assignments_role_id_fkey(name, sort_order), match:matches!assignments_match_id_fkey(kickoff_at, duration_minutes)",
      )
      .not("person_id", "is", null),
  ]);

  if (peopleResult.error) {
    throw peopleResult.error;
  }

  if (assignmentsResult.error) {
    throw assignmentsResult.error;
  }

  const now = new Date();
  const assignmentRows = (assignmentsResult.data ?? []) as PersonAssignmentSummary[];
  const assignmentsByPerson = new Map<
    string,
    Array<{
      updated_at: string;
      role: { name: string; sort_order: number } | null;
      match: { kickoff_at: string; duration_minutes: number } | null;
    }>
  >();

  for (const assignment of assignmentRows) {
    const personId = assignment.person_id;

    if (!personId) {
      continue;
    }

    const bucket = assignmentsByPerson.get(personId) ?? [];
    bucket.push({
      updated_at: assignment.updated_at,
      role: assignment.role,
      match: assignment.match,
    });
    assignmentsByPerson.set(personId, bucket);
  }

  return ((peopleResult.data ?? []) as PersonRow[]).map((person) => {
    const assignments = (assignmentsByPerson.get(person.id) ?? []).sort((left, right) => {
      const leftRole = left.role?.sort_order ?? Number.MAX_SAFE_INTEGER;
      const rightRole = right.role?.sort_order ?? Number.MAX_SAFE_INTEGER;

      if (leftRole !== rightRole) {
        return leftRole - rightRole;
      }

      return right.updated_at.localeCompare(left.updated_at);
    });

    const primaryRole = assignments.find((assignment) => assignment.role?.name)?.role?.name ?? null;
    const currentAssignmentCount = assignments.filter((assignment) => {
      if (!assignment.match) {
        return false;
      }

      const end = parseISO(
        getMatchEndIso(
          assignment.match.kickoff_at,
          assignment.match.duration_minutes,
        ),
      );

      return end >= now;
    }).length;

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
    };
  });
}

export async function getRolesData(): Promise<{
  roles: RoleRow[];
  grouped: Array<{ category: string; roles: RoleRow[] }>;
}> {
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
