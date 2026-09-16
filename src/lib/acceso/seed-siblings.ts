import "server-only";

import {
  createIdentity,
  findIdentityByEmail,
  grantAccesoIfAbsent,
} from "@/lib/acceso/accesos";
import type { PlannedAcceso } from "@/lib/acceso/seed-siblings-plan";

export type SiblingSeedReport = {
  createdIdentities: { email: string; userId: string | null }[];
  granted: PlannedAcceso[];
  alreadyHad: PlannedAcceso[];
};

// Cutover seed: every legacy user gets an identity in the Auth DB (created
// verified, no email sent — they log in with a magic link when they next need
// to) and the Accesos the plan says. Idempotent: an existing Acceso is never
// touched, so an admin's later change survives a re-run.
export async function applySiblingAccesoPlan(
  plan: PlannedAcceso[],
  options: { dryRun?: boolean } = {},
): Promise<SiblingSeedReport> {
  const dryRun = options.dryRun ?? false;
  const report: SiblingSeedReport = {
    createdIdentities: [],
    granted: [],
    alreadyHad: [],
  };

  const emails = [...new Set(plan.map((row) => row.email))];
  const identityByEmail = new Map<string, string | null>();

  for (const email of emails) {
    const existing = await findIdentityByEmail(email);
    if (existing) {
      identityByEmail.set(email, existing.id);
      continue;
    }

    const created = dryRun ? null : await createIdentity({ email });
    report.createdIdentities.push({ email, userId: created?.id ?? null });
    identityByEmail.set(email, created?.id ?? null);
  }

  for (const row of plan) {
    const userId = identityByEmail.get(row.email) ?? null;

    if (!userId) {
      // Dry run over a not-yet-created identity: nothing to look up.
      report.granted.push(row);
      continue;
    }

    const wouldGrant = await grantAccesoIfAbsent(
      { userId, app: row.app, level: row.level, grantedBy: null },
      { dryRun },
    );
    (wouldGrant ? report.granted : report.alreadyHad).push(row);
  }

  return report;
}
