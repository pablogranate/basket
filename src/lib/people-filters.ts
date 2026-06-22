import { getAssignmentStateDisplayName } from "@/lib/display";
import { parsePersonNotesMeta } from "@/lib/people-notes";
import { splitCoverageTeams } from "@/lib/team-responsibles";
import type { PersonListItem } from "@/lib/types";
import { normalizeText } from "@/lib/utils";

export type PeopleFilters = {
  role: string;
  state: string;
  city: string;
  team: string;
};

export const EMPTY_PEOPLE_FILTERS: PeopleFilters = {
  role: "",
  state: "",
  city: "",
  team: "",
};

// Raw `assignment_state` values (unaccented), not their display labels.
export const STATE_FILTER_VALUES = [
  "En asignacion",
  "Disponible",
  "Inactivo",
] as const;

// Sentinel option matching people whose role/city/team field is blank.
export const UNASSIGNED_OPTION = "(Sin asignar)";

export type PeopleFilterOptions = {
  roles: string[];
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
    state: pickEnum(getParam(params, "state"), STATE_FILTER_VALUES),
    city: getParam(params, "city"),
    team: getParam(params, "team"),
  };
}

export function hasActivePeopleFilters(filters: PeopleFilters): boolean {
  return Boolean(filters.role || filters.state || filters.city || filters.team);
}

function getPersonRoleValue(
  person: PersonListItem,
  meta: ReturnType<typeof parsePersonNotesMeta>,
): string {
  return meta.role || person.primary_role || "";
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
    const role = getPersonRoleValue(person, meta);
    const city = meta.city || "";
    const teams = splitCoverageTeams(meta.coverage);

    if (normalizedQuery) {
      const haystack = [
        person.full_name,
        role,
        city,
        meta.coverage || "",
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
      if (filters.role === UNASSIGNED_OPTION ? role !== "" : role !== filters.role) {
        return false;
      }
    }

    if (filters.state && person.assignment_state !== filters.state) {
      return false;
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
  const roleValues: string[] = [];
  const cityValues: string[] = [];
  const teamValues: string[] = [];

  for (const person of people) {
    const meta = parsePersonNotesMeta(person.notes);
    roleValues.push(getPersonRoleValue(person, meta));
    cityValues.push(meta.city || "");

    const teams = splitCoverageTeams(meta.coverage);
    if (teams.length === 0) {
      teamValues.push("");
    } else {
      teamValues.push(...teams);
    }
  }

  return {
    roles: withUnassigned(collectDistinct(roleValues)),
    cities: withUnassigned(collectDistinct(cityValues)),
    teams: withUnassigned(collectDistinct(teamValues)),
  };
}
