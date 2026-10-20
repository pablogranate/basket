// Competitions a viewer has archived on /fixtures (season over). Only hides
// their filter chip and their rows under "Todas"; nothing else changes.
export const FIXTURES_ARCHIVED_COOKIE = "fixtures-archived";
export const FIXTURES_ARCHIVED_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function parseArchivedCompetitions(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(safeDecode(value));
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function serializeArchivedCompetitions(labels: readonly string[]) {
  return encodeURIComponent(JSON.stringify(labels));
}

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
