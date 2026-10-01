"use server";

import { listCatalogApps } from "@/lib/acceso/accesos";
import { appSubdomain } from "@/lib/acceso/catalog";
import { defineAction } from "@/lib/actions/define-action";
import { parseAppAccessRequestDecision } from "@/lib/actions/parse/access-requests";
import {
  approveAppAccessRequest,
  rejectAppAccessRequest,
} from "@/lib/access-requests/app-approval";
import { buildAppUrlFromAnyHost } from "@/lib/constants";
import { sendCollaboratorInviteEmail } from "@/lib/email/mailer";
import { appEnv } from "@/lib/env";
import { requireSuperAdmin } from "@/lib/usuarios/guard";

// Sibling Solicitudes decided from the apex bell. Super admins only, checked
// in every action (requireSuperAdmin also 404s off the apex). Portal
// Solicitudes keep their own form and actions (access-requests.ts).

const APEX_REDIRECT = "/";

async function appLabel(app: string): Promise<string> {
  const catalog = await listCatalogApps();
  return catalog.find((entry) => entry.key === app)?.label ?? app;
}

// Hosts stay in config (ADR 0010): the app's origin is derived from the
// portal's.
function appUrl(app: string): string {
  const portalHost = new URL(appEnv.portalBaseUrl).host;
  return buildAppUrlFromAnyHost(portalHost, appSubdomain(app)) ?? appEnv.portalBaseUrl;
}

const approve = defineAction({
  fallbackRedirect: APEX_REDIRECT,
  authz: requireSuperAdmin,
  parse: parseAppAccessRequestDecision,
  revalidate: [APEX_REDIRECT],
  onError: (error) => console.error("[access-requests] apex approval failed", error),
  async run(actor, { requestId, app, role }) {
    if (!role) {
      return { error: "Elegí un rol." };
    }

    const approval = await approveAppAccessRequest({
      requestId,
      app,
      role,
      deciderId: actor.userId,
    });
    const label = await appLabel(app);

    // The approval is committed: a failing invite must not undo it.
    let emailNotice = "";
    try {
      await sendCollaboratorInviteEmail({
        to: approval.email,
        loginUrl: appUrl(app),
        appName: label,
      });
    } catch (error) {
      console.error("[access-requests] invite email failed", error);
      emailNotice = " No pudimos enviarle el correo de aviso.";
    }

    return {
      notice: `Solicitud aprobada: ${approval.email} es ${approval.roleLabel} en ${label}.${emailNotice}`,
    };
  },
});

export async function approveAppAccessRequestAction(formData: FormData) {
  await approve(formData);
}

const reject = defineAction({
  fallbackRedirect: APEX_REDIRECT,
  authz: requireSuperAdmin,
  parse: parseAppAccessRequestDecision,
  revalidate: [APEX_REDIRECT],
  onError: (error) => console.error("[access-requests] apex rejection failed", error),
  async run(actor, { requestId, app }) {
    await rejectAppAccessRequest({ requestId, app, deciderId: actor.userId });

    return { notice: "Solicitud rechazada." };
  },
});

export async function rejectAppAccessRequestAction(formData: FormData) {
  await reject(formData);
}
