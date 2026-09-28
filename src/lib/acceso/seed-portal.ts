import "server-only";

import { sql } from "drizzle-orm";

import { findIdentityByEmail } from "@/lib/acceso/accesos";
import { grantPortalRoleIfAbsent } from "@/lib/acceso/portal";
import { linkCuentaIdentity } from "@/lib/acceso/portal-cuenta";
import type { AppRole } from "@/lib/database.types";
import { db } from "@/lib/db/client";
import { isAppRole } from "@/lib/roles";

// Pre-drop seed for basket#186 and #189: the portal reads its `portal` Acceso,
// never profiles.role, so every Cuenta gets that Acceso from its profiles.role
// before the column is dropped. A Cuenta that never logged in gets an identity
// first (verified, no email sent), so nobody depends on a first-login
// conversion any more. Idempotent: an existing Acceso is left alone (it is
// already the source of truth).
//
// Cross-database on purpose: Cuentas live in the Domain DB, Accesos in the Auth
// DB, so this cannot be a SQL migration. Run `pnpm db:auth:seed-portal`, and
// only while `profiles.role` still exists (the schema no longer declares it, so
// it is read by name).

type Seeded = { email: string; role: AppRole; userId: string | null };

export type SeedPortalReport = {
  granted: Seeded[];
  alreadyHad: Seeded[];
  // Cuentas that had no identity: created (or, in a dry run, would be).
  createdIdentities: string[];
  unknownRole: { email: string; role: string }[];
};

type CuentaRow = {
  id: string;
  email: string;
  role: string;
  auth_user_id: string | null;
};

export async function seedPortalAccesosFromProfiles(
  options: { dryRun?: boolean } = {},
): Promise<SeedPortalReport> {
  const dryRun = options.dryRun ?? false;

  const cuentas = (await db.execute(sql`
    SELECT id, email, role::text AS role, auth_user_id
    FROM profiles ORDER BY lower(email)
  `)) as unknown as CuentaRow[];

  const report: SeedPortalReport = {
    granted: [],
    alreadyHad: [],
    createdIdentities: [],
    unknownRole: [],
  };

  for (const cuenta of cuentas) {
    const email = cuenta.email.toLowerCase();

    if (!isAppRole(cuenta.role)) {
      report.unknownRole.push({ email, role: cuenta.role });
      continue;
    }

    let userId = cuenta.auth_user_id;

    if (!userId) {
      const existing = await findIdentityByEmail(email);
      if (!existing) {
        report.createdIdentities.push(email);
      }
      userId = dryRun
        ? (existing?.id ?? null)
        : await linkCuentaIdentity({ id: cuenta.id, email, authUserId: null });
    }

    const seeded: Seeded = { email, role: cuenta.role, userId };

    if (!userId) {
      // Dry run over an identity that does not exist yet: it would be granted.
      report.granted.push(seeded);
      continue;
    }

    const granted = await grantPortalRoleIfAbsent(
      { userId, role: cuenta.role, grantedBy: null },
      { dryRun },
    );
    (granted ? report.granted : report.alreadyHad).push(seeded);
  }

  return report;
}
