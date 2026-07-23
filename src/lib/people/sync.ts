import "server-only";

import { parse } from "csv-parse/sync";
import { desc, eq } from "drizzle-orm";

import { clearProfileCache } from "@/lib/auth";
import { db } from "@/lib/db/client";
import {
  people as peopleTable,
  peopleTeams as peopleTeamsTable,
  peopleSyncRuns as peopleSyncRunsTable,
  personFunctions as personFunctionsTable,
  profiles as profilesTable,
  teams as teamsTable,
} from "@/lib/db/schema";
import type { AppRole } from "@/lib/database.types";
import {
  isPersonFunctionKey,
  resolveFunctionKey,
  roleNameToFunctionKey,
  type PersonFunctionKey,
} from "@/lib/functions";
import { normalizeText } from "@/lib/utils";

const SHEET_ID = "18Zqlayhde5XpOehkXOa1FKtaBSXhDGDfvqMvstT5Rm8";
const CONTACTS_TAB = "Contactos";

// A run that would soft-delete more than this share of the live roster is
// aborted with zero mutations — a blanked or misnamed tab must never wipe
// everyone in one click. A legitimately emptied tab (0 rows) trips this too.
const MAX_DELETE_RATIO = 0.5;

// Externo tier for sheet-provisioned logins; admins re-tier from the people UI.
const EXTERNO_ROLE: AppRole = "collaborator";

export type PeopleSyncTrigger = "manual";

export type PeopleSyncResult = {
  trigger: PeopleSyncTrigger;
  status: "success" | "error";
  skipped: boolean;
  reason: string | null;
  created: number;
  updated: number;
  unchanged: number;
  deleted: number;
  restored: number;
  skippedRows: number;
  warnings: string[];
  error: string | null;
};

type SheetPerson = {
  fullName: string;
  phone: string | null;
  email: string | null;
  functions: PersonFunctionKey[];
  teamIds: string[];
};

// --- parsing helpers (mirror src/lib/grid/sync.ts) ---

function normalizeHeader(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
}

function nullableText(value: string | null | undefined) {
  const trimmed = (value ?? "").trim();
  return trimmed ? trimmed : null;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  const message = (error as { message?: unknown } | null)?.message;
  return typeof message === "string" && message ? message : String(error);
}

function resolvePersonFunction(raw: string): PersonFunctionKey | null {
  const value = raw.trim();
  if (!value) {
    return null;
  }
  if (isPersonFunctionKey(value)) {
    return value;
  }
  return roleNameToFunctionKey(value) ?? resolveFunctionKey(value);
}

function splitCell(value: string): string[] {
  return value
    .split(/[,;]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

async function fetchTabCsv(tabName: string) {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tabName)}`;
  const response = await fetch(url, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(
      `Fallo la descarga de la pestaña "${tabName}" (HTTP ${response.status}).`,
    );
  }

  return response.text();
}

// Parses the Contactos tab into deduped people plus per-row warnings. Team names
// resolve against `teamIdByName`; unknown función/club values are skipped with a
// warning rather than failing the row. Duplicate normalized names are dropped
// (both rows) because the sheet cannot say which one is authoritative.
function parseContactsTab(
  csvSource: string,
  teamIdByName: Map<string, string>,
): { people: SheetPerson[]; warnings: string[]; skippedRows: number } {
  const rows = parse(csvSource, { relax_column_count: true }) as string[][];
  const warnings: string[] = [];
  let skippedRows = 0;

  if (!rows.length) {
    return { people: [], warnings, skippedRows };
  }

  const headers = rows[0].map(normalizeHeader);
  const columnIndex = new Map<string, number>();
  headers.forEach((header, index) => {
    if (!columnIndex.has(header)) {
      columnIndex.set(header, index);
    }
  });

  const readCell = (row: string[], ...aliases: string[]) => {
    for (const alias of aliases) {
      const index = columnIndex.get(alias);
      if (index !== undefined) {
        return String(row[index] ?? "").trim();
      }
    }
    return "";
  };

  const parsed: SheetPerson[] = [];
  const seen = new Map<string, number>();

  for (const row of rows.slice(1)) {
    const fullName = readCell(row, "nombre");
    if (!fullName) {
      continue; // blank Nombre → skipped silently (spacer/empty rows).
    }

    const key = normalizeText(fullName);
    seen.set(key, (seen.get(key) ?? 0) + 1);

    const functions = new Set<PersonFunctionKey>();
    for (const value of splitCell(readCell(row, "funcion", "funciones", "rol"))) {
      const resolved = resolvePersonFunction(value);
      if (resolved) {
        functions.add(resolved);
      } else {
        warnings.push(`Función desconocida "${value}" (${fullName}); se omitió.`);
      }
    }

    const teamIds = new Set<string>();
    for (const value of splitCell(readCell(row, "club", "clubes", "equipo"))) {
      const teamId = teamIdByName.get(normalizeText(value));
      if (teamId) {
        teamIds.add(teamId);
      } else {
        warnings.push(`Club desconocido "${value}" (${fullName}); se omitió.`);
      }
    }

    parsed.push({
      fullName,
      phone: nullableText(readCell(row, "telefono", "celular", "movil")),
      email: nullableText(readCell(row, "correo", "email", "mail")),
      functions: Array.from(functions),
      teamIds: Array.from(teamIds),
    });
  }

  // Drop every row whose normalized name repeats in the tab.
  const duplicates = new Set<string>();
  for (const [key, count] of seen) {
    if (count > 1) {
      duplicates.add(key);
    }
  }

  const deduped = parsed.filter((person) => {
    if (duplicates.has(normalizeText(person.fullName))) {
      skippedRows += 1;
      return false;
    }
    return true;
  });

  for (const person of parsed) {
    if (duplicates.has(normalizeText(person.fullName))) {
      duplicates.delete(normalizeText(person.fullName)); // one warning per name
      warnings.push(
        `"${person.fullName}" está repetido en la pestaña; esas filas no se sincronizaron.`,
      );
    }
  }

  return { people: deduped, warnings, skippedRows };
}

function sameSet(a: string[], b: Set<string>): boolean {
  if (a.length !== b.size) {
    return false;
  }
  return a.every((value) => b.has(value));
}

// In-memory guard: only one people sync runs at a time inside a process.
let running = false;

export async function getLastPeopleSync() {
  try {
    const rows = await db
      .select({
        status: peopleSyncRunsTable.status,
        started_at: peopleSyncRunsTable.startedAt,
      })
      .from(peopleSyncRunsTable)
      .where(eq(peopleSyncRunsTable.status, "success"))
      .orderBy(desc(peopleSyncRunsTable.startedAt))
      .limit(1);

    return rows[0] ?? null;
  } catch (error) {
    console.error("[people-sync] failed to read last successful run", error);
    return null;
  }
}

export async function runPeopleSync(
  trigger: PeopleSyncTrigger,
): Promise<PeopleSyncResult> {
  const result: PeopleSyncResult = {
    trigger,
    status: "success",
    skipped: false,
    reason: null,
    created: 0,
    updated: 0,
    unchanged: 0,
    deleted: 0,
    restored: 0,
    skippedRows: 0,
    warnings: [],
    error: null,
  };

  if (running) {
    result.skipped = true;
    result.reason = "in_progress";
    return result;
  }

  running = true;
  const now = new Date();
  const startedAt = now.toISOString();
  const nowIso = now.toISOString();
  let profilesMutated = false;

  try {
    // 1. Team name -> id map (first id per normalized name, matches the people
    //    form's name-collapsed "Club" options).
    const teamRows = await db
      .select({ id: teamsTable.id, name: teamsTable.name })
      .from(teamsTable);
    const teamIdByName = new Map<string, string>();
    for (const team of teamRows) {
      const key = normalizeText(team.name);
      if (key && !teamIdByName.has(key)) {
        teamIdByName.set(key, team.id);
      }
    }

    // 2. Fetch + parse the tab. A fetch/parse failure aborts with zero
    //    mutations — a broken sheet must never delete the roster.
    let sheet: {
      people: SheetPerson[];
      warnings: string[];
      skippedRows: number;
    };
    try {
      const csvSource = await fetchTabCsv(CONTACTS_TAB);
      sheet = parseContactsTab(csvSource, teamIdByName);
    } catch (fetchError) {
      throw new Error(
        `No se pudo leer la pestaña "${CONTACTS_TAB}": ${toErrorMessage(fetchError)}`,
      );
    }

    result.warnings.push(...sheet.warnings);
    result.skippedRows = sheet.skippedRows;

    // 3. Preload people (incl. soft-deleted, so names resurrect instead of
    //    duplicating), their functions and teams, and all profiles.
    const peopleRows = await db
      .select({
        id: peopleTable.id,
        full_name: peopleTable.fullName,
        phone: peopleTable.phone,
        email: peopleTable.email,
        deleted_at: peopleTable.deletedAt,
      })
      .from(peopleTable);

    const personByName = new Map<string, (typeof peopleRows)[number]>();
    for (const person of peopleRows) {
      const key = normalizeText(person.full_name);
      if (key && !personByName.has(key)) {
        personByName.set(key, person);
      }
    }

    const functionsByPerson = new Map<string, Set<string>>();
    for (const row of await db
      .select({
        person_id: personFunctionsTable.personId,
        function_key: personFunctionsTable.functionKey,
      })
      .from(personFunctionsTable)) {
      const set = functionsByPerson.get(row.person_id) ?? new Set<string>();
      set.add(row.function_key);
      functionsByPerson.set(row.person_id, set);
    }

    const teamsByPerson = new Map<string, Set<string>>();
    for (const row of await db
      .select({
        person_id: peopleTeamsTable.personId,
        team_id: peopleTeamsTable.teamId,
      })
      .from(peopleTeamsTable)) {
      const set = teamsByPerson.get(row.person_id) ?? new Set<string>();
      set.add(row.team_id);
      teamsByPerson.set(row.person_id, set);
    }

    const profileByEmail = new Map<
      string,
      { id: string; role: string }
    >();
    for (const row of await db
      .select({
        id: profilesTable.id,
        email: profilesTable.email,
        role: profilesTable.role,
      })
      .from(profilesTable)) {
      const key = row.email?.toLowerCase();
      if (key && !profileByEmail.has(key)) {
        profileByEmail.set(key, { id: row.id, role: row.role });
      }
    }

    // Create an Externo login silently (no invite email). Leaves an existing
    // profile untouched so an admin/Productor is never downgraded by a sync.
    const grantExternoSilent = async (email: string, fullName: string) => {
      const key = email.toLowerCase();
      if (profileByEmail.has(key)) {
        return;
      }
      const id = globalThis.crypto.randomUUID();
      await db.insert(profilesTable).values({
        id,
        email,
        fullName,
        role: EXTERNO_ROLE,
        authUserId: null,
      });
      profileByEmail.set(key, { id, role: EXTERNO_ROLE });
      profilesMutated = true;
    };

    // Revoke platform access on soft delete (any tier — per the roster-owns-
    // access decision; the >50% guard protects against mass lockout).
    const revokeAccess = async (email: string) => {
      const key = email.toLowerCase();
      const profile = profileByEmail.get(key);
      if (!profile) {
        return;
      }
      await db.delete(profilesTable).where(eq(profilesTable.id, profile.id));
      profileByEmail.delete(key);
      profilesMutated = true;
    };

    // 4. Guard: abort if the run would soft-delete more than half the live
    //    roster (covers empty/misnamed tab → 100% delete).
    const sheetNameKeys = new Set(
      sheet.people.map((person) => normalizeText(person.fullName)),
    );
    const livePeople = peopleRows.filter((person) => !person.deleted_at);
    const wouldDelete = livePeople.filter(
      (person) => !sheetNameKeys.has(normalizeText(person.full_name)),
    );

    if (
      livePeople.length > 0 &&
      wouldDelete.length / livePeople.length > MAX_DELETE_RATIO
    ) {
      throw new Error(
        `La sincronización eliminaría ${wouldDelete.length} de ${livePeople.length} personas. ` +
          `Verificá la pestaña "${CONTACTS_TAB}" antes de reintentar.`,
      );
    }

    // 5. Upsert every sheet person.
    for (const sheetPerson of sheet.people) {
      const key = normalizeText(sheetPerson.fullName);
      const existing = personByName.get(key);

      if (!existing) {
        const inserted = await db
          .insert(peopleTable)
          .values({
            fullName: sheetPerson.fullName,
            phone: sheetPerson.phone,
            email: sheetPerson.email,
            active: true,
          })
          .returning({ id: peopleTable.id });
        const personId = inserted[0].id;

        if (sheetPerson.functions.length) {
          await db.insert(personFunctionsTable).values(
            sheetPerson.functions.map((functionKey) => ({
              personId,
              functionKey,
            })),
          );
        }
        if (sheetPerson.teamIds.length) {
          await db.insert(peopleTeamsTable).values(
            sheetPerson.teamIds.map((teamId) => ({ personId, teamId })),
          );
        }

        if (sheetPerson.email) {
          await grantExternoSilent(sheetPerson.email, sheetPerson.fullName);
        } else {
          result.warnings.push(
            `"${sheetPerson.fullName}" sin correo: se creó sin acceso a la plataforma.`,
          );
        }

        personByName.set(key, {
          id: personId,
          full_name: sheetPerson.fullName,
          phone: sheetPerson.phone,
          email: sheetPerson.email,
          deleted_at: null,
        });
        result.created += 1;
        continue;
      }

      const isRestore = Boolean(existing.deleted_at);
      const fields: Partial<typeof peopleTable.$inferInsert> = {};

      if (existing.full_name !== sheetPerson.fullName) {
        fields.fullName = sheetPerson.fullName;
      }
      if (nullableText(existing.phone) !== sheetPerson.phone) {
        fields.phone = sheetPerson.phone;
      }
      if (nullableText(existing.email) !== sheetPerson.email) {
        fields.email = sheetPerson.email;
      }
      if (isRestore) {
        fields.deletedAt = null;
      }

      const currentFunctions =
        functionsByPerson.get(existing.id) ?? new Set<string>();
      const functionsChanged = !sameSet(sheetPerson.functions, currentFunctions);

      const currentTeams = teamsByPerson.get(existing.id) ?? new Set<string>();
      const teamsChanged = !sameSet(sheetPerson.teamIds, currentTeams);

      const hasFieldChange = Object.keys(fields).length > 0;

      if (hasFieldChange) {
        fields.updatedAt = nowIso;
        await db
          .update(peopleTable)
          .set(fields)
          .where(eq(peopleTable.id, existing.id));
      }

      if (functionsChanged) {
        await db
          .delete(personFunctionsTable)
          .where(eq(personFunctionsTable.personId, existing.id));
        if (sheetPerson.functions.length) {
          await db.insert(personFunctionsTable).values(
            sheetPerson.functions.map((functionKey) => ({
              personId: existing.id,
              functionKey,
            })),
          );
        }
      }

      if (teamsChanged) {
        await db
          .delete(peopleTeamsTable)
          .where(eq(peopleTeamsTable.personId, existing.id));
        if (sheetPerson.teamIds.length) {
          await db.insert(peopleTeamsTable).values(
            sheetPerson.teamIds.map((teamId) => ({
              personId: existing.id,
              teamId,
            })),
          );
        }
      }

      if (isRestore) {
        // Re-grant Externo on resurrection (the profile was revoked on the
        // earlier soft delete); a live person's existing tier is left alone.
        if (sheetPerson.email) {
          await grantExternoSilent(sheetPerson.email, sheetPerson.fullName);
        } else {
          result.warnings.push(
            `"${sheetPerson.fullName}" restaurado sin correo: sin acceso a la plataforma.`,
          );
        }
        result.restored += 1;
      } else if (hasFieldChange || functionsChanged || teamsChanged) {
        result.updated += 1;
      } else {
        result.unchanged += 1;
      }
    }

    // 6. Soft-delete live people no longer in the tab + revoke their access.
    for (const person of wouldDelete) {
      await db
        .update(peopleTable)
        .set({ deletedAt: nowIso, updatedAt: nowIso })
        .where(eq(peopleTable.id, person.id));
      if (person.email) {
        await revokeAccess(person.email);
      }
      result.deleted += 1;
    }

    if (profilesMutated) {
      clearProfileCache();
    }

    await db.insert(peopleSyncRunsTable).values({
      trigger,
      status: "success",
      createdCount: result.created,
      updatedCount: result.updated,
      deletedCount: result.deleted,
      restoredCount: result.restored,
      skippedCount: result.skippedRows,
      warnings: result.warnings,
      error: null,
      startedAt,
      finishedAt: new Date().toISOString(),
    });

    return result;
  } catch (error) {
    const message = toErrorMessage(error);
    result.status = "error";
    result.error = message;

    if (profilesMutated) {
      clearProfileCache();
    }

    await db.insert(peopleSyncRunsTable).values({
      trigger,
      status: "error",
      createdCount: result.created,
      updatedCount: result.updated,
      deletedCount: result.deleted,
      restoredCount: result.restored,
      skippedCount: result.skippedRows,
      warnings: result.warnings,
      error: message,
      startedAt,
      finishedAt: new Date().toISOString(),
    });

    return result;
  } finally {
    running = false;
  }
}
