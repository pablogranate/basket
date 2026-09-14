import "server-only";

import { and, asc, eq } from "drizzle-orm";

import { authDb } from "@/lib/db/auth-client";
import {
  appAccessApp,
  appAccessLevel,
  authAppAccess,
  authUser,
} from "@/lib/auth/schema";

// Acceso: one identity's Nivel in one sibling app (CONTEXT.md "Unified auth",
// ADR 0009). Read per request, never cached: revoking denies on the next hit.

export const SIBLING_APPS = appAccessApp.enumValues;
export const ACCESO_LEVELS = appAccessLevel.enumValues;

export type SiblingApp = (typeof SIBLING_APPS)[number];
export type AccesoLevel = (typeof ACCESO_LEVELS)[number];

export type Acceso = {
  userId: string;
  app: SiblingApp;
  level: AccesoLevel;
  grantedBy: string | null;
  grantedAt: Date;
};

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

export async function grantAcceso(input: {
  userId: string;
  app: SiblingApp;
  level: AccesoLevel;
  grantedBy: string | null;
}): Promise<Acceso> {
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
