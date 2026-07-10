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

export type GridReportSummary = {
  matchCount: number;
  funciones: {
    total: number;
    categories: ReportCategoryCount[];
  };
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

export function buildGridReportSummary(
  matches: ReportMatchRow[],
): GridReportSummary {
  return {
    matchCount: matches.length,
    funciones: buildFunciones(matches),
  };
}
