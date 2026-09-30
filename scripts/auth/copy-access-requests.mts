// One-off copy for basket#198 (ADR 0011): Domain DB `access_requests` rows
// become Auth DB portal Solicitudes (`auth_access_request`). Idempotent (a
// re-run skips copied ids); run after the 0006 Auth DB migration and before
// deploying the portal that reads the Auth DB.
//
//   pnpm db:auth:copy-access-requests -- --dry-run
//   pnpm db:auth:copy-access-requests            # writes
//
// Needs DATABASE_URL (Domain DB, reads) and AUTH_DATABASE_URL (Auth DB,
// writes); loaded from .env.local when present. Runs under Node's
// `react-server` condition so the `server-only` imports resolve to no-ops.
import { copyDomainAccessRequests } from "@/lib/access-requests/copy-domain";

const dryRun = process.argv.includes("--dry-run");

const report = await copyDomainAccessRequests({ dryRun });

const verb = dryRun ? "would copy" : "copied";
console.log(`[copy-access-requests] ${verb}: ${report.copied.length}`);
console.log(`[copy-access-requests] already copied: ${report.alreadyCopied.length}`);
if (report.deciderUnmapped.length) {
  console.log(
    `[copy-access-requests] decider Cuenta without identity (decided_by left null): ${report.deciderUnmapped.length}`,
  );
  for (const id of report.deciderUnmapped) console.log(`  ~ ${id}`);
}
if (report.missingIdentity.length) {
  console.log(`[copy-access-requests] skipped, applicant identity missing: ${report.missingIdentity.length}`);
  for (const row of report.missingIdentity) console.log(`  ? ${row.email} (${row.id})`);
}
if (report.pendingConflict.length) {
  console.log(`[copy-access-requests] skipped, already pending in the Auth DB: ${report.pendingConflict.length}`);
  for (const row of report.pendingConflict) console.log(`  = ${row.email} (${row.id})`);
}

// Pools stay open otherwise; nothing left to flush.
process.exit(0);
