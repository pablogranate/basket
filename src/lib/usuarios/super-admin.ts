import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { authAuditLog, authUser } from "@/lib/auth/schema";
import { authDb } from "@/lib/db/auth-client";

// Super admin = auth_user.role 'superadmin', not banned (ADR 0010), the same
// rule auth_effective_access applies. Read uncached from the Auth DB: the
// session cookie cache would let a demoted super admin in for up to a minute.

export const SUPER_ADMIN_ROLE = "superadmin";
// The admin plugin's default role; what a demoted super admin goes back to.
export const DEFAULT_IDENTITY_ROLE = "user";

export const LAST_SUPER_ADMIN_MESSAGE =
  "No se puede quitar el último super admin.";

export type SuperAdmin = { userId: string; email: string; name: string };

const isActiveSuperAdmin = and(
  eq(authUser.role, SUPER_ADMIN_ROLE),
  sql`coalesce(${authUser.banned}, false) = false`,
);

export async function findActiveSuperAdmin(
  userId: string,
): Promise<SuperAdmin | null> {
  const rows = await authDb
    .select({ userId: authUser.id, email: authUser.email, name: authUser.name })
    .from(authUser)
    .where(and(eq(authUser.id, userId), isActiveSuperAdmin))
    .limit(1);

  return rows[0] ?? null;
}

export type IdentityEventAction =
  | "identity.create"
  | "identity.ban"
  | "identity.unban"
  | "identity.revoke-sessions"
  | "superadmin.set"
  | "superadmin.unset";

type AuthExecutor = Pick<typeof authDb, "insert">;

export async function recordIdentityEvent(
  exec: AuthExecutor,
  input: {
    actorId: string | null;
    targetUserId: string;
    action: IdentityEventAction;
    detail?: Record<string, unknown>;
  },
): Promise<void> {
  await exec.insert(authAuditLog).values({
    actorId: input.actorId,
    targetUserId: input.targetUserId,
    action: input.action,
    detail: input.detail ?? null,
  });
}

// Sets or removes super admin in one Auth DB transaction with its audit row.
// Every active super admin row is locked before counting, so two concurrent
// demotions serialise and the second sees the first one's result. Written
// here rather than through the admin plugin's setRole, whose own write could
// not join this transaction. Returns whether anything changed.
export async function setSuperAdmin(input: {
  actorId: string | null;
  targetUserId: string;
  superAdmin: boolean;
  source: "usuarios" | "bootstrap";
}): Promise<boolean> {
  return authDb.transaction(async (tx) => {
    const activeSuperAdmins = await tx
      .select({ id: authUser.id })
      .from(authUser)
      .where(isActiveSuperAdmin)
      .for("update");

    const [target] = await tx
      .select({ id: authUser.id, role: authUser.role })
      .from(authUser)
      .where(eq(authUser.id, input.targetUserId))
      .for("update");

    if (!target) {
      throw new Error("No se encontró la identidad.");
    }

    if ((target.role === SUPER_ADMIN_ROLE) === input.superAdmin) {
      return false;
    }

    if (
      !input.superAdmin &&
      activeSuperAdmins.length <= 1 &&
      activeSuperAdmins.some((row) => row.id === target.id)
    ) {
      throw new Error(LAST_SUPER_ADMIN_MESSAGE);
    }

    await tx
      .update(authUser)
      .set({
        role: input.superAdmin ? SUPER_ADMIN_ROLE : DEFAULT_IDENTITY_ROLE,
        updatedAt: new Date(),
      })
      .where(eq(authUser.id, target.id));

    await recordIdentityEvent(tx, {
      actorId: input.actorId,
      targetUserId: target.id,
      action: input.superAdmin ? "superadmin.set" : "superadmin.unset",
      detail: { source: input.source, previousRole: target.role },
    });

    console.info(
      `[usuarios] super admin ${input.superAdmin ? "set" : "removed"}`,
      { target: target.id, actor: input.actorId, source: input.source },
    );

    return true;
  });
}
