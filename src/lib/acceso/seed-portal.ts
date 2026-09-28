import "server-only";

import { isNotNull, isNull } from "drizzle-orm";

import { grantPortalRoleIfAbsent } from "@/lib/acceso/portal";
import { db } from "@/lib/db/client";
import { profiles as profilesTable } from "@/lib/db/schema";

// Deploy-day seed for basket#186: the portal stops reading profiles.role and
// reads its `portal` Acceso instead, so every linked Cuenta gets that Acceso
// from its current profiles.role before the code ships. Idempotent: an
// existing row is left alone (it is already the source of truth). Unlinked
// Cuentas are only reported — their first login converts profiles.role (the
// auto-link in getUserContext).
//
// Cross-database on purpose: Cuentas live in the Domain DB, Accesos in the Auth
// DB, so this cannot be a SQL migration. Run `pnpm db:auth:seed-portal`.

type Seeded = { email: string; role: string; userId: string };

export type SeedPortalReport = {
  granted: Seeded[];
  alreadyHad: Seeded[];
  unlinked: { email: string; role: string }[];
};

export async function seedPortalAccesosFromProfiles(
  options: { dryRun?: boolean } = {},
): Promise<SeedPortalReport> {
  const dryRun = options.dryRun ?? false;

  const [linked, unlinked] = await Promise.all([
    db
      .select({
        email: profilesTable.email,
        role: profilesTable.role,
        authUserId: profilesTable.authUserId,
      })
      .from(profilesTable)
      .where(isNotNull(profilesTable.authUserId))
      .orderBy(profilesTable.email),
    db
      .select({ email: profilesTable.email, role: profilesTable.role })
      .from(profilesTable)
      .where(isNull(profilesTable.authUserId))
      .orderBy(profilesTable.email),
  ]);

  const report: SeedPortalReport = {
    granted: [],
    alreadyHad: [],
    unlinked: unlinked.map((cuenta) => ({
      email: cuenta.email.toLowerCase(),
      role: cuenta.role,
    })),
  };

  for (const cuenta of linked) {
    const userId = cuenta.authUserId;
    if (!userId) {
      continue;
    }

    const seeded: Seeded = {
      email: cuenta.email.toLowerCase(),
      role: cuenta.role,
      userId,
    };

    const granted = await grantPortalRoleIfAbsent(
      { userId, role: cuenta.role, grantedBy: null },
      { dryRun },
    );
    (granted ? report.granted : report.alreadyHad).push(seeded);
  }

  return report;
}
