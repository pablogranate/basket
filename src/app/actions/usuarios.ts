"use server";

import { headers } from "next/headers";

import { findIdentityByEmail, grantRole, revokeRole } from "@/lib/acceso/accesos";
import { PORTAL_APP } from "@/lib/acceso/portal";
import {
  grantPortalRoleWithCuenta,
  revokePortalRoleWithCuenta,
} from "@/lib/acceso/portal-cuenta";
import { defineAction } from "@/lib/actions/define-action";
import {
  parseCreateIdentity,
  parseIdentityTarget,
  parseSetAppRole,
  parseSetSuperAdmin,
} from "@/lib/actions/parse/usuarios";
import { auth } from "@/lib/auth/server";
import { authDb } from "@/lib/db/auth-client";
import { isAppRole } from "@/lib/roles";
import { findIdentity, getRoleCatalog } from "@/lib/usuarios/matrix";
import { requireSuperAdmin } from "@/lib/usuarios/guard";
import { recordIdentityEvent, setSuperAdmin } from "@/lib/usuarios/super-admin";

// The apex users section (ADR 0010). requireSuperAdmin runs first in every
// action: 404 off the apex, /no-access for anyone but a super admin. Changes
// apply on the person's next request: every gate reads the Auth DB uncached.

const USUARIOS_REDIRECT = "/usuarios";

async function requireTarget(userId: string) {
  const identity = await findIdentity(userId);

  if (!identity) {
    throw new Error("No se encontró la identidad.");
  }

  return identity;
}

const setAppRole = defineAction({
  fallbackRedirect: USUARIOS_REDIRECT,
  authz: requireSuperAdmin,
  parse: parseSetAppRole,
  revalidate: [USUARIOS_REDIRECT],
  onError: (error) => console.error("[usuarios] role change failed", error),
  async run(actor, { userId, app, role }) {
    const catalogApp = (await getRoleCatalog()).find((entry) => entry.key === app);

    if (!catalogApp) {
      return { error: "App desconocida." };
    }

    const catalogRole = role
      ? catalogApp.roles.find((entry) => entry.key === role)
      : null;

    if (role && !catalogRole) {
      return { error: `Ese rol no existe en ${catalogApp.label}.` };
    }

    const target = await requireTarget(userId);

    // The view resolves a super admin to admin everywhere; an explicit row
    // written now would only surface after a demotion nobody asked about.
    if (target.activeSuperAdmin) {
      return {
        error: "Un super admin es admin en todas las apps. Quitale el super admin primero.",
      };
    }

    if (app === PORTAL_APP) {
      if (!role) {
        const removed = await revokePortalRoleWithCuenta(target);
        return {
          notice: removed
            ? `Acceso a ${catalogApp.label} revocado.`
            : `No había acceso a ${catalogApp.label} para revocar.`,
        };
      }

      if (!isAppRole(role)) {
        return { error: `Ese rol no existe en ${catalogApp.label}.` };
      }

      await grantPortalRoleWithCuenta({ ...target, role, grantedBy: actor.userId });
    } else if (!role) {
      const removed = await revokeRole({ userId, app });
      return {
        notice: removed
          ? `Acceso a ${catalogApp.label} revocado.`
          : `No había acceso a ${catalogApp.label} para revocar.`,
      };
    } else {
      await grantRole({ userId, app, role, grantedBy: actor.userId });
    }

    return { notice: `${catalogApp.label}: ${catalogRole?.label ?? role}.` };
  },
});

export async function setAppRoleAction(formData: FormData) {
  await setAppRole(formData);
}

// No email is sent: the person signs in later by magic link or Google and
// lands on this identity. Verified up front, as a first magic-link login
// would leave it, so same-email Google sign-in links instead of duplicating.
const createIdentity = defineAction({
  fallbackRedirect: USUARIOS_REDIRECT,
  authz: requireSuperAdmin,
  parse: parseCreateIdentity,
  revalidate: [USUARIOS_REDIRECT],
  onError: (error) => console.error("[usuarios] identity create failed", error),
  async run(actor, { email, name }) {
    if (await findIdentityByEmail(email)) {
      return { error: `Ya existe una identidad con ${email}.` };
    }

    const { user } = await auth.api.createUser({
      headers: await headers(),
      body: { email, name, data: { emailVerified: true } },
    });

    await recordIdentityEvent(authDb, {
      actorId: actor.userId,
      targetUserId: user.id,
      action: "identity.create",
      detail: { email },
    });

    return { notice: `Identidad creada: ${email}.` };
  },
});

export async function createIdentityAction(formData: FormData) {
  await createIdentity(formData);
}

// Banning also deletes every session of the identity (admin plugin).
const banIdentity = defineAction({
  fallbackRedirect: USUARIOS_REDIRECT,
  authz: requireSuperAdmin,
  parse: parseIdentityTarget,
  revalidate: [USUARIOS_REDIRECT],
  onError: (error) => console.error("[usuarios] ban failed", error),
  async run(actor, { userId }) {
    const target = await requireTarget(userId);

    if (target.userId === actor.userId) {
      return { error: "No podés bloquearte a vos mismo." };
    }

    await auth.api.banUser({
      headers: await headers(),
      body: { userId, banReason: `Bloqueado por ${actor.email}` },
    });

    await recordIdentityEvent(authDb, {
      actorId: actor.userId,
      targetUserId: userId,
      action: "identity.ban",
    });

    return { notice: `${target.email} bloqueado en todas las apps.` };
  },
});

export async function banIdentityAction(formData: FormData) {
  await banIdentity(formData);
}

const unbanIdentity = defineAction({
  fallbackRedirect: USUARIOS_REDIRECT,
  authz: requireSuperAdmin,
  parse: parseIdentityTarget,
  revalidate: [USUARIOS_REDIRECT],
  onError: (error) => console.error("[usuarios] unban failed", error),
  async run(actor, { userId }) {
    const target = await requireTarget(userId);

    await auth.api.unbanUser({ headers: await headers(), body: { userId } });

    await recordIdentityEvent(authDb, {
      actorId: actor.userId,
      targetUserId: userId,
      action: "identity.unban",
    });

    return { notice: `${target.email} desbloqueado.` };
  },
});

export async function unbanIdentityAction(formData: FormData) {
  await unbanIdentity(formData);
}

const revokeSessions = defineAction({
  fallbackRedirect: USUARIOS_REDIRECT,
  authz: requireSuperAdmin,
  parse: parseIdentityTarget,
  revalidate: [USUARIOS_REDIRECT],
  onError: (error) => console.error("[usuarios] revoke sessions failed", error),
  async run(actor, { userId }) {
    const target = await requireTarget(userId);

    await auth.api.revokeUserSessions({
      headers: await headers(),
      body: { userId },
    });

    await recordIdentityEvent(authDb, {
      actorId: actor.userId,
      targetUserId: userId,
      action: "identity.revoke-sessions",
    });

    return { notice: `Sesiones de ${target.email} cerradas en todos los dispositivos.` };
  },
});

export async function revokeSessionsAction(formData: FormData) {
  await revokeSessions(formData);
}

const setSuperAdminFlag = defineAction({
  fallbackRedirect: USUARIOS_REDIRECT,
  authz: requireSuperAdmin,
  parse: parseSetSuperAdmin,
  revalidate: [USUARIOS_REDIRECT],
  onError: (error) => console.error("[usuarios] super admin change failed", error),
  async run(actor, { userId, superAdmin }) {
    const target = await requireTarget(userId);
    const changed = await setSuperAdmin({
      actorId: actor.userId,
      targetUserId: userId,
      superAdmin,
      source: "usuarios",
    });

    if (!changed) {
      return { notice: "Sin cambios." };
    }

    return {
      notice: superAdmin
        ? `${target.email} ahora es super admin.`
        : `${target.email} ya no es super admin; vuelven a valer sus roles por app.`,
    };
  },
});

export async function setSuperAdminAction(formData: FormData) {
  await setSuperAdminFlag(formData);
}
