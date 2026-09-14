import "server-only";

import { inArray } from "drizzle-orm";

import { grantAcceso, getAcceso } from "@/lib/acceso/accesos";
import { authUser } from "@/lib/auth/schema";
import { authDb } from "@/lib/db/auth-client";
import { db } from "@/lib/db/client";
import { profiles as profilesTable } from "@/lib/db/schema";

// Deploy-day rule (basket#173): the generator used to admit the Full-access
// roles (admin, editor) through the dashboard.full capability; now it admits a
// `generator` Acceso. This seed hands every full-access Cuenta that Acceso so
// nothing changes for them when the gate flips. Idempotent: an existing row is
// left alone (an admin may have lowered it), and a Cuenta without an identity
// yet is reported, not created — they get one on their first portal login.
//
// Cross-database on purpose: Cuentas live in the Domain DB, Accesos in the Auth
// DB, so this cannot be a SQL migration. Run `pnpm db:auth:seed-generator`.

const FULL_ACCESS_ROLES = ["admin", "editor"] as const;
const SEEDED_LEVEL = "write";

type Seeded = { email: string; role: string; userId: string };

export type SeedGeneratorReport = {
  granted: Seeded[];
  alreadyHad: Seeded[];
  noIdentity: { email: string; role: string }[];
  dryRun: boolean;
};

export async function seedGeneratorAccesoForFullAccessRoles(
  options: { dryRun?: boolean } = {},
): Promise<SeedGeneratorReport> {
  const dryRun = options.dryRun ?? false;

  const cuentas = await db
    .select({
      email: profilesTable.email,
      role: profilesTable.role,
      authUserId: profilesTable.authUserId,
    })
    .from(profilesTable)
    .where(inArray(profilesTable.role, [...FULL_ACCESS_ROLES]));

  // Same rule as getUserContext's first-login auto-link: match the still
  // unlinked Cuenta to an identity by email, case-insensitively in JS.
  const unlinkedEmails = new Set(
    cuentas
      .filter((c) => !c.authUserId)
      .map((c) => c.email.toLowerCase()),
  );
  const identitiesByEmail = new Map<string, string>();
  if (unlinkedEmails.size > 0) {
    const identities = await authDb
      .select({ id: authUser.id, email: authUser.email })
      .from(authUser);
    for (const identity of identities) {
      const email = identity.email.toLowerCase();
      if (unlinkedEmails.has(email)) {
        identitiesByEmail.set(email, identity.id);
      }
    }
  }

  const report: SeedGeneratorReport = {
    granted: [],
    alreadyHad: [],
    noIdentity: [],
    dryRun,
  };

  for (const cuenta of cuentas) {
    const email = cuenta.email.toLowerCase();
    const userId = cuenta.authUserId ?? identitiesByEmail.get(email) ?? null;

    if (!userId) {
      report.noIdentity.push({ email, role: cuenta.role });
      continue;
    }

    const seeded: Seeded = { email, role: cuenta.role, userId };

    if (await getAcceso(userId, "generator")) {
      report.alreadyHad.push(seeded);
      continue;
    }

    if (!dryRun) {
      await grantAcceso({
        userId,
        app: "generator",
        level: SEEDED_LEVEL,
        grantedBy: null,
      });
    }
    report.granted.push(seeded);
  }

  return report;
}
