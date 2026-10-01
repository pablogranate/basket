"use server";

import { eq } from "drizzle-orm";

import {
  checkAccessRequestFuncion,
  parseApproveAccessRequest,
  parseLinkProfileToPerson,
  parseRejectAccessRequest,
  parseSubmitAccessRequest,
} from "@/lib/actions/parse/access-requests";
import { defineAction } from "@/lib/actions/define-action";
import { listCatalogApps } from "@/lib/acceso/accesos";
import { resolveRequestApp } from "@/lib/acceso/catalog";
import { buildNoAccessPath } from "@/lib/access-requests/no-access";
import { notifyAccessRequest } from "@/lib/access-requests/notify";
import {
  approvePortalAccessRequest,
  rejectPortalAccessRequest,
} from "@/lib/access-requests/portal-approval";
import { submitAccessRequest } from "@/lib/access-requests/requests";
import { clearProfileCache, requireUserContext } from "@/lib/auth";
import {
  requireAccessRequestApprover,
  requireAdmin,
} from "@/lib/auth-access";
import type { AppRole } from "@/lib/database.types";
import { canGrantRole } from "@/lib/roles";
import { writeAudit } from "@/lib/audit";
import { authDb } from "@/lib/db/auth-client";
import { db } from "@/lib/db/client";
import { roles as rolesTable } from "@/lib/db/schema";
import { sendCollaboratorInviteEmail } from "@/lib/email/mailer";
import { appEnv } from "@/lib/env";
import { linkProfileToPerson } from "@/lib/people/identity";

const REQUEST_REVALIDATE_PATHS = [
  "/",
  "/no-access",
  "/notifications/solicitudes",
  "/people",
];

const submit = defineAction({
  fallbackRedirect: "/no-access",
  authz: requireUserContext,
  parse: parseSubmitAccessRequest,
  revalidate: REQUEST_REVALIDATE_PATHS,
  async run(ctx, input) {
    if (!ctx.userId || !ctx.email) {
      throw new Error("Necesitás iniciar sesión para pedir acceso.");
    }

    const apps = await listCatalogApps();
    const app = resolveRequestApp(
      input.app,
      apps.map((entry) => entry.key),
    );
    const appLabel = apps.find((entry) => entry.key === app)?.label ?? app;
    const funcion = checkAccessRequestFuncion({ app, funcion: input.funcion });
    const redirectTo = buildNoAccessPath(app);

    if (!funcion.ok) {
      return { error: funcion.error, redirectTo };
    }

    const request = {
      fullName: input.fullName,
      phone: input.phone,
      funcion: funcion.funcion,
      ciudad: input.ciudad,
      mensaje: input.mensaje,
    };
    const { email } = await submitAccessRequest(authDb, {
      ...request,
      userId: ctx.userId,
      app,
      email: ctx.email,
    });

    // The request is persisted; the notification is best-effort on purpose.
    try {
      await notifyAccessRequest({ ...request, app, appLabel, email });
    } catch (error) {
      console.error("[access-requests] notification failed", error);
    }

    return {
      notice: "Solicitud enviada. Te avisamos por correo cuando se apruebe.",
      redirectTo,
    };
  },
});

export async function submitAccessRequestAction(formData: FormData) {
  await submit(formData);
}

// The portal bell decides portal Solicitudes only: the claim is scoped to the
// portal, so a request for another app can't be settled from here.
const reject = defineAction({
  fallbackRedirect: "/grid",
  authz: requireAccessRequestApprover,
  // A permission error surfaces as a notice instead of an unhandled action
  // rejection (mirrors revokePersonAccessAction).
  authzFailureNotice: true,
  parse: parseRejectAccessRequest,
  revalidate: REQUEST_REVALIDATE_PATHS,
  async run(ctx, { requestId }) {
    await rejectPortalAccessRequest({ requestId, deciderId: ctx.userId });

    await writeAudit(ctx, {
      table: "access_requests",
      recordId: requestId,
      action: "UPDATE",
      before: { status: "pendiente" },
      after: { status: "rechazada" },
    });

    return { notice: "Solicitud rechazada." };
  },
});

export async function rejectAccessRequestAction(formData: FormData) {
  await reject(formData);
}

const approve = defineAction({
  fallbackRedirect: "/grid",
  authz: requireAccessRequestApprover,
  authzFailureNotice: true,
  parse: parseApproveAccessRequest,
  revalidate: REQUEST_REVALIDATE_PATHS,
  async run(
    ctx,
    { requestId, fullName, phone, roleId, personId, mergePersonId, requestedTier },
  ) {
    // Productores can only mint Externo logins; downgrade anything higher rather
    // than trusting the submitted tier.
    const accessRole: AppRole = canGrantRole(ctx, requestedTier)
      ? requestedTier
      : "collaborator";

    if (roleId) {
      const roleRows = await db
        .select({ id: rolesTable.id })
        .from(rolesTable)
        .where(eq(rolesTable.id, roleId))
        .limit(1);

      if (!roleRows[0]) {
        throw new Error("La función elegida ya no existe.");
      }
    }

    const result = await approvePortalAccessRequest({
      requestId,
      deciderId: ctx.userId,
      actor: ctx,
      fullName,
      phone,
      roleId,
      personId,
      mergePersonId,
      accessRole,
    });

    clearProfileCache();

    await writeAudit(ctx, {
      table: "access_requests",
      recordId: requestId,
      action: "UPDATE",
      before: { status: "pendiente" },
      after: {
        status: "aprobada",
        email: result.email,
        full_name: fullName,
        phone,
        role_id: roleId,
        access_role: accessRole,
        profile_id: result.profileId,
        person_id: result.personId,
        merged_person_id: mergePersonId,
      },
    });

    // The approval is committed: a failing invite must not undo it.
    let emailNotice = "";
    try {
      await sendCollaboratorInviteEmail({
        to: result.email,
        loginUrl: `${appEnv.portalBaseUrl}/login`,
      });
    } catch (error) {
      console.error("[access-requests] invite email failed", error);
      emailNotice = " No pudimos enviarle el correo de aviso.";
    }

    return { notice: `Solicitud aprobada.${emailNotice}` };
  },
});

export async function approveAccessRequestAction(formData: FormData) {
  await approve(formData);
}

// Resolves one row of the 0034 backfill review list: link a cuenta to the ficha
// an admin confirms is the same person (D-09). Admin-only — the review list
// lives on an admin-only page.
const link = defineAction({
  fallbackRedirect: "/notifications/solicitudes",
  authz: requireAdmin,
  authzFailureNotice: true,
  parse: parseLinkProfileToPerson,
  revalidate: REQUEST_REVALIDATE_PATHS,
  async run(ctx, { profileId, personId }) {
    await linkProfileToPerson(db, { profileId, personId, actor: ctx });

    await writeAudit(ctx, {
      table: "people",
      recordId: personId,
      action: "UPDATE",
      before: null,
      after: { id: personId, profile_id: profileId },
    });

    clearProfileCache();

    return { notice: "Cuenta vinculada a la ficha." };
  },
});

export async function linkProfileToPersonAction(formData: FormData) {
  await link(formData);
}
