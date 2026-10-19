import {
  getAssignmentStateDisplayName,
  getFunctionDisplayName,
  getPortalAccessDisplayName,
} from "@/lib/display";
import { PERSON_FUNCTIONS } from "@/lib/functions";
import { parsePersonNotesMeta } from "@/lib/people-notes";
import { ACCESS_TIER_OPTIONS, isAppRole } from "@/lib/roles";
import { personCoverageNames } from "@/lib/team-responsibles";
import type { PersonListItem } from "@/lib/types";
import { normalizeText } from "@/lib/utils";

export type PeopleFilters = {
  role: string;
  access: string;
  city: string;
  team: string;
};

export const EMPTY_PEOPLE_FILTERS: PeopleFilters = {
  role: "",
  access: "",
  city: "",
  team: "",
};

// Acceso options: any portal role, one role, or one of the no-login states.
// "desconocido" is not offered: it only means the Auth DB was down.
export const ACCESS_ANY_ROLE = "con-acceso";

export const ACCESS_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: ACCESS_ANY_ROLE, label: "Con acceso (cualquier nivel)" },
  ...[...ACCESS_TIER_OPTIONS].reverse(),
  { value: "revocado", label: getPortalAccessDisplayName("revocado") },
  { value: "sin-cuenta", label: getPortalAccessDisplayName("sin-cuenta") },
];

const ACCESS_FILTER_ALLOWED = ACCESS_FILTER_OPTIONS.map(({ value }) => value);

// Sentinel option matching people whose role/city/team field is blank.
export const UNASSIGNED_OPTION = "(Sin asignar)";

export type PeopleFilterOptions = {
  roles: { value: string; label: string }[];
  cities: string[];
  teams: string[];
};

type RawSearchParams =
  | Record<string, string | string[] | undefined>
  | URLSearchParams;

function getParam(params: RawSearchParams, key: string): string {
  const raw =
    params instanceof URLSearchParams
      ? params.get(key) ?? ""
      : Array.isArray(params[key])
        ? params[key]?.[0] ?? ""
        : (params[key] as string | undefined) ?? "";
  return raw.trim();
}

function pickEnum(value: string, allowed: readonly string[]): string {
  return allowed.includes(value) ? value : "";
}

export function parsePeopleFilters(params: RawSearchParams): PeopleFilters {
  return {
    role: getParam(params, "role"),
    access: pickEnum(getParam(params, "access"), ACCESS_FILTER_ALLOWED),
    city: getParam(params, "city"),
    team: getParam(params, "team"),
  };
}

export function hasActivePeopleFilters(filters: PeopleFilters): boolean {
  return Boolean(filters.role || filters.access || filters.city || filters.team);
}

// Funciones (the person_functions relation) are the only role source. A person
// can hold several, so the Rol filter is a membership test, not an equality one.
function getPersonRoleLabels(person: PersonListItem): string[] {
  return person.functions.map(getFunctionDisplayName);
}

export function applyPeopleFilters({
  people,
  filters,
  query,
}: {
  people: PersonListItem[];
  filters: PeopleFilters;
  query: string;
}): PersonListItem[] {
  const normalizedQuery = query.trim().toLocaleLowerCase("es");
  const normalizedCity = filters.city ? normalizeText(filters.city) : "";
  const normalizedTeam = filters.team ? normalizeText(filters.team) : "";

  return people.filter((person) => {
    const meta = parsePersonNotesMeta(person.notes);
    const roles = person.functions;
    const city = meta.city || "";
    const teams = personCoverageNames(person);

    if (normalizedQuery) {
      const haystack = [
        person.full_name,
        getPersonRoleLabels(person).join(" "),
        city,
        teams.join(" "),
        person.phone ?? "",
        person.email ?? "",
        getAssignmentStateDisplayName(person.assignment_state),
        meta.notes ?? "",
      ]
        .join(" ")
        .toLocaleLowerCase("es");

      if (!haystack.includes(normalizedQuery)) {
        return false;
      }
    }

    if (filters.role) {
      if (
        filters.role === UNASSIGNED_OPTION
          ? roles.length > 0
          : !roles.some((functionKey) => functionKey === filters.role)
      ) {
        return false;
      }
    }

    if (filters.access) {
      if (filters.access === ACCESS_ANY_ROLE) {
        if (!isAppRole(person.portal_access)) {
          return false;
        }
      } else if (person.portal_access !== filters.access) {
        return false;
      }
    }

    if (filters.city) {
      if (filters.city === UNASSIGNED_OPTION) {
        if (city !== "") {
          return false;
        }
      } else if (normalizeText(city) !== normalizedCity) {
        return false;
      }
    }

    if (filters.team) {
      if (filters.team === UNASSIGNED_OPTION) {
        if (teams.length > 0) {
          return false;
        }
      } else if (!teams.some((team) => normalizeText(team) === normalizedTeam)) {
        return false;
      }
    }

    return true;
  });
}

function collectDistinct(
  values: string[],
): { labels: string[]; hasBlank: boolean } {
  const seen = new Map<string, string>();
  let hasBlank = false;

  for (const raw of values) {
    const value = raw.trim();

    if (!value) {
      hasBlank = true;
      continue;
    }

    const key = normalizeText(value);

    if (key && !seen.has(key)) {
      seen.set(key, value);
    }
  }

  const labels = Array.from(seen.values()).sort((left, right) =>
    left.localeCompare(right, "es"),
  );

  return { labels, hasBlank };
}

function withUnassigned(
  result: { labels: string[]; hasBlank: boolean },
): string[] {
  return result.hasBlank
    ? [...result.labels, UNASSIGNED_OPTION]
    : result.labels;
}

export function derivePeopleFilterOptions(
  people: PersonListItem[],
): PeopleFilterOptions {
  const usedFunctions = new Set<string>();
  let hasPersonWithoutFunction = false;
  const cityValues: string[] = [];
  const teamValues: string[] = [];

  for (const person of people) {
    const meta = parsePersonNotesMeta(person.notes);

    if (person.functions.length === 0) {
      hasPersonWithoutFunction = true;
    } else {
      for (const functionKey of person.functions) {
        usedFunctions.add(functionKey);
      }
    }

    cityValues.push(meta.city || "");

    const teams = personCoverageNames(person);
    if (teams.length === 0) {
      teamValues.push("");
    } else {
      teamValues.push(...teams);
    }
  }

  // Ordered by the canonical PERSON_FUNCTIONS list, not alphabetically, so the
  // dropdown keeps the same order as the Funciones checkboxes.
  const roles = PERSON_FUNCTIONS.filter((key) => usedFunctions.has(key)).map(
    (key) => ({ value: key, label: getFunctionDisplayName(key) }),
  );

  return {
    roles: hasPersonWithoutFunction
      ? [...roles, { value: UNASSIGNED_OPTION, label: UNASSIGNED_OPTION }]
      : roles,
    cities: withUnassigned(collectDistinct(cityValues)),
    teams: withUnassigned(collectDistinct(teamValues)),
  };
}
