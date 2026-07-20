#!/usr/bin/env node

import fs from "node:fs/promises";
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

const RESERVED_HEADERS = new Set([
  "fecha",
  "dia",
  "día",
  "hora",
  "partido",
  "local",
  "visitante",
  "liga",
  "torneo",
  "competencia",
  "modo",
  "produccion",
  "producción",
  "estado",
  "responsable",
  "owner",
  "observaciones",
  "notas",
  "duracion",
  "duración",
  "timezone",
]);

const HEADER_ALIASES = {
  date: ["fecha", "dia", "día"],
  time: ["hora"],
  match: ["partido"],
  home: ["local"],
  away: ["visitante"],
  competition: ["liga", "torneo", "competencia"],
  mode: ["modo", "produccion", "producción"],
  status: ["estado"],
  owner: ["responsable", "owner"],
  notes: ["observaciones", "notas"],
  duration: ["duracion", "duración"],
  timezone: ["timezone"],
};

function normalizeHeader(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
}

// Mirror of normalizeText in src/lib/utils.ts, plus inner-whitespace collapse,
// so "José  Pérez" / " jose perez " resolve to the same key (dedupe).
function normalizePersonName(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// Mirror of roleNameToFunctionKey in src/lib/functions.ts: collapse the trailing
// slot index (Camara 1..5 -> Camara, Comentario 1/2 -> Comentario), else identity.
const PERSON_FUNCTIONS = [
  "Responsable",
  "Realizador",
  "Operador de Control",
  "Operador de Grafica",
  "Soporte tecnico",
  "Productor",
  "Relator",
  "Comentario",
  "Campo",
  "Encoder",
  "Ingenieria",
  "Camara",
];

function functionKeyFromRoleName(roleName) {
  const trimmed = String(roleName ?? "").trim();

  if (/^Camara\s*\d+$/i.test(trimmed)) {
    return "Camara";
  }

  if (/^Comentario\s*\d+$/i.test(trimmed)) {
    return "Comentario";
  }

  return (
    PERSON_FUNCTIONS.find((key) => key.toLowerCase() === trimmed.toLowerCase()) ??
    null
  );
}

function readField(row, aliases) {
  for (const alias of aliases) {
    if (row[alias]) {
      return String(row[alias]).trim();
    }
  }

  return "";
}

function parseTeams(row) {
  const home = readField(row, HEADER_ALIASES.home);
  const away = readField(row, HEADER_ALIASES.away);

  if (home && away) {
    return { home, away };
  }

  const matchText = readField(row, HEADER_ALIASES.match);
  if (!matchText) {
    return { home: "", away: "" };
  }

  const parts = matchText.split(/\s+vs\.?\s+|\s+-\s+|\s+v\s+/i);
  if (parts.length >= 2) {
    return {
      home: parts[0].trim(),
      away: parts.slice(1).join(" vs ").trim(),
    };
  }

  return { home: matchText.trim(), away: "Por definir" };
}

function toKickoffAt(dateValue, timeValue, timezone) {
  const localDateTime = `${dateValue}T${timeValue || "00:00"}:00`;
  return fromZonedTime(localDateTime, timezone).toISOString();
}

// Preload every person once into a normalized-name index. The dataset is small;
// this avoids per-row queries and races, and is the source of truth for dedupe.
async function preloadPeople(sql, peopleCache) {
  const people = await sql`SELECT id, full_name FROM people`;

  for (const person of people) {
    const key = normalizePersonName(person.full_name);
    if (key && !peopleCache.has(key)) {
      peopleCache.set(key, person.id);
    }
  }
}

async function getOrCreatePerson(sql, peopleCache, fullName) {
  const name = String(fullName ?? "").trim();
  if (!name) {
    return null;
  }

  const key = normalizePersonName(name);

  if (peopleCache.has(key)) {
    return peopleCache.get(key);
  }

  // No normalized match: insert preserving the original (best-cased) spelling.
  const [created] = await sql`
    INSERT INTO people ${sql({ full_name: name, active: true })}
    RETURNING id
  `;

  peopleCache.set(key, created.id);
  return created.id;
}

async function linkPersonFunction(sql, functionsSeen, personId, roleName) {
  const functionKey = functionKeyFromRoleName(roleName);

  if (!personId || !functionKey) {
    return;
  }

  const dedupeKey = `${personId}:${functionKey}`;
  if (functionsSeen.has(dedupeKey)) {
    return;
  }

  await sql`
    INSERT INTO person_functions ${sql({ person_id: personId, function_key: functionKey })}
    ON CONFLICT (person_id, function_key) DO NOTHING
  `;

  functionsSeen.add(dedupeKey);
}

async function getOrCreateRole(sql, rolesCache, roleName) {
  const name = String(roleName ?? "").trim();
  if (!name) {
    return null;
  }

  if (rolesCache.has(name)) {
    return rolesCache.get(name);
  }

  const [existing] = await sql`
    SELECT id FROM roles WHERE name = ${name} LIMIT 1
  `;

  if (existing?.id) {
    rolesCache.set(name, existing.id);
    return existing.id;
  }

  const [created] = await sql`
    INSERT INTO roles ${sql({ name, category: "Importado", sort_order: 999, active: true })}
    RETURNING id
  `;

  rolesCache.set(name, created.id);
  return created.id;
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
  const inputPath = process.argv[2];
  const fallbackTimezone = process.argv[3] || process.env.NEXT_PUBLIC_APP_TIMEZONE || "America/Bogota";

  if (!inputPath) {
    console.error("Uso: npm run import:csv -- ./archivo.csv [America/Bogota]");
    process.exit(1);
  }

  const csvPath = path.resolve(process.cwd(), inputPath);
  const source = await fs.readFile(csvPath, "utf8");
  const records = parse(source, {
    columns: (headers) => headers.map(normalizeHeader),
    skip_empty_lines: true,
    relax_column_count: true,
  });

  const sql = connectDb();

  const peopleCache = new Map();
  const rolesCache = new Map();
  const functionsSeen = new Set();
  await preloadPeople(sql, peopleCache);
  let createdMatches = 0;
  let updatedMatches = 0;
  let upsertedAssignments = 0;

  for (const row of records) {
    const dateValue = readField(row, HEADER_ALIASES.date);
    const timeValue = readField(row, HEADER_ALIASES.time) || "00:00";
    const timezone = readField(row, HEADER_ALIASES.timezone) || fallbackTimezone;
    const { home, away } = parseTeams(row);

    if (!dateValue || !home || !away) {
      console.warn("Fila ignorada por faltar fecha/local/visitante:", row);
      continue;
    }

    const ownerId = await getOrCreatePerson(
      sql,
      peopleCache,
      readField(row, HEADER_ALIASES.owner),
    );

    await linkPersonFunction(sql, functionsSeen, ownerId, "Responsable");

    const matchPayload = {
      competition: readField(row, HEADER_ALIASES.competition) || null,
      production_mode: readField(row, HEADER_ALIASES.mode) || null,
      status: readField(row, HEADER_ALIASES.status) || "Pendiente",
      home_team: home,
      away_team: away,
      kickoff_at: toKickoffAt(dateValue, timeValue, timezone),
      duration_minutes: Number(readField(row, HEADER_ALIASES.duration) || 150),
      timezone,
      owner_id: ownerId,
      notes: readField(row, HEADER_ALIASES.notes) || null,
    };

    const match = await upsertMatch(sql, matchPayload);
    if (match.created) {
      createdMatches += 1;
    } else {
      updatedMatches += 1;
    }

    for (const [header, rawValue] of Object.entries(row)) {
      const normalizedHeader = normalizeHeader(header);
      const value = String(rawValue ?? "").trim();

      if (!value || RESERVED_HEADERS.has(normalizedHeader)) {
        continue;
      }

      const roleId = await getOrCreateRole(sql, rolesCache, header);
      const personId = await getOrCreatePerson(sql, peopleCache, value);

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

      // Keep person_functions in sync: assignment to "Camara 3" => function "Camara".
      await linkPersonFunction(sql, functionsSeen, personId, header);
    }
  }

  await sql.end();

  console.log(`Importacion terminada:
- partidos creados: ${createdMatches}
- partidos actualizados: ${updatedMatches}
- asignaciones upsertadas: ${upsertedAssignments}`);
}

main().catch((error) => {
  console.error("Importacion fallida:", error);
  process.exit(1);
});
