import { ROLE_CATEGORY_ORDER } from "@/lib/constants";

// Input rows for the statistics seam: the route handler fetches matches in
// range with their assignment slots and maps them into this shape. Every
// counting rule lives behind `buildGridReportSummary` (see CONTEXT.md:
// "Asignación contada", "Veces asignada").
export type ReportAssignmentRow = {
  personId: string | null;
  personName: string | null;
  roleName: string;
  roleCategory: string;
  roleSortOrder: number;
};

export type ReportMatchRow = {
  id: string;
  homeTeam: string;
  awayTeam: string;
  productionMode: string | null;
  assignments: ReportAssignmentRow[];
};

export type ReportRoleCount = {
  name: string;
  count: number;
};

export type ReportCategoryCount = {
  category: string;
  total: number;
  roles: ReportRoleCount[];
};

export type ReportPersonCount = {
  id: string;
  fullName: string;
  matchCount: number;
  assignmentCount: number;
  roles: string[];
};

export type ReportTeamCount = {
  team: string;
  local: number;
  visitante: number;
  total: number;
};

export type ReportProductionCount = {
  mode: string;
  count: number;
};

export const UNSPECIFIED_PRODUCTION_MODE = "Sin especificar";

export type GridReportSummary = {
  matchCount: number;
  funciones: {
    total: number;
    categories: ReportCategoryCount[];
  };
  personas: ReportPersonCount[];
  equipos: ReportTeamCount[];
  produccion: ReportProductionCount[];
};

// A slot only counts when a person fills it; `confirmed` and match status are
// deliberately ignored (attendance workflow, not assignment fact).
function countedAssignments(match: ReportMatchRow) {
  return match.assignments.filter((assignment) => assignment.personId);
}

function categoryRank(category: string) {
  const index = (ROLE_CATEGORY_ORDER as ReadonlyArray<string>).indexOf(
    category,
  );
  return index === -1 ? ROLE_CATEGORY_ORDER.length : index;
}

function buildFunciones(matches: ReportMatchRow[]) {
  const roleMap = new Map<
    string,
    { name: string; category: string; sortOrder: number; count: number }
  >();

  matches.forEach((match) => {
    countedAssignments(match).forEach((assignment) => {
      const current = roleMap.get(assignment.roleName) ?? {
        name: assignment.roleName,
        category: assignment.roleCategory,
        sortOrder: assignment.roleSortOrder,
        count: 0,
      };

      current.count += 1;
      roleMap.set(assignment.roleName, current);
    });
  });

  const categoryMap = new Map<string, ReportCategoryCount>();

  [...roleMap.values()]
    .sort((left, right) => {
      const rankDiff = categoryRank(left.category) - categoryRank(right.category);
      if (rankDiff !== 0) {
        return rankDiff;
      }

      if (left.sortOrder !== right.sortOrder) {
        return left.sortOrder - right.sortOrder;
      }

      return left.name.localeCompare(right.name, "es");
    })
    .forEach((role) => {
      const bucket = categoryMap.get(role.category) ?? {
        category: role.category,
        total: 0,
        roles: [],
      };

      bucket.total += role.count;
      bucket.roles.push({ name: role.name, count: role.count });
      categoryMap.set(role.category, bucket);
    });

  const categories = [...categoryMap.values()];

  return {
    total: categories.reduce((sum, category) => sum + category.total, 0),
    categories,
  };
}

// "Veces asignada" = distinct matches; the raw slot count rides alongside so a
// person covering two roles in one match is distinguishable from two matches.
function buildPersonas(matches: ReportMatchRow[]): ReportPersonCount[] {
  const personMap = new Map<
    string,
    {
      id: string;
      fullName: string;
      matchIds: Set<string>;
      assignmentCount: number;
      roleSortOrders: Map<string, number>;
    }
  >();

  matches.forEach((match) => {
    countedAssignments(match).forEach((slot) => {
      if (!slot.personId) {
        return;
      }

      const current = personMap.get(slot.personId) ?? {
        id: slot.personId,
        fullName: slot.personName ?? "Sin nombre",
        matchIds: new Set<string>(),
        assignmentCount: 0,
        roleSortOrders: new Map<string, number>(),
      };

      current.matchIds.add(match.id);
      current.assignmentCount += 1;
      current.roleSortOrders.set(slot.roleName, slot.roleSortOrder);
      personMap.set(slot.personId, current);
    });
  });

  return [...personMap.values()]
    .map((person) => ({
      id: person.id,
      fullName: person.fullName,
      matchCount: person.matchIds.size,
      assignmentCount: person.assignmentCount,
      roles: [...person.roleSortOrders.entries()]
        .sort((left, right) => left[1] - right[1])
        .map(([name]) => name),
    }))
    .sort((left, right) => {
      if (right.matchCount !== left.matchCount) {
        return right.matchCount - left.matchCount;
      }

      return left.fullName.localeCompare(right.fullName, "es");
    });
}

// Teams are grouped by the free-text name exactly as stored (sheet Local /
// Visitante columns are the source of truth); identity normalization is out of
// scope here.
function buildEquipos(matches: ReportMatchRow[]): ReportTeamCount[] {
  const teamMap = new Map<string, ReportTeamCount>();

  function bucket(team: string) {
    const name = team.trim();
    const current = teamMap.get(name) ?? {
      team: name,
      local: 0,
      visitante: 0,
      total: 0,
    };
    teamMap.set(name, current);
    return current;
  }

  matches.forEach((match) => {
    if (match.homeTeam.trim()) {
      const home = bucket(match.homeTeam);
      home.local += 1;
      home.total += 1;
    }

    if (match.awayTeam.trim()) {
      const away = bucket(match.awayTeam);
      away.visitante += 1;
      away.total += 1;
    }
  });

  return [...teamMap.values()].sort((left, right) => {
    if (right.total !== left.total) {
      return right.total - left.total;
    }

    return left.team.localeCompare(right.team, "es");
  });
}

function buildProduccion(matches: ReportMatchRow[]): ReportProductionCount[] {
  const modeMap = new Map<string, number>();

  matches.forEach((match) => {
    const mode = match.productionMode?.trim() || UNSPECIFIED_PRODUCTION_MODE;
    modeMap.set(mode, (modeMap.get(mode) ?? 0) + 1);
  });

  return [...modeMap.entries()]
    .map(([mode, count]) => ({ mode, count }))
    .sort((left, right) => {
      if (right.count !== left.count) {
        return right.count - left.count;
      }

      return left.mode.localeCompare(right.mode, "es");
    });
}

export function buildGridReportSummary(
  matches: ReportMatchRow[],
): GridReportSummary {
  return {
    matchCount: matches.length,
    funciones: buildFunciones(matches),
    personas: buildPersonas(matches),
    equipos: buildEquipos(matches),
    produccion: buildProduccion(matches),
  };
}
