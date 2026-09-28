// Deploy-day seed for basket#173: give every portal admin and editor (by their
// portal Acceso) a `generator` Acceso so the gate flip is invisible to them.
// Idempotent.
//
//   pnpm db:auth:seed-generator            # writes
//   pnpm db:auth:seed-generator -- --dry-run
//
// Needs AUTH_DATABASE_URL (reads portal Accesos, writes generator ones); loaded
// from .env.local when present. Runs under Node's
// `react-server` condition so the `server-only` imports resolve to no-ops.
import { seedGeneratorAccesoForFullAccessRoles } from "@/lib/acceso/seed-generator";

const dryRun = process.argv.includes("--dry-run");

const report = await seedGeneratorAccesoForFullAccessRoles({ dryRun });

const verb = dryRun ? "would grant" : "granted";
console.log(`[seed-generator] ${verb} generator/write to ${report.granted.length}:`);
for (const row of report.granted) console.log(`  + ${row.email} (${row.role})`);
console.log(`[seed-generator] already had a generator Acceso: ${report.alreadyHad.length}`);
for (const row of report.alreadyHad) console.log(`  = ${row.email} (${row.role})`);

// Pools stay open otherwise; nothing left to flush.
process.exit(0);
