import "server-only";

import { asc, desc, eq, inArray } from "drizzle-orm";

import {
  authApp,
  authAppAccess,
  authAppRole,
  authAuditLog,
  authUser,
} from "@/lib/auth/schema";
import type { AppRole } from "@/lib/database.types";
import { authDb } from "@/lib/db/auth-client";
import { db } from "@/lib/db/client";
import { people as peopleTable, profiles as profilesTable } from "@/lib/db/schema";
import { SUPER_ADMIN_ROLE } from "@/lib/usuarios/super-admin";

export type CatalogRole = {
  key: string;
  label: string;
  description: string | null;
  rank: number;
  isAdmin: boolean;
};

export type CatalogApp = { key: string; label: string; roles: CatalogRole[] };

// Apps in sort order, each with its roles ranked lowest first.
export async function getRoleCatalog(): Promise<CatalogApp[]> {
  const [apps, roles] = await Promise.all([
    authDb.select().from(authApp).orderBy(asc(authApp.sortOrder)),
    authDb.select().from(authAppRole).orderBy(asc(authAppRole.rank)),
  ]);

  return apps.map((app) => ({
    key: app.key,
    label: app.label,
    roles: roles
      .filter((role) => role.app === app.key)
      .map((role) => ({
        key: role.key,
        label: role.label,
        description: role.description,
        rank: role.rank,
        isAdmin: role.isAdmin,
      })),
  }));
}

export type UsuarioAcceso = {
  role: string;
  grantedBy: string | null;
  grantedAt: Date;
};

export type UsuarioRow = {
  userId: string;
  email: string;
  name: string;
  banned: boolean;
  banReason: string | null;
  // auth_user.role; a banned one grants nothing (the view drops it).
  superAdmin: boolean;
  // Explicit rows only: a super admin's are kept so demotion restores them.
  accesos: Record<string, UsuarioAcceso>;
  // Portal Cuenta (Domain DB); its role is what the portal falls back to
  // while the identity has no portal row (until basket#189).
  cuenta: { role: AppRole; fichaName: string | null } | null;
};

// Every identity in the Auth DB, with or without an Acceso or a Cuenta,
// ordered by email. Two databases, joined in memory over the small staff set.
export async function listUsuarios(): Promise<UsuarioRow[]> {
  const [users, accesos] = await Promise.all([
    authDb
      .select({
        userId: authUser.id,
        email: authUser.email,
        name: authUser.name,
        role: authUser.role,
        banned: authUser.banned,
        banReason: authUser.banReason,
      })
      .from(authUser)
      .orderBy(asc(authUser.email), asc(authUser.id)),
    authDb.select().from(authAppAccess),
  ]);

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

  const cuentaByUser = new Map(
    cuentas.flatMap((cuenta) =>
      cuenta.authUserId ? [[cuenta.authUserId, cuenta] as const] : [],
    ),
  );

  return users.map((user) => {
    const cuenta = cuentaByUser.get(user.userId);

    return {
      userId: user.userId,
      email: user.email,
      name: user.name,
      banned: Boolean(user.banned),
      banReason: user.banReason,
      superAdmin: user.role === SUPER_ADMIN_ROLE,
      accesos: Object.fromEntries(
        accesos
          .filter((acceso) => acceso.userId === user.userId)
          .map((acceso) => [
            acceso.app,
            {
              role: acceso.role,
              grantedBy: acceso.grantedBy,
              grantedAt: acceso.grantedAt,
            },
          ]),
      ),
      cuenta: cuenta
        ? { role: cuenta.role, fichaName: cuenta.fichaName ?? null }
        : null,
    };
  });
}

export type IdentityEvent = typeof authAuditLog.$inferSelect;

export async function listRecentIdentityEvents(
  limit = 20,
): Promise<IdentityEvent[]> {
  return authDb
    .select()
    .from(authAuditLog)
    .orderBy(desc(authAuditLog.createdAt), desc(authAuditLog.id))
    .limit(limit);
}

export type Identity = {
  userId: string;
  email: string;
  name: string;
  // Active super admin: every app resolves to its admin role.
  activeSuperAdmin: boolean;
};

export async function findIdentity(userId: string): Promise<Identity | null> {
  const [row] = await authDb
    .select({
      userId: authUser.id,
      email: authUser.email,
      name: authUser.name,
      role: authUser.role,
      banned: authUser.banned,
    })
    .from(authUser)
    .where(eq(authUser.id, userId))
    .limit(1);

  if (!row) {
    return null;
  }

  return {
    userId: row.userId,
    email: row.email,
    name: row.name,
    activeSuperAdmin: row.role === SUPER_ADMIN_ROLE && !row.banned,
  };
}
