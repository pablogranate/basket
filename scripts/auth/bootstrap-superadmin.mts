// Sets the first super admin(s) for basket#187 (ADR 0010): they can then open
// basket-app.com/usuarios and promote anyone else from there. Idempotent; an
// email with no identity yet is reported, not created — have the person sign
// in once first.
//
//   pnpm db:auth:bootstrap-superadmin -- ana@basquetpass.tv [more@…]
//   pnpm db:auth:bootstrap-superadmin -- --dry-run ana@basquetpass.tv
//
// Needs AUTH_DATABASE_URL (loaded from .env.local when present). Runs under
// Node's `react-server` condition so the `server-only` imports resolve to no-ops.
import { findIdentityByEmail } from "@/lib/acceso/accesos";
import { findActiveSuperAdmin, setSuperAdmin } from "@/lib/usuarios/super-admin";

const args = process.argv.slice(2).filter((arg) => arg !== "--");
const dryRun = args.includes("--dry-run");
const emails = args.filter((arg) => !arg.startsWith("--"));

if (emails.length === 0) {
  console.error("[usuarios] pass at least one email");
  process.exit(1);
}

let missing = 0;

for (const email of emails) {
  const identity = await findIdentityByEmail(email);

  if (!identity) {
    missing += 1;
    console.log(`  ? ${email} — no identity; sign in once, then re-run`);
    continue;
  }

  if (await findActiveSuperAdmin(identity.id)) {
    console.log(`  = ${email} already super admin`);
    continue;
  }

  if (!dryRun) {
    await setSuperAdmin({
      actorId: null,
      targetUserId: identity.id,
      superAdmin: true,
      source: "bootstrap",
    });
  }

  console.log(`  + ${email} ${dryRun ? "would become" : "is now"} super admin`);
}

// Pools stay open otherwise; nothing left to flush.
process.exit(missing > 0 ? 1 : 0);
