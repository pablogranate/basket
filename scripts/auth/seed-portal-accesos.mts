// Pre-drop seed for basket#186 and #189: every Cuenta gets a `portal` Acceso
// from its profiles.role, and a Cuenta that never logged in gets an identity
// to hold it. Idempotent; run before deploying #189 and before the Domain DB
// migration that drops profiles.role.
//
//   pnpm db:auth:seed-portal -- --dry-run
//   pnpm db:auth:seed-portal            # writes
//
// Needs DATABASE_URL (Domain DB, reads and links Cuentas) and AUTH_DATABASE_URL
// (Auth DB, writes identities and Accesos); loaded from .env.local when
// present. Runs under Node's `react-server` condition so the `server-only`
// imports resolve to no-ops.
import { seedPortalAccesosFromProfiles } from "@/lib/acceso/seed-portal";

const dryRun = process.argv.includes("--dry-run");

const report = await seedPortalAccesosFromProfiles({ dryRun });

const verb = dryRun ? "would" : "did";
console.log(`[seed-portal] ${verb} create an identity for ${report.createdIdentities.length} never-linked Cuentas:`);
for (const email of report.createdIdentities) console.log(`  + ${email}`);
console.log(`[seed-portal] ${verb} grant a portal Acceso to ${report.granted.length}:`);
for (const row of report.granted) console.log(`  + ${row.email} (${row.role})`);
console.log(`[seed-portal] already had a portal Acceso: ${report.alreadyHad.length}`);
for (const row of report.alreadyHad) console.log(`  = ${row.email} (${row.role})`);
if (report.unknownRole.length) {
  console.log(`[seed-portal] skipped, unknown role: ${report.unknownRole.length}`);
  for (const row of report.unknownRole) console.log(`  ? ${row.email} (${row.role})`);
}

// Pools stay open otherwise; nothing left to flush.
process.exit(0);
