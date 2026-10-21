import { normalizeLeagueName } from "@/lib/league-grid-colors";
import { ALL_TEAM_LEAGUES, ARCHIVED_TEAM_LEAGUE } from "@/lib/team-directory";

export const MAX_LEAGUE_NAME_LENGTH = 60;

// /teams uses these as ?league= values for its own tabs.
const RESERVED_LEAGUE_NAMES = new Set([ALL_TEAM_LEAGUES, ARCHIVED_TEAM_LEAGUE]);

export type LeagueNameResult =
  | { ok: true; name: string }
  | { ok: false; error: string };

export function parseLeagueName(raw: string): LeagueNameResult {
  const name = raw.trim().replaceAll(/\s+/g, " ");

  if (!name) {
    return { ok: false, error: "Escribí el nombre de la liga." };
  }

  if (name.length > MAX_LEAGUE_NAME_LENGTH) {
    return {
      ok: false,
      error: `El nombre no puede superar los ${MAX_LEAGUE_NAME_LENGTH} caracteres.`,
    };
  }

  // A team's competition joins its league names with " / ".
  if (name.includes("/")) {
    return { ok: false, error: "El nombre no puede incluir «/»." };
  }

  if (RESERVED_LEAGUE_NAMES.has(normalizeLeagueName(name))) {
    return { ok: false, error: `«${name}» ya es una pestaña de Equipos.` };
  }

  return { ok: true, name };
}

export function isSameLeagueName(left: string, right: string) {
  return normalizeLeagueName(left) === normalizeLeagueName(right);
}
