import "server-only";

import { and, asc, eq, sql } from "drizzle-orm";

import { authDb } from "@/lib/db/auth-client";
import type { AccesoLevel, SiblingApp } from "@/lib/acceso/catalog";
import { authAppAccess, authUser } from "@/lib/auth/schema";

// Acceso: one identity's Nivel in one sibling app (CONTEXT.md "Unified auth",
// ADR 0009). Read per request, never cached: revoking denies on the next hit.

export type Acceso = {
  userId: string;
  app: SiblingApp;
  level: AccesoLevel;
  grantedBy: string | null;
  grantedAt: Date;
};

// What a caller supplies to grant: the row minus its timestamp.
export type AccesoGrant = Omit<Acceso, "grantedAt">;

export async function getAcceso(
  userId: string,
  app: SiblingApp,
): Promise<Acceso | null> {
  const rows = await authDb
    .select()
    .from(authAppAccess)
    .where(and(eq(authAppAccess.userId, userId), eq(authAppAccess.app, app)))
    .limit(1);

  return rows[0] ?? null;
}

// Every Acceso one identity holds, for the apex launcher.
export async function listAccesosForUser(userId: string): Promise<Acceso[]> {
  return authDb
    .select()
    .from(authAppAccess)
    .where(eq(authAppAccess.userId, userId));
}

export async function grantAcceso(input: AccesoGrant): Promise<Acceso> {
  const [row] = await authDb
    .insert(authAppAccess)
    .values({
      userId: input.userId,
      app: input.app,
      level: input.level,
      grantedBy: input.grantedBy,
      grantedAt: new Date(),
    })
    // One row per identity and app: re-granting replaces the Nivel and stamps
    // the new grantor.
    .onConflictDoUpdate({
      target: [authAppAccess.userId, authAppAccess.app],
      set: {
        level: input.level,
        grantedBy: input.grantedBy,
        grantedAt: new Date(),
      },
    })
    .returning();

  return row;
}

// Returns whether a row was removed. Denial is immediate: gates read per request.
export async function revokeAcceso(input: {
  userId: string;
  app: SiblingApp;
}): Promise<boolean> {
  const removed = await authDb
    .delete(authAppAccess)
    .where(
      and(
        eq(authAppAccess.userId, input.userId),
        eq(authAppAccess.app, input.app),
      ),
    )
    .returning({ userId: authAppAccess.userId });

  return removed.length > 0;
}

export type UserWithAccesos = {
  userId: string;
  email: string;
  name: string;
  accesos: Partial<Record<SiblingApp, Acceso>>;
};

// Every identity in the Auth DB, with or without an Acceso — a gmail-only ops
// viewer has no Cuenta or Ficha, yet must be manageable. Ordered by email.
export async function listUsersWithAccesos(): Promise<UserWithAccesos[]> {
  const rows = await authDb
    .select({
      userId: authUser.id,
      email: authUser.email,
      name: authUser.name,
      acceso: authAppAccess,
    })
    .from(authUser)
    .leftJoin(authAppAccess, eq(authAppAccess.userId, authUser.id))
    .orderBy(asc(authUser.email), asc(authUser.id));

  const byUser = new Map<string, UserWithAccesos>();

  for (const row of rows) {
    let user = byUser.get(row.userId);
    if (!user) {
      user = { userId: row.userId, email: row.email, name: row.name, accesos: {} };
      byUser.set(row.userId, user);
    }
    if (row.acceso) {
      user.accesos[row.acceso.app] = row.acceso;
    }
  }

  return [...byUser.values()];
}

// Seeds grant without overriding: an admin may already have set a Nivel.
// Returns whether a row was (or, in dryRun, would be) written.
export async function grantAccesoIfAbsent(
  input: AccesoGrant,
  options: { dryRun?: boolean } = {},
): Promise<boolean> {
  if (await getAcceso(input.userId, input.app)) {
    return false;
  }

  if (!options.dryRun) {
    await grantAcceso(input);
  }

  return true;
}

export async function findIdentityByEmail(
  email: string,
): Promise<{ id: string; email: string } | null> {
  const rows = await authDb
    .select({ id: authUser.id, email: authUser.email })
    .from(authUser)
    .where(sql`lower(${authUser.email}) = ${email.toLowerCase()}`)
    .limit(1);

  return rows[0] ?? null;
}

// Creates an identity the way Better Auth would after a first magic-link login
// (verified email, no account row, no session) so the person's next login
// attaches to this row instead of creating a duplicate. Same-email Google
// sign-in links to it via accountLinking.
export async function createIdentity(input: {
  email: string;
  name?: string;
}): Promise<{ id: string; email: string }> {
  const email = input.email.toLowerCase();
  const now = new Date();
  const [row] = await authDb
    .insert(authUser)
    .values({
      id: crypto.randomUUID().replace(/-/g, ""),
      email,
      name: input.name ?? email.split("@")[0],
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: authUser.id, email: authUser.email });

  return row;
}
