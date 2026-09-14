import "server-only";

import { eq, inArray } from "drizzle-orm";

import { listUsersWithAccesos, type UserWithAccesos } from "@/lib/acceso/accesos";
import type { UserContext } from "@/lib/auth";
import type { AppRole } from "@/lib/database.types";
import { db } from "@/lib/db/client";
import { people as peopleTable, profiles as profilesTable } from "@/lib/db/schema";

export type AccesosMatrixRow = UserWithAccesos & {
  // Cuenta role on the portal, if the identity has a Cuenta. Informational:
  // the portal is exempt from Accesos.
  cuentaRole: AppRole | null;
  // Ficha (people row) name, if the Cuenta is linked to one.
  fichaName: string | null;
};

// Every identity in the Auth DB decorated with its Cuenta and Ficha from the
// Domain DB — two databases, so joined in memory over the small staff set.
// Authorization is resolved by the caller (requireAdmin) and threaded in as
// ctx per the loader contract (D-06); the read itself is not per-actor.
export async function getAccesosMatrix(
  ctx: UserContext,
): Promise<AccesosMatrixRow[]> {
  void ctx;
  const users = await listUsersWithAccesos();

  if (users.length === 0) {
    return [];
  }

  const cuentas = await db
    .select({
      authUserId: profilesTable.authUserId,
      role: profilesTable.role,
      fichaName: peopleTable.fullName,
    })
    .from(profilesTable)
    .leftJoin(peopleTable, eq(peopleTable.profileId, profilesTable.id))
    .where(
      inArray(
        profilesTable.authUserId,
        users.map((user) => user.userId),
      ),
    );

  const byAuthUserId = new Map(
    cuentas
      .filter(
        (c): c is typeof c & { authUserId: string } => c.authUserId !== null,
      )
      .map((c) => [c.authUserId, c] as const),
  );

  return users.map((user) => {
    const cuenta = byAuthUserId.get(user.userId);
    return {
      ...user,
      cuentaRole: cuenta?.role ?? null,
      fichaName: cuenta?.fichaName ?? null,
    };
  });
}
