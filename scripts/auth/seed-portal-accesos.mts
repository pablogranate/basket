// Deploy-day seed for basket#186: give every linked Cuenta a `portal` Acceso
// from its profiles.role, so the switch to reading the Auth DB is invisible.
// Idempotent; run after the 0003 migration and before deploying #186.
//
//   pnpm db:auth:seed-portal            # writes
//   pnpm db:auth:seed-portal -- --dry-run
//
// Needs DATABASE_URL (Domain DB, reads Cuentas) and AUTH_DATABASE_URL (Auth DB,
// writes Accesos); loaded from .env.local when present. Runs under Node's
// `react-server` condition so the `server-only` imports resolve to no-ops.
import { seedPortalAccesosFromProfiles } from "@/lib/acceso/seed-portal";

const dryRun = process.argv.includes("--dry-run");

const report = await seedPortalAccesosFromProfiles({ dryRun });

const verb = dryRun ? "would grant" : "granted";
console.log(`[seed-portal] ${verb} a portal Acceso to ${report.granted.length}:`);
for (const row of report.granted) console.log(`  + ${row.email} (${row.role})`);
console.log(`[seed-portal] already had a portal Acceso: ${report.alreadyHad.length}`);
for (const row of report.alreadyHad) console.log(`  = ${row.email} (${row.role})`);
console.log(`[seed-portal] unlinked Cuentas: ${report.unlinked.length}`);
for (const row of report.unlinked) console.log(`  ? ${row.email} (${row.role}) — converted at their first login`);

// Pools stay open otherwise; nothing left to flush.
process.exit(0);
