import "server-only";

import { and, eq, isNull, or, sql } from "drizzle-orm";

import { grantPortalRole, revokePortalRole } from "@/lib/acceso/portal";
import { clearProfileCache } from "@/lib/auth";
import type { AppRole } from "@/lib/database.types";
import { db } from "@/lib/db/client";
import { people as peopleTable, profiles as profilesTable } from "@/lib/db/schema";

// Portal access written from outside Personal (the apex users section). Until
// basket#189 the portal also needs a Cuenta: getUserContext denies an identity
// without one, and falls back to profiles.role when the Acceso row is
// missing. So a grant also writes the Cuenta, and a revoke also removes it.
// Two databases, no shared transaction: the Auth DB goes first because it is
// what getUserContext reads.

type Identity = { userId: string; email: string; name: string };

// The Cuenta linked to the identity, or the unlinked one with its email that
// the first login would link.
async function findCuenta(identity: Identity) {
  const rows = await db
    .select({ id: profilesTable.id, authUserId: profilesTable.authUserId })
    .from(profilesTable)
    .where(
      or(
        eq(profilesTable.authUserId, identity.userId),
        and(
          isNull(profilesTable.authUserId),
          sql`lower(${profilesTable.email}) = ${identity.email.toLowerCase()}`,
        ),
      ),
    );

  return (
    rows.find((row) => row.authUserId === identity.userId) ?? rows[0] ?? null
  );
}

export async function grantPortalRoleWithCuenta(
  input: Identity & { role: AppRole; grantedBy: string | null },
): Promise<void> {
  await grantPortalRole({
    userId: input.userId,
    role: input.role,
    grantedBy: input.grantedBy,
  });

  try {
    const cuenta = await findCuenta(input);

    if (cuenta) {
      await db
        .update(profilesTable)
        .set({ role: input.role, authUserId: input.userId })
        .where(eq(profilesTable.id, cuenta.id));
    } else {
      await db.insert(profilesTable).values({
        id: globalThis.crypto.randomUUID(),
        email: input.email.toLowerCase(),
        fullName: input.name,
        role: input.role,
        authUserId: input.userId,
      });
    }
  } catch (error) {
    console.error("[acceso] portal Acceso granted but Cuenta not written", error);
    throw error;
  } finally {
    clearProfileCache();
  }
}

// Deleting the Cuenta removes authorization; the Ficha and its history stay,
// only the link is cut (D-13).
export async function removeCuenta(profileId: string): Promise<void> {
  await db
    .update(peopleTable)
    .set({ profileId: null })
    .where(eq(peopleTable.profileId, profileId));

  await db.delete(profilesTable).where(eq(profilesTable.id, profileId));
}

// Returns whether anything was removed.
export async function revokePortalRoleWithCuenta(
  identity: Identity,
): Promise<boolean> {
  const revoked = await revokePortalRole(identity.userId);

  try {
    const cuenta = await findCuenta(identity);

    if (!cuenta) {
      return revoked;
    }

    await removeCuenta(cuenta.id);
    return true;
  } catch (error) {
    console.error("[acceso] portal Acceso revoked but Cuenta not deleted", error);
    throw error;
  } finally {
    clearProfileCache();
  }
}
