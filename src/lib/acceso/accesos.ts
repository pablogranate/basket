import "server-only";

import { and, asc, eq, ne, sql } from "drizzle-orm";

import { authDb, type AuthDbExecutor } from "@/lib/db/auth-client";
import {
  authAccessRequest,
  authApp,
  authAppAccess,
  authAuditLog,
  authEffectiveAccess,
  authUser,
} from "@/lib/auth/schema";

// Acceso: one identity's role in one app (CONTEXT.md "Unified auth", ADR
// 0010). Read per request, never cached: revoking denies on the next hit.

export type EffectiveAccess = typeof authEffectiveAccess.$inferSelect;

// The role a gate honours for one identity in one app, super admins included.
export async function getEffectiveAccess(
  userId: string,
  app: string,
): Promise<EffectiveAccess | null> {
  const rows = await authDb
    .select()
    .from(authEffectiveAccess)
    .where(
      and(
        eq(authEffectiveAccess.userId, userId),
        eq(authEffectiveAccess.app, app),
      ),
    )
    .limit(1);

  return rows[0] ?? null;
}

// Every app one identity may enter, super admin rows included, for the apex
// launcher.
export async function listEffectiveAccessForUser(
  userId: string,
): Promise<EffectiveAccess[]> {
  return authDb
    .select()
    .from(authEffectiveAccess)
    .where(eq(authEffectiveAccess.userId, userId));
}

// Every identity that may enter one app, super admins included, for lists that
// show access per person without a query per row.
export async function listEffectiveAccessForApp(
  app: string,
): Promise<EffectiveAccess[]> {
  return authDb
    .select()
    .from(authEffectiveAccess)
    .where(eq(authEffectiveAccess.app, app));
}

export type RoleGrant = {
  userId: string;
  app: string;
  role: string;
  grantedBy: string | null;
};

// Role-based grant for any app, the portal included. The composite FK rejects
// a role the app's catalog doesn't declare. Pass `exec` to join a caller's
// Auth DB transaction.
export async function grantRole(
  input: RoleGrant,
  exec: AuthDbExecutor = authDb,
): Promise<void> {
  await exec
    .insert(authAppAccess)
    .values({
      userId: input.userId,
      app: input.app,
      role: input.role,
      grantedBy: input.grantedBy,
      grantedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [authAppAccess.userId, authAppAccess.app],
      set: {
        role: input.role,
        grantedBy: input.grantedBy,
        grantedAt: new Date(),
      },
    });
}

// Returns whether a row was removed. Denial is immediate: gates read per request.
// Every revoke leaves who, when and what in auth_audit_log, in the same
// transaction as the delete.
export async function revokeRole(input: {
  userId: string;
  app: string;
  actorId: string | null;
}): Promise<boolean> {
  return authDb.transaction(async (tx) => {
    const removed = await tx
      .delete(authAppAccess)
      .where(
        and(
          eq(authAppAccess.userId, input.userId),
          eq(authAppAccess.app, input.app),
        ),
      )
      .returning({ role: authAppAccess.role });

    if (!removed[0]) {
      return false;
    }

    await tx.insert(authAuditLog).values({
      actorId: input.actorId,
      targetUserId: input.userId,
      action: "access.revoked",
      detail: { app: input.app, role: removed[0].role },
    });

    return true;
  });
}

// One person ended up with two logins and the approver kept `intoUserId`: the
// other one goes away, its sessions and accounts with it. What it held moves
// first so nothing is lost: its other apps' Accesos (the kept login's own win
// on conflict), its decided Solicitudes and its audit trail. Its pending
// Solicitudes go with it; they asked as a login that no longer exists. Runs in
// the caller's transaction.
export async function retireIdentityInto(
  exec: AuthDbExecutor,
  input: { fromUserId: string; intoUserId: string; actorId: string | null },
): Promise<void> {
  const { fromUserId, intoUserId } = input;
  const [from] = await exec
    .select({ email: authUser.email, role: authUser.role })
    .from(authUser)
    .where(eq(authUser.id, fromUserId))
    .limit(1);

  if (!from) {
    return;
  }

  if (from.role === "superadmin") {
    throw new Error("La otra cuenta es de un super admin: no se puede borrar desde acá.");
  }

  const held = await exec
    .select()
    .from(authAppAccess)
    .where(eq(authAppAccess.userId, fromUserId));

  if (held.length) {
    await exec
      .insert(authAppAccess)
      .values(held.map((row) => ({ ...row, userId: intoUserId })))
      .onConflictDoNothing();
  }

  await exec
    .update(authAccessRequest)
    .set({ userId: intoUserId })
    .where(and(eq(authAccessRequest.userId, fromUserId), ne(authAccessRequest.status, "pendiente")));
  await exec
    .update(authAuditLog)
    .set({ targetUserId: intoUserId })
    .where(eq(authAuditLog.targetUserId, fromUserId));
  await exec
    .update(authAuditLog)
    .set({ actorId: intoUserId })
    .where(eq(authAuditLog.actorId, fromUserId));

  await exec.insert(authAuditLog).values({
    actorId: input.actorId,
    targetUserId: intoUserId,
    action: "identity.retired",
    detail: { retiredEmail: from.email, apps: held.map((row) => row.app) },
  });

  await exec.delete(authUser).where(eq(authUser.id, fromUserId));
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

// The auth_app catalog, in sort order: what an app key from a URL or a form is
// checked against.
export async function listCatalogApps(): Promise<{ key: string; label: string }[]> {
  return authDb
    .select({ key: authApp.key, label: authApp.label })
    .from(authApp)
    .orderBy(asc(authApp.sortOrder));
}
