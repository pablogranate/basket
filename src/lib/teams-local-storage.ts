import type { TeamDirectoryItem } from "@/lib/team-directory";

export const CUSTOM_TEAMS_STORAGE_KEY = "basket-production-custom-teams";
export const CUSTOM_TEAMS_CHANGED_EVENT = "basket-production-custom-teams-changed";

function isTeamDirectoryItem(value: unknown): value is TeamDirectoryItem {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.id === "string" &&
    typeof candidate.slug === "string" &&
    typeof candidate.official_name === "string" &&
    typeof candidate.competition === "string" &&
    (typeof candidate.stadium === "string" || candidate.stadium === null) &&
    (typeof candidate.manager === "string" || candidate.manager === null) &&
    (typeof candidate.website === "string" || candidate.website === null) &&
    (typeof candidate.instagram === "string" || candidate.instagram === null) &&
    (typeof candidate.official_url === "string" || candidate.official_url === null) &&
    typeof candidate.incident_count === "number" &&
    (typeof candidate.logo_data_url === "string" ||
      candidate.logo_data_url === null ||
      candidate.logo_data_url === undefined)
  );
}

export function readCustomTeams(): TeamDirectoryItem[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const rawValue = window.localStorage.getItem(CUSTOM_TEAMS_STORAGE_KEY);

    if (!rawValue) {
      return [];
    }

    const parsed = JSON.parse(rawValue);

    return Array.isArray(parsed) ? parsed.filter(isTeamDirectoryItem) : [];
  } catch {
    return [];
  }
}

export function writeCustomTeams(teams: TeamDirectoryItem[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    CUSTOM_TEAMS_STORAGE_KEY,
    JSON.stringify(teams),
  );
  window.dispatchEvent(new Event(CUSTOM_TEAMS_CHANGED_EVENT));
}

export function slugifyTeamValue(value: string) {
  return value
    .normalize("NFD")
    .replaceAll(/[\u0300-\u036f]/g, "")
    .replaceAll(/[^a-zA-Z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "")
    .toLowerCase();
}

export function buildCustomTeamId(name: string, competition: string) {
  return `${name.trim()}::${competition.trim()}`;
}
