import { ROLE_CATEGORY_ORDER, ROLE_SEED } from "@/lib/constants";

// Canonical role order (Coordinación → Cámaras) used to sort the per-role
// "Funciones" filter facet so options keep a stable, meaningful order.
const ROLE_SORT_BY_NAME = new Map<string, number>(
  ROLE_SEED.map((role) => [role.name, role.sortOrder]),
);

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
  kickoffAt: string;
  competition: string | null;
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

export type ReportPersonMatch = {
  id: string;
  kickoffAt: string;
  homeTeam: string;
  awayTeam: string;
  productionMode: string | null;
  roles: string[];
};

export type ReportPersonDetail = {
  id: string;
  fullName: string;
  matchCount: number;
  assignmentCount: number;
  matches: ReportPersonMatch[];
};

export const UNSPECIFIED_PRODUCTION_MODE = "Sin especificar";
export const UNSPECIFIED_COMPETITION = "Sin especificar";

// The four filter dimensions. OR within a dimension, AND across dimensions,
// empty dimension = no filter. See the handoff §4 for the locked semantics.
export type ReportFilters = {
  ligas: string[];
  teams: string[];
  modes: string[];
  roles: string[];
};

export type FacetOption = {
  value: string;
  count: number;
};

export type ReportFacetCounts = {
  ligas: FacetOption[];
  teams: FacetOption[];
  modes: FacetOption[];
  roles: FacetOption[];
};

export const EMPTY_REPORT_FILTERS: ReportFilters = {
  ligas: [],
  teams: [],
  modes: [],
  roles: [],
};

type FilterDimension = keyof ReportFilters;

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

// Per-person detail: every match the person filled a slot in, with the roles
// they covered in that match. Roles ordered by their slot sort order to match
// the aggregate Personas view. Returns null when the person has no counted
// assignments in range.
export function buildPersonDetail(
  matches: ReportMatchRow[],
  personId: string,
): ReportPersonDetail | null {
  let fullName: string | null = null;
  let assignmentCount = 0;
  const personMatches: ReportPersonMatch[] = [];

  matches.forEach((match) => {
    const slots = countedAssignments(match).filter(
      (slot) => slot.personId === personId,
    );

    if (!slots.length) {
      return;
    }

    if (!fullName) {
      fullName = slots[0].personName ?? "Sin nombre";
    }

    assignmentCount += slots.length;

    const roles = slots
      .slice()
      .sort((left, right) => left.roleSortOrder - right.roleSortOrder)
      .map((slot) => slot.roleName);

    personMatches.push({
      id: match.id,
      kickoffAt: match.kickoffAt,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      productionMode: match.productionMode,
      roles,
    });
  });

  if (!personMatches.length) {
    return null;
  }

  personMatches.sort((left, right) =>
    left.kickoffAt.localeCompare(right.kickoffAt),
  );

  return {
    id: personId,
    fullName: fullName ?? "Sin nombre",
    matchCount: personMatches.length,
    assignmentCount,
    matches: personMatches,
  };
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

function matchCompetition(match: ReportMatchRow) {
  return match.competition?.trim() || UNSPECIFIED_COMPETITION;
}

function matchMode(match: ReportMatchRow) {
  return match.productionMode?.trim() || UNSPECIFIED_PRODUCTION_MODE;
}

function matchTeams(match: ReportMatchRow) {
  const teams = new Set<string>();
  const home = match.homeTeam.trim();
  const away = match.awayTeam.trim();
  if (home) {
    teams.add(home);
  }
  if (away) {
    teams.add(away);
  }
  return teams;
}

// Roles a match actually *used* — only slots a person filled count, so a
// función filter reflects who was on camera, not which slots were drawn up.
function matchRoles(match: ReportMatchRow) {
  return new Set(countedAssignments(match).map((slot) => slot.roleName));
}

function dimensionValues(match: ReportMatchRow, dim: FilterDimension): string[] {
  if (dim === "ligas") {
    return [matchCompetition(match)];
  }
  if (dim === "modes") {
    return [matchMode(match)];
  }
  if (dim === "teams") {
    return [...matchTeams(match)];
  }
  return [...matchRoles(match)];
}

// Applies the locked filter semantics (handoff §4): OR within a dimension, AND
// across dimensions, empty dimension = no filter, team by involvement (home OR
// away). When roles are selected the match survives only if it used one of
// them, and its assignments are narrowed to those roles so every downstream
// count (Personas, Funciones) reflects the coherent-world model.
export function filterMatches(
  rows: ReportMatchRow[],
  filters: ReportFilters,
): ReportMatchRow[] {
  const ligaSet = new Set(filters.ligas);
  const teamSet = new Set(filters.teams);
  const modeSet = new Set(filters.modes);
  const roleSet = new Set(filters.roles);

  const result: ReportMatchRow[] = [];

  for (const match of rows) {
    if (ligaSet.size && !ligaSet.has(matchCompetition(match))) {
      continue;
    }

    if (teamSet.size && ![...matchTeams(match)].some((team) => teamSet.has(team))) {
      continue;
    }

    if (modeSet.size && !modeSet.has(matchMode(match))) {
      continue;
    }

    if (roleSet.size) {
      const inRole = countedAssignments(match).some((slot) =>
        roleSet.has(slot.roleName),
      );
      if (!inRole) {
        continue;
      }

      result.push({
        ...match,
        assignments: match.assignments.filter((slot) =>
          roleSet.has(slot.roleName),
        ),
      });
      continue;
    }

    result.push(match);
  }

  return result;
}

function tallyDimension(matches: ReportMatchRow[], dim: FilterDimension) {
  const counts = new Map<string, number>();
  matches.forEach((match) => {
    new Set(dimensionValues(match, dim)).forEach((value) => {
      counts.set(value, (counts.get(value) ?? 0) + 1);
    });
  });
  return counts;
}

function sortFacetOptions(
  options: FacetOption[],
  dim: FilterDimension,
  weights: Map<string, number>,
): FacetOption[] {
  const byWeight = (left: FacetOption, right: FacetOption) => {
    const leftWeight = weights.get(left.value) ?? 0;
    const rightWeight = weights.get(right.value) ?? 0;
    if (leftWeight !== rightWeight) {
      return rightWeight - leftWeight;
    }
    return left.value.localeCompare(right.value, "es");
  };

  if (dim === "roles") {
    const roleRank = (name: string) =>
      ROLE_SORT_BY_NAME.get(name) ?? Number.MAX_SAFE_INTEGER;
    return options.sort((left, right) => {
      const rankDiff = roleRank(left.value) - roleRank(right.value);
      if (rankDiff !== 0) {
        return rankDiff;
      }
      return left.value.localeCompare(right.value, "es");
    });
  }

  const unspecified =
    dim === "ligas"
      ? UNSPECIFIED_COMPETITION
      : dim === "modes"
        ? UNSPECIFIED_PRODUCTION_MODE
        : null;

  if (unspecified) {
    return options.sort((left, right) => {
      const leftUnspecified = left.value === unspecified ? 1 : 0;
      const rightUnspecified = right.value === unspecified ? 1 : 0;
      if (leftUnspecified !== rightUnspecified) {
        return leftUnspecified - rightUnspecified;
      }
      return byWeight(left, right);
    });
  }

  return options.sort(byWeight);
}

function facetForDimension(
  rows: ReportMatchRow[],
  filters: ReportFilters,
  dim: FilterDimension,
): FacetOption[] {
  // Standard faceted count: this dimension cleared, the others still applied.
  const base = filterMatches(rows, { ...filters, [dim]: [] });
  const facetCounts = tallyDimension(base, dim);
  // The option universe and stable order come from the full dataset, so options
  // never appear or reorder as filters change — zero-count ones just dim out.
  const weights = tallyDimension(rows, dim);

  const options = [...weights.keys()].map((value) => ({
    value,
    count: facetCounts.get(value) ?? 0,
  }));

  return sortFacetOptions(options, dim, weights);
}

// Faceted option counts for every dimension (handoff §4): each option's count
// is computed with its own dimension cleared but the others applied.
export function buildFacetCounts(
  rows: ReportMatchRow[],
  filters: ReportFilters,
): ReportFacetCounts {
  return {
    ligas: facetForDimension(rows, filters, "ligas"),
    teams: facetForDimension(rows, filters, "teams"),
    modes: facetForDimension(rows, filters, "modes"),
    roles: facetForDimension(rows, filters, "roles"),
  };
}
