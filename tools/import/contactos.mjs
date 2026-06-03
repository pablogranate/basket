#!/usr/bin/env node

// Import the "Contactos" sheet into Supabase.
// Source: tools/import/contactos.raw.md (curated, scheduling grids removed).
// People -> public.people (dedup + enrich by name). Clubs -> public.club_contacts.
//
// Usage:
//   node tools/import/contactos.mjs            # dry run: prints stats, writes contactos.clean.json
//   node tools/import/contactos.mjs --apply    # writes to Supabase (needs migration 0009 applied)

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "../..");

dotenv.config({ path: path.join(ROOT_DIR, ".env.local") });
dotenv.config({ path: path.join(ROOT_DIR, ".env") });

const APPLY = process.argv.includes("--apply");
const RAW_PATH = path.join(__dirname, "contactos.raw.md");
const CLEAN_PATH = path.join(__dirname, "contactos.clean.json");

// Values that are placeholders, not real people.
const NON_PERSON = new Set(["basquetpass", "camarografos bp", "a conf.", ""]);

function normName(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function cleanText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

// Lossless-ish phone cleanup: collapse whitespace, drop placeholder tokens.
// Country code is NOT inferred (numbers come from AR/CO/EC with inconsistent prefixes).
function cleanPhone(value) {
  const v = cleanText(value);
  if (!v) return null;
  if (NON_PERSON.has(v.toLowerCase())) return null;
  return v;
}

function splitRow(line) {
  return line.split("|").map((c) => cleanText(c));
}

function parseSections(raw) {
  const lines = raw.split("\n");
  const sections = [];
  let current = null;

  for (const line of lines) {
    const header = line.match(/^==\s*(.*?)\s*==$/);
    if (header) {
      if (current) sections.push(current);
      const meta = {};
      for (const part of header[1].split("|")) {
        const [k, ...rest] = part.split(":");
        if (rest.length) meta[k.trim().toLowerCase()] = rest.join(":").trim();
      }
      current = { meta, rows: [] };
      continue;
    }
    if (current && line.includes("|")) current.rows.push(line);
    else if (current && line.trim() && current.meta.type === "names")
      current.rows.push(line);
  }
  if (current) sections.push(current);
  return sections;
}

function buildRecords(sections) {
  const people = new Map(); // normName -> record
  const clubs = [];
  const seenClub = new Set();

  function addPerson(name, phone, category, notes) {
    const display = cleanText(name);
    const key = normName(display);
    if (!key || NON_PERSON.has(key)) return;

    const phoneClean = cleanPhone(phone);
    const cat = cleanText(category) || null;
    const existing = people.get(key);

    if (!existing) {
      people.set(key, {
        full_name: display,
        phone: phoneClean,
        category: cat,
        notes: notes || null,
      });
      return;
    }
    // Merge duplicates within the sheet.
    if (!existing.phone && phoneClean) existing.phone = phoneClean;
    // Prefer the better-formatted display name (more accents / longer).
    if (display.length > existing.full_name.length) existing.full_name = display;
    if (cat && existing.category !== cat) {
      existing.category = existing.category
        ? Array.from(new Set([...existing.category.split(" / "), cat])).join(" / ")
        : cat;
    }
    if (notes && !existing.notes) existing.notes = notes;
  }

  for (const { meta, rows } of sections) {
    const type = (meta.type || "").toLowerCase();

    if (type === "people-paired") {
      const cats = (meta.categories || "").split(",").map((c) => c.trim());
      const tag = meta.tag ? `Tag: ${meta.tag}` : null;
      for (const row of rows) {
        const c = splitRow(row);
        // [name1, phone1, name2, phone2]
        addPerson(c[0], c[1], cats[0], tag);
        addPerson(c[2], c[3], cats[1] || cats[0], tag);
      }
    } else if (type === "people-controllers") {
      const cat = meta.category || "Tecnico";
      for (const row of rows) {
        const [name, dias, phone] = splitRow(row);
        const notes = dias ? `Días: ${dias}` : null;
        addPerson(name, phone, cat, notes);
      }
    } else if (type === "people-funcion") {
      for (const row of rows) {
        const [name, phone, funcion] = splitRow(row);
        addPerson(name, phone, funcion);
      }
    } else if (type === "names") {
      for (const row of rows) {
        addPerson(row.replace(/\|/g, "").trim(), "", "Responsable");
      }
    } else if (type === "clubs") {
      const source = meta.source || null;
      for (const row of rows) {
        const [club, responsable, phone] = splitRow(row);
        if (!club) continue;
        const rec = {
          club_name: club,
          league: null,
          responsable: cleanText(responsable) || null,
          phone: cleanPhone(phone),
          source_block: source,
        };
        const k = `${normName(rec.club_name)}|${normName(rec.responsable)}|${rec.phone}`;
        if (seenClub.has(k)) continue;
        seenClub.add(k);
        clubs.push(rec);
      }
    }
  }

  // Store role where the app reads it: a "Rol principal:" line in notes.
  // Keep any free notes (Tag/Días) below it. Mirrors buildPersonNotesMeta in the app.
  const finalPeople = Array.from(people.values()).map((p) => {
    const primary = p.category ? p.category.split("/")[0].trim() : "";
    if (!primary) return p;
    const free = p.notes && !p.notes.startsWith("Rol principal:") ? `\n\n${p.notes}` : "";
    return { ...p, notes: `Rol principal: ${primary}${free}` };
  });

  return { people: finalPeople, clubs };
}

async function applyPeople(supabase, people) {
  const { data: existing, error } = await supabase
    .from("people")
    .select("id, full_name, phone, category");
  if (error) throw error;

  const byName = new Map();
  for (const p of existing) byName.set(normName(p.full_name), p);

  const inserts = [];
  let updated = 0;
  let skipped = 0;

  for (const rec of people) {
    const match = byName.get(normName(rec.full_name));
    if (!match) {
      inserts.push({
        full_name: rec.full_name,
        phone: rec.phone,
        category: rec.category,
        notes: rec.notes,
        active: true,
      });
      continue;
    }
    const patch = {};
    if (!match.phone && rec.phone) patch.phone = rec.phone;
    if (!match.category && rec.category) patch.category = rec.category;
    if (Object.keys(patch).length === 0) {
      skipped += 1;
      continue;
    }
    const { error: upErr } = await supabase.from("people").update(patch).eq("id", match.id);
    if (upErr) throw upErr;
    updated += 1;
  }

  let inserted = 0;
  for (let i = 0; i < inserts.length; i += 200) {
    const chunk = inserts.slice(i, i + 200);
    const { error: insErr } = await supabase.from("people").insert(chunk);
    if (insErr) throw insErr;
    inserted += chunk.length;
  }

  return { inserted, updated, skipped };
}

async function applyClubs(supabase, clubs) {
  let upserted = 0;
  for (let i = 0; i < clubs.length; i += 200) {
    const chunk = clubs.slice(i, i + 200);
    const { error } = await supabase
      .from("club_contacts")
      .upsert(chunk, { onConflict: "club_name,responsable,phone", ignoreDuplicates: true });
    if (error) throw error;
    upserted += chunk.length;
  }
  return upserted;
}

async function main() {
  const raw = await fs.readFile(RAW_PATH, "utf8");
  const sections = parseSections(raw);
  const { people, clubs } = buildRecords(sections);

  const peopleWithPhone = people.filter((p) => p.phone).length;
  const catCounts = {};
  for (const p of people) {
    const k = p.category || "(sin categoría)";
    catCounts[k] = (catCounts[k] || 0) + 1;
  }

  console.log("Parsed Contactos:");
  console.log(`  people: ${people.length} (${peopleWithPhone} con teléfono)`);
  console.log("  por categoría:", catCounts);
  console.log(`  club_contacts: ${clubs.length} (clubes únicos: ${new Set(clubs.map((c) => normName(c.club_name))).size})`);

  await fs.writeFile(CLEAN_PATH, JSON.stringify({ people, clubs }, null, 2), "utf8");
  console.log(`  wrote ${path.relative(ROOT_DIR, CLEAN_PATH)}`);

  if (!APPLY) {
    console.log("\nDRY RUN. Revisa contactos.clean.json. Para escribir en Supabase: --apply");
    return;
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno.");
    process.exit(1);
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  console.log("\nAplicando a Supabase...");
  const p = await applyPeople(supabase, people);
  console.log(`  people: insertados ${p.inserted}, actualizados ${p.updated}, sin cambios ${p.skipped}`);
  const c = await applyClubs(supabase, clubs);
  console.log(`  club_contacts: upserted ${c}`);
  console.log("Listo.");
}

main().catch((error) => {
  console.error("Importación fallida:", error);
  process.exit(1);
});
