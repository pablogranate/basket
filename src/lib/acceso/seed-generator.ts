import "server-only";

import { and, eq, inArray } from "drizzle-orm";

import { grantRoleIfAbsent } from "@/lib/acceso/accesos";
import { PORTAL_APP } from "@/lib/acceso/portal";
import { authAppAccess, authUser } from "@/lib/auth/schema";
import { authDb } from "@/lib/db/auth-client";
import { rolesWithCapability } from "@/lib/roles";

// Deploy-day rule (basket#173): the generator used to admit the Full-access
// roles (admin, editor) through the dashboard.full capability; now it admits a
// `generator` Acceso. This seed hands every identity whose portal Acceso holds
// a full-access role that Acceso, so nothing changes for them when the gate
// flips. Idempotent: an existing row is left alone (an admin may have lowered
// it). Run `pnpm db:auth:seed-generator`.

// The exact set the gate used to admit — derived, so the seed cannot drift.
const FULL_ACCESS_ROLES = rolesWithCapability("dashboard.full");
const SEEDED_ROLE = "write";

type Seeded = { email: string; role: string; userId: string };

export type SeedGeneratorReport = {
  granted: Seeded[];
  alreadyHad: Seeded[];
};

export async function seedGeneratorAccesoForFullAccessRoles(
  options: { dryRun?: boolean } = {},
): Promise<SeedGeneratorReport> {
  const dryRun = options.dryRun ?? false;

  const holders = await authDb
    .select({
      userId: authAppAccess.userId,
      role: authAppAccess.role,
      email: authUser.email,
    })
    .from(authAppAccess)
    .innerJoin(authUser, eq(authUser.id, authAppAccess.userId))
    .where(
      and(
        eq(authAppAccess.app, PORTAL_APP),
        inArray(authAppAccess.role, [...FULL_ACCESS_ROLES]),
      ),
    )
    .orderBy(authUser.email);

  const report: SeedGeneratorReport = { granted: [], alreadyHad: [] };

  for (const holder of holders) {
    const seeded: Seeded = {
      email: holder.email.toLowerCase(),
      role: holder.role,
      userId: holder.userId,
    };

    const granted = await grantRoleIfAbsent(
      { userId: holder.userId, app: "generator", role: SEEDED_ROLE, grantedBy: null },
      { dryRun },
    );
    (granted ? report.granted : report.alreadyHad).push(seeded);
  }

  return report;
}
