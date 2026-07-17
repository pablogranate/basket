#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { parse } from "csv-parse/sync";
import { fromZonedTime } from "date-fns-tz";
import dotenv from "dotenv";

import { connectDb } from "./db.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "../..");

dotenv.config({ path: path.join(ROOT_DIR, ".env.local") });
dotenv.config({ path: path.join(ROOT_DIR, ".env") });

const SHEET_ID = "18Zqlayhde5XpOehkXOa1FKtaBSXhDGDfvqMvstT5Rm8";
const SHEET_TABS = ["Mayo 26", "Junio 26"];
const TIMEZONE = "America/Argentina/Buenos_Aires";
const DEFAULT_DURATION_MINUTES = 150;

const MONTHS = {
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

const ROLE_COLUMN_MAP = {
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

const FIELD_COLUMNS = [
  "produccion",
  "id",
  "liga",
  "partido",
  "hora",
  "relatos/comentarios",
  "transporte",
  "observacion",
];

function normalizeHeader(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
}

function parseTabPeriod(tabName) {
  const parts = tabName.trim().split(/\s+/);
  const month = MONTHS[normalizeHeader(parts[0])];
  const year = 2000 + Number(parts[1]);

  if (!month || Number.isNaN(year)) {
    throw new Error(`No se pudo interpretar mes/año de la pestaña "${tabName}".`);
  }

  return { month, year };
}

function parseDayMarker(value) {
  const match = String(value ?? "")
    .trim()
    .match(/(\d{1,2})\s*$/);
  return match ? Number(match[1]) : null;
}

function parseTeams(matchText) {
  const text = String(matchText ?? "").trim();
  if (!text) {
    return { home: "", away: "" };
  }

  const parts = text.split(/\s+vs\.?\s+/i);
  if (parts.length >= 2) {
    return {
      home: parts[0].trim(),
      away: parts.slice(1).join(" vs ").trim(),
    };
  }

  return { home: text, away: text };
}

function toKickoffAt({ year, month, day, time }) {
  const normalizedTime = /^\d{1,2}:\d{2}$/.test(time) ? time.padStart(5, "0") : "00:00";
  const monthValue = String(month).padStart(2, "0");
  const dayValue = String(day).padStart(2, "0");
  const localDateTime = `${year}-${monthValue}-${dayValue}T${normalizedTime}:00`;
  return fromZonedTime(localDateTime, TIMEZONE).toISOString();
}

function buildNotes(observacion, transporte) {
  return [observacion, transporte].map((value) => value.trim()).filter(Boolean).join("\n") || null;
}

async function fetchTabCsv(tabName) {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tabName)}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Fallo la descarga de la pestaña "${tabName}" (HTTP ${response.status}).`);
  }

  return response.text();
}

function parseTab(tabName, csvSource) {
  const { month, year } = parseTabPeriod(tabName);
  const rows = parse(csvSource, { relax_column_count: true });

  if (!rows.length) {
    return [];
  }

  const headers = rows[0].map(normalizeHeader);
  const columnIndex = new Map();

  headers.forEach((header, index) => {
    if (!columnIndex.has(header)) {
      columnIndex.set(header, index);
    }
  });

  const readCell = (row, header) => {
    const index = columnIndex.get(header);
    return index === undefined ? "" : String(row[index] ?? "").trim();
  };

  let currentDay = parseDayMarker(rows[0][0]);
  const entries = [];

  for (const row of rows.slice(1)) {
    const dayMarker = parseDayMarker(row[0]);
    if (dayMarker) {
      currentDay = dayMarker;
    }

    const matchText = readCell(row, "partido");
    if (!matchText) {
      continue;
    }

    if (!currentDay) {
      console.warn(`[grilla] fila sin día asignado en "${tabName}", ignorada:`, matchText);
      continue;
    }

    const { home, away } = parseTeams(matchText);
    const kickoffAt = toKickoffAt({ year, month, day: currentDay, time: readCell(row, "hora") });

    const assignments = [];
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
        production_code: readCell(row, "id") || null,
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

async function getOrCreatePerson(sql, peopleCache, fullName) {
  const name = String(fullName ?? "").trim();
  if (!name) {
    return null;
  }

  if (peopleCache.has(name)) {
    return peopleCache.get(name);
  }

  const [existing] = await sql`
    SELECT id FROM people WHERE full_name = ${name} LIMIT 1
  `;

  if (existing?.id) {
    peopleCache.set(name, existing.id);
    return existing.id;
  }

  const [created] = await sql`
    INSERT INTO people ${sql({ full_name: name, active: true })}
    RETURNING id
  `;

  peopleCache.set(name, created.id);
  return created.id;
}

async function getRoleId(sql, rolesCache, roleName) {
  if (rolesCache.has(roleName)) {
    return rolesCache.get(roleName);
  }

  const [existing] = await sql`
    SELECT id FROM roles WHERE name = ${roleName} LIMIT 1
  `;

  if (!existing?.id) {
    throw new Error(`Rol "${roleName}" no existe en la base. Crealo antes de importar.`);
  }

  rolesCache.set(roleName, existing.id);
  return existing.id;
}

async function upsertMatch(sql, payload) {
  const [existing] = await sql`
    SELECT id FROM matches
    WHERE home_team = ${payload.home_team}
      AND away_team = ${payload.away_team}
      AND kickoff_at = ${payload.kickoff_at}
    LIMIT 1
  `;

  if (existing?.id) {
    // App owns updated_at now that the metadata trigger is gone.
    const [updated] = await sql`
      UPDATE matches
      SET ${sql({ ...payload, updated_at: new Date().toISOString() })}
      WHERE id = ${existing.id}
      RETURNING id
    `;

    return { id: updated.id, created: false };
  }

  const [created] = await sql`
    INSERT INTO matches ${sql(payload)}
    RETURNING id
  `;

  return { id: created.id, created: true };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  if (!process.env.DATABASE_URL) {
    console.error("Falta DATABASE_URL en el entorno.");
    process.exit(1);
  }

  const now = new Date();
  const entries = [];

  for (const tabName of SHEET_TABS) {
    const csvSource = await fetchTabCsv(tabName);
    const tabEntries = parseTab(tabName, csvSource);
    console.info(`[grilla] pestaña "${tabName}": ${tabEntries.length} partidos detectados.`);
    entries.push(...tabEntries);
  }

  for (const entry of entries) {
    entry.match.status = new Date(entry.match.kickoff_at) < now ? "Realizado" : "Pendiente";
  }

  if (dryRun) {
    for (const entry of entries) {
      const { match } = entry;
      console.log(
        [
          match.kickoff_at,
          match.status,
          match.production_code ?? "-",
          match.competition ?? "-",
          `${match.home_team} vs ${match.away_team}`,
          `${entry.assignments.length} asignaciones`,
        ].join(" | "),
      );
    }
    console.log(`\nDry run: ${entries.length} partidos, sin escribir en la base.`);
    return;
  }

  const sql = connectDb();

  const peopleCache = new Map();
  const rolesCache = new Map();
  let createdMatches = 0;
  let updatedMatches = 0;
  let upsertedAssignments = 0;

  for (const entry of entries) {
    const ownerId = await getOrCreatePerson(sql, peopleCache, entry.responsable);
    const match = await upsertMatch(sql, { ...entry.match, owner_id: ownerId });

    if (match.created) {
      createdMatches += 1;
    } else {
      updatedMatches += 1;
    }

    for (const assignment of entry.assignments) {
      const roleId = await getRoleId(sql, rolesCache, assignment.roleName);
      const personId = await getOrCreatePerson(sql, peopleCache, assignment.personName);

      if (!roleId || !personId) {
        continue;
      }

      // App owns updated_at on the conflict-update path (trigger dropped).
      await sql`
        INSERT INTO assignments ${sql({
          match_id: match.id,
          role_id: roleId,
          person_id: personId,
          confirmed: false,
          notes: null,
        })}
        ON CONFLICT (match_id, role_id) DO UPDATE SET
          person_id = excluded.person_id,
          confirmed = excluded.confirmed,
          notes = excluded.notes,
          updated_at = ${new Date().toISOString()}
      `;

      upsertedAssignments += 1;
    }
  }

  await sql.end();

  console.log(`Importacion de grilla terminada:
- partidos creados: ${createdMatches}
- partidos actualizados: ${updatedMatches}
- asignaciones upsertadas: ${upsertedAssignments}`);
}

main().catch((error) => {
  console.error("Importacion de grilla fallida:", error);
  process.exit(1);
});
