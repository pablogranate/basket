// Cutover seed for basket#174: give every incidencias, ops hub and analytics
// user an identity in the Auth DB and the Acceso matching their legacy rights
// (story 27). Idempotent; never overrides an Acceso an admin already set.
//
//   pnpm db:auth:seed-siblings -- --dry-run          # plan only, no writes
//   pnpm db:auth:seed-siblings                       # fetch sources + write
//   pnpm db:auth:seed-siblings -- --input plan.json  # sources from a file
//
// Sources (env, .env.local loaded when present):
//   SEED_INCIDENCIAS_SUPABASE_URL / SEED_INCIDENCIAS_SERVICE_ROLE_KEY
//   SEED_OPS_SUPABASE_URL / SEED_OPS_SERVICE_ROLE_KEY
//   SEED_OPS_VIEWER_EMAILS   comma list; mirror of ops repo src/lib/roles.ts
//   SEED_ANALYTICS_DATABASE_URL   analytics Postgres (auth_allowed_emails)
// Plus AUTH_DATABASE_URL for the Auth DB writes. `--input` takes a JSON file
// shaped like SiblingSeedInput and skips every fetch.
import { readFile } from "node:fs/promises";

import postgres from "postgres";

import {
  applySiblingAccesoPlan,
  planSiblingAccesos,
  type SiblingSeedInput,
} from "@/lib/acceso/seed-siblings";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const inputIndex = args.indexOf("--input");
const inputPath = inputIndex >= 0 ? args[inputIndex + 1] : null;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}. Set it in .env.local or pass --input <plan.json>.`);
  }
  return value;
}

// Supabase Auth admin API: every user of a project (service role only).
async function fetchSupabaseUsers(baseUrl: string, serviceRoleKey: string) {
  const users: { id: string; email: string }[] = [];
  for (let page = 1; page < 50; page += 1) {
    const response = await fetch(
      `${baseUrl}/auth/v1/admin/users?page=${page}&per_page=1000`,
      { headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` } },
    );
    if (!response.ok) {
      throw new Error(`Supabase admin users ${baseUrl}: HTTP ${response.status}`);
    }
    const body = (await response.json()) as { users?: { id: string; email?: string }[] };
    const batch = body.users ?? [];
    for (const user of batch) {
      if (user.email) users.push({ id: user.id, email: user.email });
    }
    if (batch.length < 1000) break;
  }
  return users;
}

// Incidencias keeps the role on profiles (uuid = auth user id).
async function fetchIncidenciasProfiles(baseUrl: string, serviceRoleKey: string) {
  const response = await fetch(`${baseUrl}/rest/v1/profiles?select=id,role`, {
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
  });
  if (!response.ok) {
    throw new Error(`Incidencias profiles: HTTP ${response.status}`);
  }
  return (await response.json()) as { id: string; role: string }[];
}

async function fetchAnalyticsAllowlist(databaseUrl: string) {
  const sql = postgres(databaseUrl, { max: 1 });
  try {
    return await sql<{ email: string; role: string }[]>`
      SELECT email, role FROM auth_allowed_emails`;
  } finally {
    await sql.end();
  }
}

async function collectInput(): Promise<SiblingSeedInput> {
  if (inputPath) {
    return JSON.parse(await readFile(inputPath, "utf8")) as SiblingSeedInput;
  }

  const incUrl = requireEnv("SEED_INCIDENCIAS_SUPABASE_URL");
  const incKey = requireEnv("SEED_INCIDENCIAS_SERVICE_ROLE_KEY");
  const opsUrl = requireEnv("SEED_OPS_SUPABASE_URL");
  const opsKey = requireEnv("SEED_OPS_SERVICE_ROLE_KEY");
  const analyticsUrl = requireEnv("SEED_ANALYTICS_DATABASE_URL");

  const [incUsers, incProfiles, opsUsers, analytics] = await Promise.all([
    fetchSupabaseUsers(incUrl, incKey),
    fetchIncidenciasProfiles(incUrl, incKey),
    fetchSupabaseUsers(opsUrl, opsKey),
    fetchAnalyticsAllowlist(analyticsUrl),
  ]);

  const roleByUserId = new Map(incProfiles.map((p) => [p.id, p.role]));

  return {
    incidencias: incUsers.map((u) => ({
      email: u.email,
      role: roleByUserId.get(u.id) ?? "",
    })),
    ops: opsUsers.map((u) => ({ email: u.email })),
    opsViewerEmails: (process.env.SEED_OPS_VIEWER_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean),
    analytics: analytics.map((row) => ({ email: row.email, role: row.role })),
  };
}

const input = await collectInput();
const plan = planSiblingAccesos(input);
const report = await applySiblingAccesoPlan(plan, { dryRun });

const verb = dryRun ? "would" : "did";
console.log(`[seed-siblings] plan: ${plan.length} Accesos for ${new Set(plan.map((r) => r.email)).size} emails`);
console.log(`[seed-siblings] identities ${verb} create: ${report.createdIdentities.length}`);
for (const row of report.createdIdentities) console.log(`  + ${row.email}`);
console.log(`[seed-siblings] Accesos ${verb} grant: ${report.granted.length}`);
for (const row of report.granted) console.log(`  + ${row.email}  ${row.app}/${row.level}`);
console.log(`[seed-siblings] already present, untouched: ${report.alreadyHad.length}`);
for (const row of report.alreadyHad) console.log(`  = ${row.email}  ${row.app}`);

process.exit(0);
