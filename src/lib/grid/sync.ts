import "server-only";

import { parse } from "csv-parse/sync";
import { fromZonedTime } from "date-fns-tz";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/database.types";
import { normalizeText } from "@/lib/utils";

const SHEET_ID = "18Zqlayhde5XpOehkXOa1FKtaBSXhDGDfvqMvstT5Rm8";
const TIMEZONE = "America/Argentina/Buenos_Aires";
const DEFAULT_DURATION_MINUTES = 150;

// Rolling window the sync operates on: today through the next 30 days.
const SYNC_WINDOW_DAYS = 30;

// First tab that uses the Local/Visitante columns. Earlier tabs still carry the
// retired single "Partido" column, so they must never be fetched or parsed.
// See ADR 0001 (format switch) and ADR 0003 (cutover floor).
const FORMAT_CUTOVER = { year: 2026, month: 7 }; // Julio 26

const MONTHS: Record<string, number> = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
};

const MONTH_NAMES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

const ROLE_COLUMN_MAP: Record<string, string> = {
  "responsable en cancha": "Responsable",
  realizador: "Realizador",
  "operador de grafica": "Operador de Grafica",
  "camara 1": "Camara 1",
  "camara 2": "Camara 2",
  "camara 3": "Camara 3",
  "camara 4": "Camara 4",
  "camara 5": "Camara 5",
  relator: "Relator",
  "comentarista 1": "Comentario 1",
  "comentarista 2": "Comentario 2",
  "operador de control": "Operador de Control",
  "soporte tecnico": "Soporte tecnico",
};

const SHEET_MANAGED_ROLE_NAMES = Object.values(ROLE_COLUMN_MAP);

type MatchRow = Database["public"]["Tables"]["matches"]["Row"];
type MatchStatus = Database["public"]["Enums"]["match_status"];
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

type SheetMatch = {
  competition: string | null;
  production_mode: string | null;
  home_team: string;
  away_team: string;
  kickoff_at: string;
  duration_minutes: number;
  timezone: string;
  external_match_id: string | null;
  commentary_plan: string | null;
  transport: string | null;
  notes: string | null;
};

type SheetEntry = {
  tabName: string;
  match: SheetMatch;
  responsable: string;
  assignments: Array<{ roleName: string; personName: string }>;
};

// --- parsing helpers (ported from tools/import/grilla.mjs) ---

function normalizeHeader(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
}

function parseTabPeriod(tabName: string) {
  const parts = tabName.trim().split(/\s+/);
  const month = MONTHS[normalizeHeader(parts[0])];
  const year = 2000 + Number(parts[1]);

  if (!month || Number.isNaN(year)) {
    throw new Error(`No se pudo interpretar mes/año de la pestaña "${tabName}".`);
  }

  return { month, year };
}

function parseDayMarker(value: unknown) {
  const match = String(value ?? "")
    .trim()
    .match(/(\d{1,2})\s*$/);
  return match ? Number(match[1]) : null;
}

function toKickoffAt({
  year,
  month,
  day,
  time,
}: {
  year: number;
  month: number;
  day: number;
  time: string;
}) {
  const normalizedTime = /^\d{1,2}:\d{2}$/.test(time) ? time.padStart(5, "0") : "00:00";
  const monthValue = String(month).padStart(2, "0");
  const dayValue = String(day).padStart(2, "0");
  const localDateTime = `${year}-${monthValue}-${dayValue}T${normalizedTime}:00`;
  return fromZonedTime(localDateTime, TIMEZONE).toISOString();
}

function buildNotes(observacion: string, transporte: string) {
  return [observacion, transporte].map((value) => value.trim()).filter(Boolean).join("\n") || null;
}

async function fetchTabCsv(tabName: string) {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tabName)}`;
  const response = await fetch(url, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Fallo la descarga de la pestaña "${tabName}" (HTTP ${response.status}).`);
  }

  return response.text();
}

function parseTab(tabName: string, csvSource: string): SheetEntry[] {
  const { month, year } = parseTabPeriod(tabName);
  const rows = parse(csvSource, { relax_column_count: true }) as string[][];

  if (!rows.length) {
    return [];
  }

  const headers = rows[0].map(normalizeHeader);
  const columnIndex = new Map<string, number>();

  headers.forEach((header, index) => {
    if (!columnIndex.has(header)) {
      columnIndex.set(header, index);
    }
  });

  const readCell = (row: string[], header: string) => {
    const index = columnIndex.get(header);
    return index === undefined ? "" : String(row[index] ?? "").trim();
  };

  let currentDay = parseDayMarker(rows[0][0]);
  const entries: SheetEntry[] = [];

  for (const row of rows.slice(1)) {
    const dayMarker = parseDayMarker(row[0]);
    if (dayMarker) {
      currentDay = dayMarker;
    }

    const home = readCell(row, "local");
    if (!home) {
      continue;
    }

    if (!currentDay) {
      continue;
    }

    const away = readCell(row, "visitante");
    const kickoffAt = toKickoffAt({ year, month, day: currentDay, time: readCell(row, "hora") });

    const assignments: Array<{ roleName: string; personName: string }> = [];
    for (const [header, roleName] of Object.entries(ROLE_COLUMN_MAP)) {
      const personName = readCell(row, header);
      if (personName) {
        assignments.push({ roleName, personName });
      }
    }

    entries.push({
      tabName,
      match: {
        competition: readCell(row, "liga") || null,
        production_mode: readCell(row, "produccion") || null,
        home_team: home,
        away_team: away,
        kickoff_at: kickoffAt,
        duration_minutes: DEFAULT_DURATION_MINUTES,
        timezone: TIMEZONE,
        external_match_id: readCell(row, "id") || null,
        commentary_plan: readCell(row, "relatos/comentarios") || null,
        transport: readCell(row, "transporte") || null,
        notes: buildNotes(readCell(row, "observacion"), readCell(row, "transporte")),
      },
      responsable: readCell(row, "responsable en cancha"),
      assignments,
    });
  }

  return entries;
}

// Start of "today" in the sheet timezone, as an instant. Entries with a
// kickoff before this are in the past and must not be synced/changed.
export function startOfTodayInTimezone(now: Date): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return fromZonedTime(`${parts}T00:00:00`, TIMEZONE);
}

// Exclusive end of the rolling sync window, as an instant. Fixed 24h-day math
// is exact because Argentina observes no DST (see ADR 0002).
export function endOfSyncWindow(now: Date): Date {
  return new Date(
    startOfTodayInTimezone(now).getTime() + SYNC_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );
}

// Calendar year + month (1-12) of an instant, read in the sheet timezone.
function zonedYearMonth(instant: Date): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(instant);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  return { year, month };
}

// True when (year, month) is strictly before the Local/Visitante cutover.
function isBeforeCutover(year: number, month: number): boolean {
  return (
    year < FORMAT_CUTOVER.year ||
    (year === FORMAT_CUTOVER.year && month < FORMAT_CUTOVER.month)
  );
}

// Every month tab the rolling window touches (1-3), as "<MesEs> <YY>".
// Derived from the same tz boundaries as the entry filter so the two agree.
// Tabs before the format cutover (old "Partido" column) are excluded.
export function resolveSyncTabs(now: Date): string[] {
  const start = zonedYearMonth(startOfTodayInTimezone(now));
  const end = zonedYearMonth(endOfSyncWindow(now));

  const tabs: string[] = [];
  let { year, month } = start;
  while (year < end.year || (year === end.year && month <= end.month)) {
    if (!isBeforeCutover(year, month)) {
      const monthName = MONTH_NAMES[month - 1];
      const yearSuffix = String(year % 100).padStart(2, "0");
      tabs.push(`${monthName} ${yearSuffix}`);
    }
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return tabs;
}

// --- delta helpers ---

function tripleKey(home: string, away: string, kickoffIso: string) {
  return `${normalizeText(home)}|${normalizeText(away)}|${new Date(kickoffIso).getTime()}`;
}

// Postgres unique_violation; surfaced by supabase-js on the error `code`.
function isUniqueViolation(error: unknown): boolean {
  return Boolean(error) && (error as { code?: string }).code === "23505";
}

function nullableText(value: string | null | undefined) {
  const trimmed = (value ?? "").trim();
  return trimmed ? trimmed : null;
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
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("grid_sync_runs")
    .select("*")
    .eq("status", "success")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[grid-sync] failed to read last successful run", error);
    return null;
  }

  // Admin client (supabase-js 2.98.0) does not expand `select("*")` row types;
  // cast to the concrete Row, matching the codebase pattern (platform-access.ts).
  return (data as SyncRunRow | null) ?? null;
}

export async function runGridSync(trigger: GridSyncTrigger): Promise<GridSyncResult> {
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
  const supabase = createSupabaseAdminClient();

  try {
    // 1. Fetch + parse tabs (missing/future tabs are skipped, not fatal).
    const entries: SheetEntry[] = [];
    for (const tabName of resolveSyncTabs(now)) {
      try {
        const csvSource = await fetchTabCsv(tabName);
        const tabEntries = parseTab(tabName, csvSource);
        entries.push(...tabEntries);
        result.tabsSynced.push(tabName);
      } catch {
        result.tabsMissing.push(tabName);
      }
    }

    // Only touch matches inside the rolling window [today, today + 30d):
    // drop past entries and anything beyond the horizon so the sync neither
    // creates, updates, nor rewrites assignments for them.
    const windowStart = startOfTodayInTimezone(now).getTime();
    const windowEnd = endOfSyncWindow(now).getTime();
    const windowEntries = entries.filter((entry) => {
      const kickoff = new Date(entry.match.kickoff_at).getTime();
      return kickoff >= windowStart && kickoff < windowEnd;
    });
    entries.length = 0;
    entries.push(...windowEntries);

    // Ids of every match created or matched while processing in-window entries.
    // The delete pass treats any in-window match NOT in this set as removed.
    const touchedMatchIds = new Set<string>();

    if (entries.length) {
      // 2. Preload existing matches in the synced kickoff window.
      const kickoffs = entries.map((entry) => new Date(entry.match.kickoff_at).getTime());
      const minKickoff = new Date(Math.min(...kickoffs)).toISOString();
      const maxKickoff = new Date(Math.max(...kickoffs)).toISOString();

      const matchesQuery = await supabase
        .from("matches")
        .select("*")
        .gte("kickoff_at", minKickoff)
        .lte("kickoff_at", maxKickoff);

      if (matchesQuery.error) {
        throw matchesQuery.error;
      }

      const windowMatches = (matchesQuery.data ?? []) as MatchRow[];

      // The dedup key (external_match_id) is global, not window-bound: a match
      // can be rescheduled out of the window or already live from a prior sync.
      // Load every match that carries an id so a re-sync always UPDATES the same
      // row instead of inserting a duplicate.
      const externalMatchesQuery = await supabase
        .from("matches")
        .select("*")
        .not("external_match_id", "is", null);

      if (externalMatchesQuery.error) {
        throw externalMatchesQuery.error;
      }

      const externalMatches = (externalMatchesQuery.data ?? []) as MatchRow[];

      const matchByExternalId = new Map<string, MatchRow>();
      for (const match of externalMatches) {
        if (match.external_match_id) {
          matchByExternalId.set(match.external_match_id, match);
        }
      }

      // Every external id already in the DB. New inserts check this set so a
      // colliding id is rejected per-entry (others in the run still save).
      const seenExternalIds = new Set<string>(matchByExternalId.keys());

      const matchByTriple = new Map<string, MatchRow>();
      for (const match of windowMatches) {
        matchByTriple.set(tripleKey(match.home_team, match.away_team, match.kickoff_at), match);
      }

      // 3. Preload assignments for those matches (managed roles filtered later).
      const assignmentsByMatch = new Map<string, AssignmentRow[]>();
      const matchIds = Array.from(
        new Set([...windowMatches, ...externalMatches].map((match) => match.id)),
      );
      for (const idChunk of chunk(matchIds, 300)) {
        const assignmentsQuery = await supabase
          .from("assignments")
          .select("*")
          .in("match_id", idChunk);

        if (assignmentsQuery.error) {
          throw assignmentsQuery.error;
        }

        for (const assignment of (assignmentsQuery.data ?? []) as AssignmentRow[]) {
          const list = assignmentsByMatch.get(assignment.match_id) ?? [];
          list.push(assignment);
          assignmentsByMatch.set(assignment.match_id, list);
        }
      }

      // 4. Preload sheet-managed roles (name -> id) and the managed id set.
      const rolesQuery = await supabase
        .from("roles")
        .select("id, name")
        .in("name", SHEET_MANAGED_ROLE_NAMES);

      if (rolesQuery.error) {
        throw rolesQuery.error;
      }

      const roleIdByName = new Map<string, string>();
      const managedRoleIds = new Set<string>();
      for (const role of rolesQuery.data ?? []) {
        roleIdByName.set(role.name, role.id);
        managedRoleIds.add(role.id);
      }

      // 5. Preload people, keyed by normalized name (matches people-import dedupe).
      const peopleQuery = await supabase.from("people").select("id, full_name");
      if (peopleQuery.error) {
        throw peopleQuery.error;
      }

      const personIdByName = new Map<string, string>();
      for (const person of peopleQuery.data ?? []) {
        const key = normalizeText(person.full_name);
        if (key && !personIdByName.has(key)) {
          personIdByName.set(key, person.id);
        }
      }

      const getOrCreatePerson = async (fullName: string): Promise<string | null> => {
        const name = fullName.trim();
        if (!name) {
          return null;
        }

        const key = normalizeText(name);
        const cached = personIdByName.get(key);
        if (cached) {
          return cached;
        }

        const created = await supabase
          .from("people")
          .insert({ full_name: name, active: true })
          .select("id")
          .single();

        if (created.error) {
          throw created.error;
        }

        personIdByName.set(key, created.data.id);
        result.peopleCreated += 1;
        return created.data.id;
      };

      // 6. Per-entry delta.
      for (const entry of entries) {
        try {
          const ownerId = await getOrCreatePerson(entry.responsable);
          const sheet = entry.match;
          const isPast = new Date(sheet.kickoff_at).getTime() < now.getTime();

          const existing =
            (sheet.external_match_id
              ? matchByExternalId.get(sheet.external_match_id)
              : undefined) ??
            matchByTriple.get(tripleKey(sheet.home_team, sheet.away_team, sheet.kickoff_at));

          let matchId: string;

          if (!existing) {
            const externalId = sheet.external_match_id;

            // Reject an id that already lives in the DB or was used earlier in
            // this same run. The throw is caught per-entry below, so the rest of
            // the sync keeps saving.
            if (externalId && seenExternalIds.has(externalId)) {
              throw new Error(
                `El ID "${externalId}" ya existe en la base de datos. Probá con otro.`,
              );
            }

            const insert = await supabase
              .from("matches")
              .insert({
                competition: sheet.competition,
                production_mode: sheet.production_mode,
                home_team: sheet.home_team,
                away_team: sheet.away_team,
                kickoff_at: sheet.kickoff_at,
                duration_minutes: sheet.duration_minutes,
                timezone: sheet.timezone,
                external_match_id: sheet.external_match_id,
                commentary_plan: sheet.commentary_plan,
                transport: sheet.transport,
                notes: sheet.notes,
                owner_id: ownerId,
                status: (isPast ? "Realizado" : "Pendiente") satisfies MatchStatus,
              })
              .select("id")
              .single();

            if (insert.error) {
              // DB unique-index backstop (race or pre-existing duplicate).
              if (isUniqueViolation(insert.error) && externalId) {
                throw new Error(
                  `El ID "${externalId}" ya existe en la base de datos. Probá con otro.`,
                );
              }
              throw insert.error;
            }

            matchId = insert.data.id;
            if (externalId) {
              seenExternalIds.add(externalId);
            }
            result.created += 1;
          } else {
            matchId = existing.id;

            // Sheet owns roster fields; compare instant-wise for kickoff.
            const changed: Database["public"]["Tables"]["matches"]["Update"] = {};
            if (nullableText(existing.competition) !== nullableText(sheet.competition)) {
              changed.competition = sheet.competition;
            }
            if (nullableText(existing.production_mode) !== nullableText(sheet.production_mode)) {
              changed.production_mode = sheet.production_mode;
            }
            if (existing.home_team !== sheet.home_team) {
              changed.home_team = sheet.home_team;
            }
            if (existing.away_team !== sheet.away_team) {
              changed.away_team = sheet.away_team;
            }
            if (new Date(existing.kickoff_at).getTime() !== new Date(sheet.kickoff_at).getTime()) {
              changed.kickoff_at = sheet.kickoff_at;
            }
            if (nullableText(existing.external_match_id) !== nullableText(sheet.external_match_id)) {
              changed.external_match_id = sheet.external_match_id;
            }
            if (nullableText(existing.commentary_plan) !== nullableText(sheet.commentary_plan)) {
              changed.commentary_plan = sheet.commentary_plan;
            }
            if (nullableText(existing.transport) !== nullableText(sheet.transport)) {
              changed.transport = sheet.transport;
            }
            if (nullableText(existing.notes) !== nullableText(sheet.notes)) {
              changed.notes = sheet.notes;
            }
            if ((existing.owner_id ?? null) !== (ownerId ?? null)) {
              changed.owner_id = ownerId;
            }

            // Status is app-owned: never overwrite a manual "Confirmado";
            // otherwise reflect time (past -> Realizado, future -> Pendiente).
            if (existing.status !== "Confirmado") {
              const desiredStatus: MatchStatus = isPast ? "Realizado" : "Pendiente";
              if (existing.status !== desiredStatus) {
                changed.status = desiredStatus;
              }
            }

            if (Object.keys(changed).length) {
              changed.updated_at = now.toISOString();
              const update = await supabase.from("matches").update(changed).eq("id", matchId);
              if (update.error) {
                throw update.error;
              }
              result.updated += 1;
            } else {
              result.unchanged += 1;
            }
          }

          touchedMatchIds.add(matchId);

          // Assignment delta — mirror sheet within sheet-managed roles only.
          const desired = new Map<string, string>();
          for (const assignment of entry.assignments) {
            const roleId = roleIdByName.get(assignment.roleName);
            if (!roleId) {
              result.errors.push(`Rol "${assignment.roleName}" no existe; asignación omitida.`);
              continue;
            }
            const personId = await getOrCreatePerson(assignment.personName);
            if (personId) {
              desired.set(roleId, personId);
            }
          }

          const existingAssignments = (assignmentsByMatch.get(matchId) ?? []).filter((row) =>
            managedRoleIds.has(row.role_id),
          );
          const existingByRole = new Map<string, AssignmentRow>();
          for (const row of existingAssignments) {
            existingByRole.set(row.role_id, row);
          }

          for (const [roleId, personId] of desired) {
            const current = existingByRole.get(roleId);
            if (!current || current.person_id !== personId) {
              const upsert = await supabase.from("assignments").upsert(
                {
                  match_id: matchId,
                  role_id: roleId,
                  person_id: personId,
                  confirmed: false,
                  notes: null,
                },
                { onConflict: "match_id,role_id" },
              );
              if (upsert.error) {
                throw upsert.error;
              }
              result.assignmentsUpserted += 1;
            }
          }

          for (const row of existingAssignments) {
            if (!desired.has(row.role_id)) {
              const remove = await supabase.from("assignments").delete().eq("id", row.id);
              if (remove.error) {
                throw remove.error;
              }
              result.assignmentsDeleted += 1;
            }
          }
        } catch (entryError) {
          result.errors.push(
            `${entry.match.home_team} vs ${entry.match.away_team}: ${
              entryError instanceof Error ? entryError.message : String(entryError)
            }`,
          );
        }
      }
    }

    // 7. Delete pass — hard-remove in-window matches that vanished from the
    // sheet. Clean-run-only: a missing tab or a per-entry error makes a still
    // present match look "removed", so skip the entire pass in that case.
    // Runs even when entries.length === 0 (a legitimately emptied but
    // successfully-fetched month must still purge its window matches).
    if (result.tabsMissing.length === 0 && result.errors.length === 0) {
      const windowStartIso = new Date(windowStart).toISOString();
      const windowEndIso = new Date(windowEnd).toISOString();

      // Dedicated full-window select — the entries-derived min/max range is
      // empty on a zero-entry run, so this must not reuse it.
      const candidatesQuery = await supabase
        .from("matches")
        .select("id, home_team, away_team, kickoff_at")
        .gte("kickoff_at", windowStartIso)
        .lt("kickoff_at", windowEndIso);

      if (candidatesQuery.error) {
        // A failed candidate read must not abort a run that already saved.
        result.errors.push(candidatesQuery.error.message);
      } else {
        // Only months actually covered by a synced tab are eligible: a window
        // month with no tab coverage (e.g. pre-cutover) is not "missing", so
        // its matches must never be deleted.
        const coveredMonths = new Set<string>();
        for (const tabName of result.tabsSynced) {
          const { year, month } = parseTabPeriod(tabName);
          coveredMonths.add(`${year}-${month}`);
        }

        type CandidateRow = Pick<
          MatchRow,
          "id" | "home_team" | "away_team" | "kickoff_at"
        >;
        const candidates = (candidatesQuery.data ?? []) as CandidateRow[];

        const deletable = candidates.filter((match) => {
          if (touchedMatchIds.has(match.id)) {
            return false;
          }
          const { year, month } = zonedYearMonth(new Date(match.kickoff_at));
          return coveredMonths.has(`${year}-${month}`);
        });

        const deletedLabels: string[] = [];
        for (const rowChunk of chunk(deletable, 300)) {
          const remove = await supabase
            .from("matches")
            .delete()
            .in(
              "id",
              rowChunk.map((match) => match.id),
            );
          if (remove.error) {
            // Error-tolerant: a delete failure must not abort a run that
            // already created/updated successfully.
            result.errors.push(remove.error.message);
            continue;
          }
          result.deleted += rowChunk.length;
          for (const match of rowChunk) {
            deletedLabels.push(
              `${match.home_team} vs ${match.away_team} @ ${match.kickoff_at}`,
            );
          }
        }

        // Only forensic trail: the match's audit_log rows cascade away with it,
        // so the delete leaves no audit record.
        if (deletedLabels.length) {
          console.info("[grid-sync] deleted:", deletedLabels);
        }
      }
    }

    await supabase.from("grid_sync_runs").insert({
      trigger,
      status: "success",
      created_count: result.created,
      updated_count: result.updated,
      skipped_count: result.unchanged,
      deleted_count: result.deleted,
      assignments_upserted: result.assignmentsUpserted,
      assignments_deleted: result.assignmentsDeleted,
      people_created: result.peopleCreated,
      error: result.errors.length ? result.errors.join("\n") : null,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
    });

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    result.errors.push(message);

    await supabase.from("grid_sync_runs").insert({
      trigger,
      status: "error",
      created_count: result.created,
      updated_count: result.updated,
      skipped_count: result.unchanged,
      deleted_count: result.deleted,
      assignments_upserted: result.assignmentsUpserted,
      assignments_deleted: result.assignmentsDeleted,
      people_created: result.peopleCreated,
      error: message,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
    });

    throw error;
  } finally {
    running = false;
  }
}
