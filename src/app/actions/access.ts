"use server";

import { grantAcceso, revokeAcceso } from "@/lib/acceso/accesos";
import {
  ACCESO_LEVEL_LABELS,
  SIBLING_APP_LABELS,
} from "@/lib/acceso/catalog";
import { defineAction } from "@/lib/actions/define-action";
import { parseSetAcceso } from "@/lib/actions/parse/access";
import { requireAdmin } from "@/lib/auth-access";

// One cell of the Accesos matrix (ADR 0009): admins only; editors are refused
// server-side, not just hidden. Takes effect on the person's next request in
// that app — readers look the row up per request, no cache.
const setAcceso = defineAction({
  fallbackRedirect: "/access",
  authz: requireAdmin,
  authzFailureNotice: true,
  parse: parseSetAcceso,
  revalidate: ["/access"],
  async run(ctx, { userId, app, level }) {
    const appLabel = SIBLING_APP_LABELS[app];

    if (level === null) {
      const removed = await revokeAcceso({ userId, app });
      return {
        notice: removed
          ? `Acceso a ${appLabel} revocado.`
          : `No había acceso a ${appLabel} para revocar.`,
      };
    }

    await grantAcceso({ userId, app, level, grantedBy: ctx.userId });

    return {
      notice: `Acceso a ${appLabel}: ${ACCESO_LEVEL_LABELS[level]}.`,
    };
  },
});

export async function setAccesoAction(formData: FormData) {
  await setAcceso(formData);
}
