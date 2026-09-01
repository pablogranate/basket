import { formatMatchTime, toDateKey } from "@/lib/date";
import { getRoleDisplayName } from "@/lib/display";
import type { MatchListItem } from "@/lib/types";

export type InsightsTopPerson = {
  id: string;
  fullName: string;
  totalMatches: number;
  roleLabel: string;
};

export type ProductionInsightsSummary = {
  // Count for the focus scope (today when the window contains today, else the
  // whole window) plus the full window count, so the panel can read
  // "2 hoy · 56 en el mes" instead of labelling the month total as today's.
  focus: {
    scope: "today" | "day" | "month";
    matches: number;
  };
  totalMatches: number;
  activeLeagues: number;
  startWindow: string;
  endWindow: string;
  assignedPeopleCount: number;
  topPeople: InsightsTopPerson[];
  missing: {
    venue: number;
    responsible: number;
    productionCode: number;
  };
  ready: {
    productionCode: number;
    venue: number;
  };
};

function buildTopPeople(matches: MatchListItem[]): InsightsTopPerson[] {
  const peopleMap = new Map<
    string,
    {
      id: string;
      fullName: string;
      matchIds: Set<string>;
      roleCounts: Map<string, number>;
    }
  >();

  matches.forEach((match) => {
    match.assignments.forEach((assignment) => {
      if (!assignment.person) {
        return;
      }

      const key = assignment.person.id;
      const current = peopleMap.get(key) ?? {
        id: assignment.person.id,
        fullName: assignment.person.full_name,
        matchIds: new Set<string>(),
        roleCounts: new Map<string, number>(),
      };

      current.matchIds.add(match.id);
      current.roleCounts.set(
        assignment.role.name,
        (current.roleCounts.get(assignment.role.name) ?? 0) + 1,
      );
      peopleMap.set(key, current);
    });
  });

  return [...peopleMap.values()]
    .map((person) => {
      const primaryRole =
        [...person.roleCounts.entries()].sort((left, right) => {
          if (right[1] !== left[1]) {
            return right[1] - left[1];
          }

          return left[0].localeCompare(right[0], "es");
        })[0]?.[0] ?? null;

      return {
        id: person.id,
        fullName: person.fullName,
        totalMatches: person.matchIds.size,
        roleLabel: getRoleDisplayName(primaryRole),
      };
    })
    .sort((left, right) => {
      if (right.totalMatches !== left.totalMatches) {
        return right.totalMatches - left.totalMatches;
      }

      return left.fullName.localeCompare(right.fullName, "es");
    })
    .slice(0, 10);
}

function countAssignedPeople(matches: MatchListItem[]) {
  return new Set(
    matches.flatMap((match) =>
      match.assignments
        .map((assignment) => assignment.person?.id)
        .filter((value): value is string => Boolean(value)),
    ),
  ).size;
}

function resolveFocusMatches(
  matches: MatchListItem[],
  options: { view: "day" | "month"; date: string; timezone: string },
) {
  const todayKey = toDateKey(new Date().toISOString(), options.timezone);

  if (options.view === "day") {
    return {
      scope: options.date === todayKey ? ("today" as const) : ("day" as const),
      matches,
    };
  }

  if (!todayKey.startsWith(options.date)) {
    return { scope: "month" as const, matches };
  }

  return {
    scope: "today" as const,
    matches: matches.filter(
      (match) => toDateKey(match.kickoff_at, match.timezone || options.timezone) === todayKey,
    ),
  };
}

// Server-side aggregation of everything ProductionInsightsPanel renders. The
// panel used to derive all of this from the full match list passed as a client
// prop; computing it here keeps the assignment graph out of the RSC payload.
export function buildProductionInsightsSummary(
  matches: MatchListItem[],
  options: { view: "day" | "month"; date: string; timezone: string },
): ProductionInsightsSummary {
  const { timezone } = options;
  const focus = resolveFocusMatches(matches, options);
  const activeLeagues = new Set(
    matches
      .map((match) => match.competition?.trim())
      .filter((value): value is string => Boolean(value)),
  ).size;

  // Operational hours only mean something within a single day, so they follow
  // the focus scope (today's matches in the current month, the day otherwise).
  const windowMatches = focus.scope === "month" ? [] : focus.matches;
  const firstMatch = windowMatches[0];
  const lastMatch = windowMatches.at(-1);
  const startWindow = firstMatch
    ? formatMatchTime(firstMatch.kickoff_at, firstMatch.timezone || timezone)
    : "--:--";
  const endWindow = lastMatch
    ? formatMatchTime(lastMatch.kickoff_at, lastMatch.timezone || timezone)
    : "--:--";

  return {
    focus: { scope: focus.scope, matches: focus.matches.length },
    totalMatches: matches.length,
    activeLeagues,
    startWindow,
    endWindow,
    assignedPeopleCount: countAssignedPeople(matches),
    topPeople: buildTopPeople(matches),
    missing: {
      venue: matches.filter((match) => !match.venue?.trim()).length,
      responsible: matches.filter(
        (match) =>
          !match.assignments.some(
            (assignment) =>
              assignment.role.name === "Responsable" && assignment.person,
          ),
      ).length,
      productionCode: matches.filter((match) => !match.production_code?.trim())
        .length,
    },
    ready: {
      productionCode: matches.filter((match) => match.production_code?.trim())
        .length,
      venue: matches.filter((match) => match.venue?.trim()).length,
    },
  };
}
