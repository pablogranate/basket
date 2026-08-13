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
import type { PeopleSyncPreview } from "@/lib/people/sync-preview";
import { normalizeText } from "@/lib/utils";

export type { PeopleSyncPreview };

const SHEET_ID = "18Zqlayhde5XpOehkXOa1FKtaBSXhDGDfvqMvstT5Rm8";
const CONTACTS_TAB = "Contactos Portal";

// Internal staff. The sheet is the roster for externos, not for the company:
// a @basquetpass.tv person absent from the tab is left alone. The only way to
// remove them is the people UI. No volume/ratio brake beyond this — the
// confirmation modal (previewPeopleSync) is what guards a mistyped tab.
const PROTECTED_EMAIL_DOMAIN = "@basquetpass.tv";

export function isProtectedFromSyncDelete(email: string | null | undefined) {
  return (email ?? "").trim().toLowerCase().endsWith(PROTECTED_EMAIL_DOMAIN);
}

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

type PersonRow = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  deleted_at: string | null;
};

type PlannedUpdate = {
  sheet: SheetPerson;
  existing: PersonRow;
  isRestore: boolean;
  fieldChanges: Partial<typeof peopleTable.$inferInsert>;
  changeLabels: string[];
  functionsChanged: boolean;
  teamsChanged: boolean;
};

type PeopleSyncPlan = {
  creates: SheetPerson[];
  updates: PlannedUpdate[];
  deletes: PersonRow[];
  protectedFromDelete: PersonRow[];
  unchanged: number;
  warnings: string[];
  skippedRows: number;
  profileByEmail: Map<string, { id: string; role: string }>;
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

// Reads the sheet and the roster and diffs them without writing anything.
// Both the confirmation modal and the run itself go through here, so what the
// operator confirms is exactly what the apply step executes.
async function buildPeopleSyncPlan(): Promise<PeopleSyncPlan> {
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

  // 3. Preload people (incl. soft-deleted, so names resurrect instead of
  //    duplicating), their functions and teams, and all profiles.
  const peopleRows: PersonRow[] = await db
    .select({
      id: peopleTable.id,
      full_name: peopleTable.fullName,
      phone: peopleTable.phone,
      email: peopleTable.email,
      deleted_at: peopleTable.deletedAt,
    })
    .from(peopleTable);

  const personByName = new Map<string, PersonRow>();
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

  const profileByEmail = new Map<string, { id: string; role: string }>();
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

  // 4. Diff sheet rows against the roster.
  const creates: SheetPerson[] = [];
  const updates: PlannedUpdate[] = [];
  let unchanged = 0;

  for (const sheetPerson of sheet.people) {
    const existing = personByName.get(normalizeText(sheetPerson.fullName));

    if (!existing) {
      creates.push(sheetPerson);
      continue;
    }

    const isRestore = Boolean(existing.deleted_at);
    const fieldChanges: Partial<typeof peopleTable.$inferInsert> = {};
    const changeLabels: string[] = [];

    if (existing.full_name !== sheetPerson.fullName) {
      fieldChanges.fullName = sheetPerson.fullName;
      changeLabels.push("nombre");
    }
    if (nullableText(existing.phone) !== sheetPerson.phone) {
      fieldChanges.phone = sheetPerson.phone;
      changeLabels.push("teléfono");
    }
    if (nullableText(existing.email) !== sheetPerson.email) {
      fieldChanges.email = sheetPerson.email;
      changeLabels.push("correo");
    }

    const functionsChanged = !sameSet(
      sheetPerson.functions,
      functionsByPerson.get(existing.id) ?? new Set<string>(),
    );
    if (functionsChanged) {
      changeLabels.push("funciones");
    }

    const teamsChanged = !sameSet(
      sheetPerson.teamIds,
      teamsByPerson.get(existing.id) ?? new Set<string>(),
    );
    if (teamsChanged) {
      changeLabels.push("clubes");
    }

    if (
      !isRestore &&
      !changeLabels.length
    ) {
      unchanged += 1;
      continue;
    }

    updates.push({
      sheet: sheetPerson,
      existing,
      isRestore,
      fieldChanges,
      changeLabels,
      functionsChanged,
      teamsChanged,
    });
  }

  // 5. Live people missing from the tab are removals — except internal staff,
  //    who are only ever removed from the people UI.
  const sheetNameKeys = new Set(
    sheet.people.map((person) => normalizeText(person.fullName)),
  );
  const missing = peopleRows.filter(
    (person) =>
      !person.deleted_at && !sheetNameKeys.has(normalizeText(person.full_name)),
  );

  return {
    creates,
    updates,
    deletes: missing.filter((person) => !isProtectedFromSyncDelete(person.email)),
    protectedFromDelete: missing.filter((person) =>
      isProtectedFromSyncDelete(person.email),
    ),
    unchanged,
    warnings: sheet.warnings,
    skippedRows: sheet.skippedRows,
    profileByEmail,
  };
}

export async function previewPeopleSync(): Promise<PeopleSyncPreview> {
  const plan = await buildPeopleSyncPlan();

  return {
    created: plan.creates.map((person) => person.fullName),
    updated: plan.updates.map((update) => ({
      name: update.sheet.fullName,
      changes: update.changeLabels,
      restored: update.isRestore,
    })),
    deleted: plan.deletes.map((person) => person.full_name),
    protected: plan.protectedFromDelete.map((person) => person.full_name),
    unchanged: plan.unchanged,
    skippedRows: plan.skippedRows,
    warnings: plan.warnings,
  };
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
    const plan = await buildPeopleSyncPlan();

    result.warnings.push(...plan.warnings);
    result.skippedRows = plan.skippedRows;
    result.unchanged = plan.unchanged;

    const { profileByEmail } = plan;

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
    // access decision). Internal staff never reach this path: they are filtered
    // out of the plan's delete list.
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

    // 1. Insert people the tab has and the roster does not.
    for (const sheetPerson of plan.creates) {
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

      result.created += 1;
    }

    // 2. Apply the planned field/function/club changes and restorations.
    for (const update of plan.updates) {
      const { sheet: sheetPerson, existing, isRestore } = update;
      const fields: Partial<typeof peopleTable.$inferInsert> = {
        ...update.fieldChanges,
      };
      if (isRestore) {
        fields.deletedAt = null;
      }

      if (Object.keys(fields).length) {
        fields.updatedAt = nowIso;
        await db
          .update(peopleTable)
          .set(fields)
          .where(eq(peopleTable.id, existing.id));
      }

      if (update.functionsChanged) {
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

      if (update.teamsChanged) {
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
      } else {
        result.updated += 1;
      }
    }

    // 3. Soft-delete live people no longer in the tab + revoke their access.
    for (const person of plan.deletes) {
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
