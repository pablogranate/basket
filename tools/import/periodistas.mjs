#!/usr/bin/env node

// Enrich people emails from the "Periodistas" sheet
// (Google Sheet 1ORwaZ118mD4cszWr6CVgClRuD0wa6QrC).
// Matches existing people by normalized name, falling back to phone digits
// (handles spelling drift like "Leo Chianese" vs "Leonardo Chianese").
// Only fills empty fields; never overwrites.
//
// Usage:
//   node tools/import/periodistas.mjs            # dry run
//   node tools/import/periodistas.mjs --apply    # write to Supabase

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { parse } from "csv-parse/sync";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "../..");

dotenv.config({ path: path.join(ROOT_DIR, ".env.local") });
dotenv.config({ path: path.join(ROOT_DIR, ".env") });

const APPLY = process.argv.includes("--apply");
const RAW_PATH = path.join(__dirname, "periodistas.raw.csv");

function normName(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// Last 10 digits — tolerant of "54 9 11 ..." prefixes and formatting.
function phoneKey(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length >= 8 ? digits.slice(-10) : "";
}

async function main() {
  const source = await fs.readFile(RAW_PATH, "utf8");
  const rows = parse(source, { columns: true, skip_empty_lines: true });

  // Dedup by name (same journalist covers several clubs).
  const periodistas = new Map();
  for (const row of rows) {
    const key = normName(row.name);
    if (!key || !row.email?.trim()) continue;
    if (!periodistas.has(key)) {
      periodistas.set(key, {
        name: row.name.trim(),
        email: row.email.trim(),
        phone: row.phone?.trim() || null,
      });
    }
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

  const { data: people, error } = await supabase
    .from("people")
    .select("id, full_name, phone, email");
  if (error) throw error;

  const byName = new Map();
  const byPhone = new Map();
  for (const p of people) {
    byName.set(normName(p.full_name), p);
    const pk = phoneKey(p.phone);
    if (pk && !byPhone.has(pk)) byPhone.set(pk, p);
  }

  const updates = [];
  const unmatched = [];

  for (const rec of periodistas.values()) {
    const match = byName.get(normName(rec.name)) ?? byPhone.get(phoneKey(rec.phone));
    if (!match) {
      unmatched.push(rec.name);
      continue;
    }
    const patch = {};
    if (!match.email && rec.email) patch.email = rec.email;
    if (!match.phone && rec.phone) patch.phone = rec.phone;
    if (Object.keys(patch).length) {
      updates.push({ id: match.id, full_name: match.full_name, via: byName.has(normName(rec.name)) ? "name" : "phone", patch });
    }
  }

  console.log(`Periodistas con email: ${periodistas.size}`);
  console.log(`Matches con patch: ${updates.length}`);
  console.log(`Sin match: ${unmatched.length}${unmatched.length ? " -> " + unmatched.join(", ") : ""}`);
  for (const u of updates.filter((u) => u.via === "phone")) {
    console.log(`  matched by phone: ${u.full_name}`);
  }

  if (!APPLY) {
    console.log("\nDRY RUN. Para escribir en Supabase: --apply");
    return;
  }

  let updated = 0;
  for (const u of updates) {
    const { error: upErr } = await supabase.from("people").update(u.patch).eq("id", u.id);
    if (upErr) throw upErr;
    updated += 1;
  }
  console.log(`Actualizados: ${updated}`);
}

main().catch((error) => {
  console.error("Enriquecimiento fallido:", error);
  process.exit(1);
});
