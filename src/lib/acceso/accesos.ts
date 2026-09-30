import "server-only";

import { and, asc, eq, sql } from "drizzle-orm";

import { authDb, type AuthDbExecutor } from "@/lib/db/auth-client";
import {
  authApp,
  authAppAccess,
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

// Seeds and first-login links grant without overriding an existing row.
// Returns whether a row was (or, in dryRun, would be) written.
export async function grantRoleIfAbsent(
  input: RoleGrant,
  options: { dryRun?: boolean } = {},
): Promise<boolean> {
  if (options.dryRun) {
    const existing = await authDb
      .select({ userId: authAppAccess.userId })
      .from(authAppAccess)
      .where(
        and(
          eq(authAppAccess.userId, input.userId),
          eq(authAppAccess.app, input.app),
        ),
      )
      .limit(1);

    return existing.length === 0;
  }

  const inserted = await authDb
    .insert(authAppAccess)
    .values({
      userId: input.userId,
      app: input.app,
      role: input.role,
      grantedBy: input.grantedBy,
      grantedAt: new Date(),
    })
    .onConflictDoNothing({ target: [authAppAccess.userId, authAppAccess.app] })
    .returning({ userId: authAppAccess.userId });

  return inserted.length > 0;
}

// Returns whether a row was removed. Denial is immediate: gates read per request.
export async function revokeRole(input: {
  userId: string;
  app: string;
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
