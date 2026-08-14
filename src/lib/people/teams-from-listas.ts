import "server-only";

import { parse } from "csv-parse/sync";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  clubAliases as clubAliasesTable,
  clubs as clubsTable,
  teams as teamsTable,
} from "@/lib/db/schema";
import { slugifyTeamValue } from "@/lib/teams/slug";
import { normalizeText } from "@/lib/utils";
import type { TeamsSyncDecisions, TeamsSyncPlanPreview } from "@/lib/people/sync-preview";

// Column B of the "Listas" tab in the production spreadsheet — the same tab that
// feeds the sheet's own `ClubesValidos` dropdown. It is the roster of club
// names: every name the portal knows already lives there, so a name that is
// missing from the portal is a team the portal has yet to learn.
export const CLUBS_TAB = "Listas";

// New teams land here. The category is not knowable from a bare club name, and
// `mayores` is both the schema default and what people mean when they write
// "Atenas de Córdoba".
const DEFAULT_CATEGORY = "mayores";

type KnownTeam = {
  teamId: string;
  clubId: string;
  name: string;
};

function normalizeHeader(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
}

// Word-set containment, not edit distance. Argentine club names share surnames
// by the dozen ("Independiente de …", "Gimnasia y Esgrima de …"), so a
// similarity ratio pairs clubs that have nothing to do with each other. One
// name's words being a subset of another's is the signal that actually means
// "these might be the same club": `Atlético Pilar` ⊂ `Club Atlético Pilar`.
function nameTokens(value: string) {
  return new Set(normalizeText(value).split(" ").filter(Boolean));
}

function isSubset(small: Set<string>, large: Set<string>) {
  if (small.size >= large.size) {
    return false;
  }
  for (const token of small) {
    if (!large.has(token)) {
      return false;
    }
  }
  return true;
}

export function findNameCandidates(
  name: string,
  knownNames: string[],
): string[] {
  const tokens = nameTokens(name);

  return knownNames.filter((known) => {
    const knownTokens = nameTokens(known);
    return isSubset(tokens, knownTokens) || isSubset(knownTokens, tokens);
  });
}

async function fetchClubNamesFromListas(sheetId: string): Promise<string[]> {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(CLUBS_TAB)}`;
  const response = await fetch(url, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(
      `Fallo la descarga de la pestaña "${CLUBS_TAB}" (HTTP ${response.status}).`,
    );
  }

  const rows = parse(await response.text(), {
    relax_column_count: true,
  }) as string[][];

  if (!rows.length) {
    return [];
  }

  const headers = rows[0].map(normalizeHeader);
  const columnIndex = ["clubes", "club", "equipos", "equipo"]
    .map((alias) => headers.indexOf(alias))
    .find((index) => index >= 0);

  if (columnIndex === undefined) {
    throw new Error(
      `La pestaña "${CLUBS_TAB}" no tiene una columna "Clubes".`,
    );
  }

  // Repeated names are cosmetic in the sheet and produce no portal change, so
  // they collapse without a warning.
  const seen = new Set<string>();
  const names: string[] = [];

  for (const row of rows.slice(1)) {
    const value = String(row[columnIndex] ?? "").trim();
    const key = normalizeText(value);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    names.push(value);
  }

  return names;
}

async function loadKnownTeams() {
  const rows = await db
    .select({
      teamId: teamsTable.id,
      clubId: teamsTable.clubId,
      name: teamsTable.name,
      category: teamsTable.category,
    })
    .from(teamsTable);

  // One entry per name: a club with several categories still answers to a
  // single club name, and `mayores` is the one a bare name means.
  const byName = new Map<string, KnownTeam>();
  const byNameIsDefault = new Map<string, boolean>();

  for (const row of rows) {
    const key = normalizeText(row.name);
    if (!key) {
      continue;
    }
    const isDefault = row.category === DEFAULT_CATEGORY;
    if (byName.has(key) && (byNameIsDefault.get(key) || !isDefault)) {
      continue;
    }
    byName.set(key, {
      teamId: row.teamId,
      clubId: row.clubId,
      name: row.name,
    });
    byNameIsDefault.set(key, isDefault);
  }

  return byName;
}

async function loadAliases() {
  return db
    .select({ alias: clubAliasesTable.alias, clubId: clubAliasesTable.clubId })
    .from(clubAliasesTable);
}

// Team name -> team id for the people sync's `Club` column, aliases included:
// once "Atlético Pilar" is recorded as an alias of Club Atlético Pilar, a
// person's row spelled that way resolves too. `pendingNames` are names this run
// is about to create — mapped to a placeholder so the preview stops reporting
// them as unknown clubs.
export async function buildTeamIdByName(pendingNames: string[] = []) {
  const [byName, aliases] = await Promise.all([loadKnownTeams(), loadAliases()]);

  const teamIdByName = new Map<string, string>();
  const teamIdByClub = new Map<string, string>();

  for (const [key, team] of byName) {
    teamIdByName.set(key, team.teamId);
    teamIdByClub.set(team.clubId, team.teamId);
  }

  for (const alias of aliases) {
    const key = normalizeText(alias.alias);
    const teamId = teamIdByClub.get(alias.clubId);
    if (key && teamId && !teamIdByName.has(key)) {
      teamIdByName.set(key, teamId);
    }
  }

  for (const pending of pendingNames) {
    const key = normalizeText(pending);
    if (key && !teamIdByName.has(key)) {
      teamIdByName.set(key, PENDING_TEAM_ID);
    }
  }

  return teamIdByName;
}

// Stands in for a team the operator has not confirmed creating yet. It never
// reaches the database: the apply step rebuilds the index after creating.
export const PENDING_TEAM_ID = "pending-team";

// Diffs the "Listas" club column against the portal. Names that look like a
// club the portal already knows are not created — they are handed back for the
// operator to resolve.
export async function buildTeamsSyncPlan(
  sheetId: string,
): Promise<TeamsSyncPlanPreview> {
  const [sheetNames, byName, aliases] = await Promise.all([
    fetchClubNamesFromListas(sheetId),
    loadKnownTeams(),
    loadAliases(),
  ]);

  const aliasKeys = new Set(aliases.map((alias) => normalizeText(alias.alias)));
  const knownNames = Array.from(byName.values()).map((team) => team.name);

  const created: string[] = [];
  const ambiguous: TeamsSyncPlanPreview["ambiguous"] = [];

  for (const name of sheetNames) {
    const key = normalizeText(name);
    if (byName.has(key) || aliasKeys.has(key)) {
      continue;
    }

    const candidates = findNameCandidates(name, knownNames);

    if (candidates.length) {
      ambiguous.push({
        name,
        candidates: candidates.map((candidate) => {
          const known = byName.get(normalizeText(candidate))!;
          return { clubId: known.clubId, name: known.name };
        }),
      });
      continue;
    }

    created.push(name);
  }

  return { created, ambiguous };
}

export type TeamDecisionsResult = {
  createdTeams: string[];
  aliasedNames: string[];
  warnings: string[];
};

// Creates the approved teams and records the approved aliases. Runs before the
// people diff so a brand-new club resolves for the very same sync.
export async function applyTeamDecisions(
  decisions: TeamsSyncDecisions,
): Promise<TeamDecisionsResult> {
  const result: TeamDecisionsResult = {
    createdTeams: [],
    aliasedNames: [],
    warnings: [],
  };

  const byName = await loadKnownTeams();

  for (const name of decisions.create) {
    const key = normalizeText(name);
    if (!key || byName.has(key)) {
      continue;
    }

    try {
      const created = await createTeamForName(name);
      if (created) {
        byName.set(key, created);
        result.createdTeams.push(name);
      } else {
        result.warnings.push(
          `El equipo "${name}" ya existía en el portal; no se creó de nuevo.`,
        );
      }
    } catch (error) {
      // One unusable name must not cost the roster its sync.
      result.warnings.push(
        `No se pudo crear el equipo "${name}": ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  for (const alias of decisions.aliases) {
    const inserted = await db
      .insert(clubAliasesTable)
      .values({ alias: alias.alias, clubId: alias.clubId })
      .onConflictDoNothing()
      .returning({ alias: clubAliasesTable.alias });

    if (inserted[0]) {
      result.aliasedNames.push(alias.alias);
    }
  }

  return result;
}

async function createTeamForName(name: string): Promise<KnownTeam | null> {
  const slug = slugifyTeamValue(name);

  // A club may already exist without a `mayores` team (or with a differently
  // spelled team name); reuse it by slug instead of forking a duplicate.
  const existingClub = await db
    .select({ id: clubsTable.id })
    .from(clubsTable)
    .where(eq(clubsTable.slug, slug))
    .limit(1);

  const clubId =
    existingClub[0]?.id ??
    (
      await db
        .insert(clubsTable)
        .values({ name, slug })
        .returning({ id: clubsTable.id })
    )[0].id;

  const inserted = await db
    .insert(teamsTable)
    .values({ clubId, name, slug, category: DEFAULT_CATEGORY })
    .onConflictDoNothing()
    .returning({ id: teamsTable.id });

  if (!inserted[0]) {
    return null;
  }

  return { teamId: inserted[0].id, clubId, name };
}
