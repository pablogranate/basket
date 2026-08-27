import "server-only";

import { and, desc, eq, gte, inArray, isNotNull, lt, lte } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { assignmentColumns, gridSyncRunColumns, matchColumns } from "@/lib/db/rows";
import {
  assignments as assignmentsTable,
  gridSyncRuns as gridSyncRunsTable,
  matches as matchesTable,
  people as peopleTable,
  personFunctions as personFunctionsTable,
  roles as rolesTable,
} from "@/lib/db/schema";
import type { Database } from "@/lib/database.types";
import {
  endOfSyncWindow,
  parseTab,
  resolveSyncTabs,
  SHEET_MANAGED_ROLE_NAMES,
  startOfTodayInTimezone,
} from "@/lib/grid/sheet-parse";
import type { SheetEntry } from "@/lib/grid/sheet-parse";
import { applyGridSync } from "@/lib/grid/sync-apply";
import { planGridSync, selectSyncEntries } from "@/lib/grid/sync-plan";
import type {
  AssignmentSnapshot,
  DeleteCandidateSnapshot,
  MatchSnapshot,
  PlanGridSyncInput,
  SyncPlan,
} from "@/lib/grid/sync-plan";

const SHEET_ID = "18Zqlayhde5XpOehkXOa1FKtaBSXhDGDfvqMvstT5Rm8";

type MatchRow = Database["public"]["Tables"]["matches"]["Row"];
type AssignmentRow = Database["public"]["Tables"]["assignments"]["Row"];
type SyncRunRow = Database["public"]["Tables"]["grid_sync_runs"]["Row"];

export type GridSyncTrigger = "cron" | "manual";

export type GridSyncResult = {
  trigger: GridSyncTrigger;
  skipped: boolean;
  reason: string | null;
  created: number;
  updated: number;
  unchanged: number;
  deleted: number;
  assignmentsUpserted: number;
  assignmentsDeleted: number;
  peopleCreated: number;
  tabsSynced: string[];
  tabsMissing: string[];
  errors: string[];
};

// tabName -> CSV. Injected so tests and previews never touch the network.
export type SheetSource = (tabName: string) => Promise<string>;

async function fetchTabCsv(tabName: string) {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&headers=1&sheet=${encodeURIComponent(tabName)}`;
  const response = await fetch(url, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Fallo la descarga de la pestaña "${tabName}" (HTTP ${response.status}).`);
  }

  return response.text();
}

// postgres driver errors are plain objects, not Error instances in every case;
// String() on them can yield "[object Object]", so read `.message` explicitly.
function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  const message = (error as { message?: unknown } | null)?.message;
  return typeof message === "string" && message ? message : String(error);
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

// In-memory guard: button + cron can't overlap inside a single process.
let running = false;

export async function getLastSuccessfulSync(): Promise<SyncRunRow | null> {
  try {
    const rows = await db
      .select(gridSyncRunColumns)
      .from(gridSyncRunsTable)
      .where(eq(gridSyncRunsTable.status, "success"))
      .orderBy(desc(gridSyncRunsTable.startedAt))
      .limit(1);

    return (rows[0] as SyncRunRow | undefined) ?? null;
  } catch (error) {
    console.error("[grid-sync] failed to read last successful run", error);
    return null;
  }
}

// Fetch + parse + snapshot reads + pure plan. Shared by the real run and the
// manual-sync preview; performs no writes.
async function buildGridSyncPlan(now: Date, source: SheetSource): Promise<SyncPlan> {
  // 1. Fetch + parse tabs (missing/future tabs are skipped, not fatal).
  const entries: SheetEntry[] = [];
  const tabsSynced: string[] = [];
  const tabsMissing: string[] = [];
  for (const tabName of resolveSyncTabs(now)) {
    try {
      const csvSource = await source(tabName);
      const tabEntries = parseTab(tabName, csvSource);
      entries.push(...tabEntries);
      tabsSynced.push(tabName);
    } catch {
      tabsMissing.push(tabName);
    }
  }

  // 2. Snapshot reads — the same bulk queries the sync always ran (ADR 0005),
  // gated on the same filtered entry set as before.
  const selected = selectSyncEntries(entries, now);

  let windowMatches: MatchSnapshot[] = [];
  let codedMatches: MatchSnapshot[] = [];
  const assignmentsByMatch = new Map<string, AssignmentSnapshot[]>();
  const roleIdByName = new Map<string, string>();
  let people: Array<{ id: string; full_name: string; deleted_at: string | null }> = [];
  let personFunctions: Array<{ person_id: string; function_key: string }> = [];

  if (selected.entries.length) {
    // Existing matches in the synced kickoff window.
    const kickoffs = selected.entries.map((entry) => new Date(entry.match.kickoff_at).getTime());
    const minKickoff = new Date(Math.min(...kickoffs)).toISOString();
    const maxKickoff = new Date(Math.max(...kickoffs)).toISOString();

    windowMatches = (await db
      .select(matchColumns)
      .from(matchesTable)
      .where(
        and(
          gte(matchesTable.kickoffAt, minKickoff),
          lte(matchesTable.kickoffAt, maxKickoff),
        ),
      )) as MatchRow[];

    // The dedup key (production_code) is global, not window-bound: a match
    // can be rescheduled out of the window or already live from a prior sync.
    // Load every match that carries a code so a re-sync always UPDATES the
    // same row instead of inserting a duplicate.
    codedMatches = (await db
      .select(matchColumns)
      .from(matchesTable)
      .where(isNotNull(matchesTable.productionCode))) as MatchRow[];

    // Assignments for those matches (managed roles filtered by the planner).
    const matchIds = Array.from(
      new Set([...windowMatches, ...codedMatches].map((match) => match.id)),
    );
    for (const idChunk of chunk(matchIds, 300)) {
      const assignmentRows = (await db
        .select(assignmentColumns)
        .from(assignmentsTable)
        .where(inArray(assignmentsTable.matchId, idChunk))) as AssignmentRow[];

      for (const assignment of assignmentRows) {
        const list = assignmentsByMatch.get(assignment.match_id) ?? [];
        list.push(assignment);
        assignmentsByMatch.set(assignment.match_id, list);
      }
    }

    // Sheet-managed roles (name -> id).
    const roleRows = await db
      .select({ id: rolesTable.id, name: rolesTable.name })
      .from(rolesTable)
      .where(inArray(rolesTable.name, SHEET_MANAGED_ROLE_NAMES));

    for (const role of roleRows) {
      roleIdByName.set(role.name, role.id);
    }

    // People (incl. soft-deleted, see people sync PRD) and their funciones for
    // the mismatch warnings — one extra bulk select, concurrent per ADR 0005.
    [people, personFunctions] = await Promise.all([
      db
        .select({
          id: peopleTable.id,
          full_name: peopleTable.fullName,
          deleted_at: peopleTable.deletedAt,
        })
        .from(peopleTable),
      db
        .select({
          person_id: personFunctionsTable.personId,
          function_key: personFunctionsTable.functionKey,
        })
        .from(personFunctionsTable),
    ]);
  }

  // 3. Delete-pass candidates: a dedicated full-window select — the
  // entries-derived min/max range is empty on a zero-entry run, so this must
  // not reuse it. Only read when the plan-time gate can still pass.
  let deleteCandidates: DeleteCandidateSnapshot[] | null = null;
  let deleteCandidatesError: string | undefined;
  if (tabsMissing.length === 0 && selected.errors.length === 0) {
    const windowStartIso = startOfTodayInTimezone(now).toISOString();
    const windowEndIso = endOfSyncWindow(now).toISOString();
    try {
      deleteCandidates = (await db
        .select({
          id: matchesTable.id,
          home_team: matchesTable.homeTeam,
          away_team: matchesTable.awayTeam,
          kickoff_at: matchesTable.kickoffAt,
        })
        .from(matchesTable)
        .where(
          and(
            gte(matchesTable.kickoffAt, windowStartIso),
            lt(matchesTable.kickoffAt, windowEndIso),
          ),
        )) as DeleteCandidateSnapshot[];
    } catch (candidatesError) {
      // A failed candidate read must not abort a run that already saved.
      deleteCandidatesError = toErrorMessage(candidatesError);
    }
  }

  const input: PlanGridSyncInput = {
    entries,
    tabsSynced,
    tabsMissing,
    windowMatches,
    codedMatches,
    assignmentsByMatch,
    roleIdByName,
    people,
    personFunctions,
    deleteCandidates,
    now,
  };
  if (deleteCandidatesError !== undefined) {
    input.deleteCandidatesError = deleteCandidatesError;
  }

  return planGridSync(input);
}

// Plan-only path for the manual-sync preview: fetch → parse → snapshots → plan,
// no writes, no run log, no in-progress guard.
export async function previewGridSync(source: SheetSource = fetchTabCsv): Promise<SyncPlan> {
  return buildGridSyncPlan(new Date(), source);
}

export async function runGridSync(
  trigger: GridSyncTrigger,
  source: SheetSource = fetchTabCsv,
): Promise<GridSyncResult> {
  const result: GridSyncResult = {
    trigger,
    skipped: false,
    reason: null,
    created: 0,
    updated: 0,
    unchanged: 0,
    deleted: 0,
    assignmentsUpserted: 0,
    assignmentsDeleted: 0,
    peopleCreated: 0,
    tabsSynced: [],
    tabsMissing: [],
    errors: [],
  };

  if (running) {
    result.skipped = true;
    result.reason = "in_progress";
    return result;
  }

  running = true;
  const now = new Date();
  const startedAt = now.toISOString();

  try {
    const plan = await buildGridSyncPlan(now, source);

    result.tabsSynced = plan.tabsSynced;
    result.tabsMissing = plan.tabsMissing;
    result.unchanged = plan.unchanged;

    // Warnings are informative only: they never block a run and never enter
    // the run log or result.errors.
    if (plan.warnings.length) {
      console.info("[grid-sync] warnings:", plan.warnings);
    }

    const applied = await applyGridSync(plan, now);

    result.created = applied.created;
    result.updated = applied.updated;
    result.deleted = applied.deleted;
    result.assignmentsUpserted = applied.assignmentsUpserted;
    result.assignmentsDeleted = applied.assignmentsDeleted;
    result.peopleCreated = applied.peopleCreated;
    result.errors = [...plan.errors, ...applied.errors];

    await db.insert(gridSyncRunsTable).values({
      trigger,
      status: "success",
      createdCount: result.created,
      updatedCount: result.updated,
      skippedCount: result.unchanged,
      deletedCount: result.deleted,
      assignmentsUpserted: result.assignmentsUpserted,
      assignmentsDeleted: result.assignmentsDeleted,
      peopleCreated: result.peopleCreated,
      error: result.errors.length ? result.errors.join("\n") : null,
      startedAt,
      finishedAt: new Date().toISOString(),
    });

    return result;
  } catch (error) {
    const message = toErrorMessage(error);
    result.errors.push(message);

    await db.insert(gridSyncRunsTable).values({
      trigger,
      status: "error",
      createdCount: result.created,
      updatedCount: result.updated,
      skippedCount: result.unchanged,
      deletedCount: result.deleted,
      assignmentsUpserted: result.assignmentsUpserted,
      assignmentsDeleted: result.assignmentsDeleted,
      peopleCreated: result.peopleCreated,
      error: message,
      startedAt,
      finishedAt: new Date().toISOString(),
    });

    throw error;
  } finally {
    running = false;
  }
}
