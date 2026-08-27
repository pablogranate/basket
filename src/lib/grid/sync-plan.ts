import type { Database } from "@/lib/database.types";
import { roleNameToFunctionKey } from "@/lib/functions";
import type { SheetEntry } from "@/lib/grid/sheet-parse";
import {
  endOfSyncWindow,
  parseTabPeriod,
  startOfTodayInTimezone,
  zonedYearMonth,
} from "@/lib/grid/sheet-parse";
import { normalizeText } from "@/lib/utils";

type MatchStatus = Database["public"]["Enums"]["match_status"];

// A person the plan references: an existing row by id, or a person the sheet
// names that does not exist yet, by normalized-name key. Apply creates the
// keyed people first, then resolves keys to ids.
export type PersonRef = { kind: "id"; id: string } | { kind: "key"; key: string };

export type SyncAssignmentUpsert = { roleId: string; person: PersonRef };

// Snapshot shapes: structural subsets of the DB rows the loader already reads.
export type MatchSnapshot = {
  id: string;
  competition: string | null;
  production_mode: string | null;
  status: string;
  home_team: string;
  away_team: string;
  kickoff_at: string;
  owner_id: string | null;
  production_code: string | null;
  commentary_plan: string | null;
  transport: string | null;
  notes: string | null;
};

export type AssignmentSnapshot = {
  id: string;
  match_id: string;
  role_id: string;
  person_id: string | null;
};

export type PersonSnapshot = {
  id: string;
  full_name: string;
  deleted_at: string | null;
};

export type PersonFunctionSnapshot = {
  person_id: string;
  function_key: string;
};

export type DeleteCandidateSnapshot = {
  id: string;
  home_team: string;
  away_team: string;
  kickoff_at: string;
};

export type MatchFieldPatch = Partial<{
  competition: string | null;
  productionMode: string | null;
  homeTeam: string;
  awayTeam: string;
  kickoffAt: string;
  productionCode: string | null;
  commentaryPlan: string | null;
  transport: string | null;
  notes: string | null;
  status: MatchStatus;
}>;

export type SyncPlanCreate = {
  label: string;
  values: {
    competition: string | null;
    productionMode: string | null;
    homeTeam: string;
    awayTeam: string;
    kickoffAt: string;
    durationMinutes: number;
    timezone: string;
    productionCode: string | null;
    commentaryPlan: string | null;
    transport: string | null;
    notes: string | null;
    status: MatchStatus;
  };
  owner: PersonRef | null;
  assignments: SyncAssignmentUpsert[];
};

export type SyncPlanUpdate = {
  id: string;
  label: string;
  patch: MatchFieldPatch;
  // undefined = owner unchanged; null = clear owner; PersonRef = new owner.
  owner?: PersonRef | null;
  assignmentUpserts: SyncAssignmentUpsert[];
  assignmentDeletes: string[];
};

export type SyncDeletePassSkipReason =
  | "tabs_missing"
  | "plan_errors"
  | "candidates_unavailable";

export type SyncPlan = {
  creates: SyncPlanCreate[];
  updates: SyncPlanUpdate[];
  deletes: Array<{ id: string; label: string }>;
  peopleToCreate: Array<{ key: string; name: string }>;
  peopleToResurrect: Array<{ id: string; name: string }>;
  errors: string[];
  warnings: string[];
  tabsSynced: string[];
  tabsMissing: string[];
  unchanged: number;
  deletePassSkipped: SyncDeletePassSkipReason | null;
};

export type PlanGridSyncInput = {
  entries: SheetEntry[];
  tabsSynced: string[];
  tabsMissing: string[];
  windowMatches: MatchSnapshot[];
  codedMatches: MatchSnapshot[];
  assignmentsByMatch: Map<string, AssignmentSnapshot[]>;
  roleIdByName: Map<string, string>;
  people: PersonSnapshot[];
  personFunctions: PersonFunctionSnapshot[];
  deleteCandidates: DeleteCandidateSnapshot[] | null;
  deleteCandidatesError?: string;
  now: Date;
};

export function updateChangesMatchRow(update: SyncPlanUpdate): boolean {
  return Object.keys(update.patch).length > 0 || update.owner !== undefined;
}

function tripleKey(home: string, away: string, kickoffIso: string) {
  return `${normalizeText(home)}|${normalizeText(away)}|${new Date(kickoffIso).getTime()}`;
}

function nullableText(value: string | null | undefined) {
  const trimmed = (value ?? "").trim();
  return trimmed ? trimmed : null;
}

// Window filter + duplicate-production-code hard-stop, shared with the
// snapshot loader so its bounds and gating match the planner exactly.
export function selectSyncEntries(
  entries: SheetEntry[],
  now: Date,
): { entries: SheetEntry[]; errors: string[] } {
  // Only touch matches inside the rolling window [today, today + 30d):
  // drop past entries and anything beyond the horizon so the sync neither
  // creates, updates, nor rewrites assignments for them.
  const windowStart = startOfTodayInTimezone(now).getTime();
  const windowEnd = endOfSyncWindow(now).getTime();
  const windowEntries = entries.filter((entry) => {
    const kickoff = new Date(entry.match.kickoff_at).getTime();
    return kickoff >= windowStart && kickoff < windowEnd;
  });

  // A production code repeated across sheet rows is a data-entry error. It
  // must hard-stop those entries: processing the second one would find the
  // first one's match via the code lookup and silently overwrite its teams
  // and kickoff. Report every duplicate and skip all entries involved.
  const errors: string[] = [];
  const entriesByCode = new Map<string, SheetEntry[]>();
  for (const entry of windowEntries) {
    const code = nullableText(entry.match.production_code);
    if (!code) {
      continue;
    }
    const list = entriesByCode.get(code) ?? [];
    list.push(entry);
    entriesByCode.set(code, list);
  }

  const duplicateCodes = new Set<string>();
  for (const [code, list] of entriesByCode) {
    if (list.length > 1) {
      duplicateCodes.add(code);
      const labels = list
        .map((entry) => `${entry.match.home_team} vs ${entry.match.away_team}`)
        .join(" / ");
      errors.push(
        `El ID "${code}" está repetido en la planilla (${labels}). Esas filas no se sincronizaron: corregí el ID en el sheet.`,
      );
    }
  }

  const validEntries = duplicateCodes.size
    ? windowEntries.filter((entry) => {
        const code = nullableText(entry.match.production_code);
        return !code || !duplicateCodes.has(code);
      })
    : windowEntries;

  return { entries: validEntries, errors };
}

export function planGridSync(input: PlanGridSyncInput): SyncPlan {
  const { now } = input;
  const selected = selectSyncEntries(input.entries, now);

  const plan: SyncPlan = {
    creates: [],
    updates: [],
    deletes: [],
    peopleToCreate: [],
    peopleToResurrect: [],
    errors: [...selected.errors],
    warnings: [],
    tabsSynced: [...input.tabsSynced],
    tabsMissing: [...input.tabsMissing],
    unchanged: 0,
    deletePassSkipped: null,
  };

  const matchByProductionCode = new Map<string, MatchSnapshot>();
  for (const match of input.codedMatches) {
    if (match.production_code) {
      matchByProductionCode.set(match.production_code, match);
    }
  }

  // Every production code already in the DB. New creates check this set so a
  // colliding code is rejected per-entry (others in the run still save).
  const seenProductionCodes = new Set<string>(matchByProductionCode.keys());

  const matchByTriple = new Map<string, MatchSnapshot>();
  for (const match of input.windowMatches) {
    matchByTriple.set(tripleKey(match.home_team, match.away_team, match.kickoff_at), match);
  }

  const roleIdByName = input.roleIdByName;
  const managedRoleIds = new Set<string>(roleIdByName.values());

  // People keyed by normalized name (matches people-import dedupe). Soft-deleted
  // people map too so a name that reappears in the grilla resurrects the same
  // row instead of duplicating (see people sync PRD).
  const personIdByName = new Map<string, string>();
  const softDeletedPersonIds = new Set<string>();
  for (const person of input.people) {
    const key = normalizeText(person.full_name);
    if (key && !personIdByName.has(key)) {
      personIdByName.set(key, person.id);
      if (person.deleted_at) {
        softDeletedPersonIds.add(person.id);
      }
    }
  }

  const functionsByPersonId = new Map<string, Set<string>>();
  for (const row of input.personFunctions) {
    const set = functionsByPersonId.get(row.person_id) ?? new Set<string>();
    set.add(row.function_key);
    functionsByPersonId.set(row.person_id, set);
  }

  const plannedNewPeople = new Map<string, string>();
  const plannedResurrections = new Map<string, string>();

  const resolvePerson = (fullName: string): PersonRef | null => {
    const name = fullName.trim();
    if (!name) {
      return null;
    }

    const key = normalizeText(name);
    const cached = personIdByName.get(key);
    if (cached) {
      // Resurrect a soft-deleted person referenced by the grilla: the contacts
      // sync removed them, but an active assignment means they still work.
      if (softDeletedPersonIds.has(cached)) {
        softDeletedPersonIds.delete(cached);
        plannedResurrections.set(cached, name);
      }
      return { kind: "id", id: cached };
    }

    if (!plannedNewPeople.has(key)) {
      plannedNewPeople.set(key, name);
    }
    return { kind: "key", key };
  };

  const warningKeys = new Set<string>();
  const maybeWarnFunctionMismatch = (
    person: PersonRef,
    personName: string,
    roleName: string,
    label: string,
  ) => {
    const functionKey = roleNameToFunctionKey(roleName);
    if (!functionKey) {
      return;
    }
    const holds =
      person.kind === "id" &&
      (functionsByPersonId.get(person.id)?.has(functionKey) ?? false);
    if (holds) {
      return;
    }
    const dedupeKey = `${person.kind === "id" ? person.id : person.key}|${functionKey}`;
    if (warningKeys.has(dedupeKey)) {
      return;
    }
    warningKeys.add(dedupeKey);
    plan.warnings.push(
      `"${personName.trim()}" está asignado como ${roleName} (${label}) pero no tiene la función "${functionKey}" cargada en el portal.`,
    );
  };

  // Ids of every existing match matched while planning in-window entries. The
  // delete pass treats any in-window match NOT in this set as removed.
  const touchedMatchIds = new Set<string>();

  for (const entry of selected.entries) {
    const sheet = entry.match;
    const label = `${sheet.home_team} vs ${sheet.away_team}`;

    // Owner resolution happens before the duplicate-code rejection, exactly as
    // today: a rejected entry still creates/resurrects its responsable.
    const owner = resolvePerson(entry.responsable);
    const isPast = new Date(sheet.kickoff_at).getTime() < now.getTime();

    const existing =
      (sheet.production_code ? matchByProductionCode.get(sheet.production_code) : undefined) ??
      matchByTriple.get(tripleKey(sheet.home_team, sheet.away_team, sheet.kickoff_at));

    // Desired sheet assignments, resolved lazily below so a rejected create
    // never records its assignment people (matches today's ordering).
    const buildDesired = () => {
      const desired = new Map<string, { person: PersonRef; roleName: string; personName: string }>();
      for (const assignment of entry.assignments) {
        const roleId = roleIdByName.get(assignment.roleName);
        if (!roleId) {
          plan.errors.push(`Rol "${assignment.roleName}" no existe; asignación omitida.`);
          continue;
        }
        const person = resolvePerson(assignment.personName);
        if (person) {
          desired.set(roleId, {
            person,
            roleName: assignment.roleName,
            personName: assignment.personName,
          });
        }
      }
      for (const { person, roleName, personName } of desired.values()) {
        maybeWarnFunctionMismatch(person, personName, roleName, label);
      }
      return desired;
    };

    if (!existing) {
      const productionCode = sheet.production_code;

      if (productionCode && seenProductionCodes.has(productionCode)) {
        plan.errors.push(
          `${label}: El ID "${productionCode}" ya existe en la base de datos. Probá con otro.`,
        );
        continue;
      }

      if (productionCode) {
        seenProductionCodes.add(productionCode);
      }

      const desired = buildDesired();

      plan.creates.push({
        label,
        values: {
          competition: sheet.competition,
          productionMode: sheet.production_mode,
          homeTeam: sheet.home_team,
          awayTeam: sheet.away_team,
          kickoffAt: sheet.kickoff_at,
          durationMinutes: sheet.duration_minutes,
          timezone: sheet.timezone,
          productionCode: sheet.production_code,
          commentaryPlan: sheet.commentary_plan,
          transport: sheet.transport,
          notes: sheet.notes,
          status: isPast ? "Realizado" : "Pendiente",
        },
        owner,
        assignments: Array.from(desired, ([roleId, { person }]) => ({ roleId, person })),
      });
      continue;
    }

    touchedMatchIds.add(existing.id);

    // Sheet owns roster fields; compare instant-wise for kickoff.
    // Keys are camelCase to feed Drizzle .set() directly.
    const patch: MatchFieldPatch = {};
    if (nullableText(existing.competition) !== nullableText(sheet.competition)) {
      patch.competition = sheet.competition;
    }
    if (nullableText(existing.production_mode) !== nullableText(sheet.production_mode)) {
      patch.productionMode = sheet.production_mode;
    }
    if (existing.home_team !== sheet.home_team) {
      patch.homeTeam = sheet.home_team;
    }
    if (existing.away_team !== sheet.away_team) {
      patch.awayTeam = sheet.away_team;
    }
    if (new Date(existing.kickoff_at).getTime() !== new Date(sheet.kickoff_at).getTime()) {
      patch.kickoffAt = sheet.kickoff_at;
    }
    if (nullableText(existing.production_code) !== nullableText(sheet.production_code)) {
      patch.productionCode = sheet.production_code;
    }
    if (nullableText(existing.commentary_plan) !== nullableText(sheet.commentary_plan)) {
      patch.commentaryPlan = sheet.commentary_plan;
    }
    if (nullableText(existing.transport) !== nullableText(sheet.transport)) {
      patch.transport = sheet.transport;
    }
    if (nullableText(existing.notes) !== nullableText(sheet.notes)) {
      patch.notes = sheet.notes;
    }

    // Status is app-owned: never overwrite a manual "Confirmado";
    // otherwise reflect time (past -> Realizado, future -> Pendiente).
    if (existing.status !== "Confirmado") {
      const desiredStatus: MatchStatus = isPast ? "Realizado" : "Pendiente";
      if (existing.status !== desiredStatus) {
        patch.status = desiredStatus;
      }
    }

    // A "key" ref is a person that does not exist yet, so it always differs
    // from any stored owner id.
    const existingOwnerId = existing.owner_id ?? null;
    const ownerChanged = owner
      ? owner.kind === "key" || owner.id !== existingOwnerId
      : existingOwnerId !== null;

    const desired = buildDesired();

    const existingAssignments = (input.assignmentsByMatch.get(existing.id) ?? []).filter(
      (row) => managedRoleIds.has(row.role_id),
    );
    const existingByRole = new Map<string, AssignmentSnapshot>();
    for (const row of existingAssignments) {
      existingByRole.set(row.role_id, row);
    }

    const assignmentUpserts: SyncAssignmentUpsert[] = [];
    for (const [roleId, { person }] of desired) {
      const current = existingByRole.get(roleId);
      const same = current && person.kind === "id" && current.person_id === person.id;
      if (!same) {
        assignmentUpserts.push({ roleId, person });
      }
    }

    const assignmentDeletes: string[] = [];
    for (const row of existingAssignments) {
      if (!desired.has(row.role_id)) {
        assignmentDeletes.push(row.id);
      }
    }

    const matchChanged = Object.keys(patch).length > 0 || ownerChanged;
    if (!matchChanged) {
      plan.unchanged += 1;
    }

    if (matchChanged || assignmentUpserts.length || assignmentDeletes.length) {
      plan.updates.push({
        id: existing.id,
        label,
        patch,
        ...(ownerChanged ? { owner } : {}),
        assignmentUpserts,
        assignmentDeletes,
      });
    }
  }

  plan.peopleToCreate = Array.from(plannedNewPeople, ([key, name]) => ({ key, name }));
  plan.peopleToResurrect = Array.from(plannedResurrections, ([id, name]) => ({ id, name }));

  // Delete pass — hard-remove in-window matches that vanished from the sheet.
  // Clean-run-only: a missing tab or a plan error makes a still present match
  // look "removed", so skip the entire pass in that case.
  if (plan.tabsMissing.length > 0) {
    plan.deletePassSkipped = "tabs_missing";
    return plan;
  }
  if (plan.errors.length > 0) {
    plan.deletePassSkipped = "plan_errors";
    return plan;
  }
  if (!input.deleteCandidates) {
    // A failed candidate read must not abort a run that already planned.
    if (input.deleteCandidatesError) {
      plan.errors.push(input.deleteCandidatesError);
    }
    plan.deletePassSkipped = "candidates_unavailable";
    return plan;
  }

  // Only months actually covered by a synced tab are eligible: a window month
  // with no tab coverage (e.g. pre-cutover) is not "missing", so its matches
  // must never be deleted.
  const coveredMonths = new Set<string>();
  for (const tabName of plan.tabsSynced) {
    const { year, month } = parseTabPeriod(tabName);
    coveredMonths.add(`${year}-${month}`);
  }

  for (const match of input.deleteCandidates) {
    if (touchedMatchIds.has(match.id)) {
      continue;
    }
    const { year, month } = zonedYearMonth(new Date(match.kickoff_at));
    if (!coveredMonths.has(`${year}-${month}`)) {
      continue;
    }
    plan.deletes.push({
      id: match.id,
      label: `${match.home_team} vs ${match.away_team} @ ${match.kickoff_at}`,
    });
  }

  return plan;
}
