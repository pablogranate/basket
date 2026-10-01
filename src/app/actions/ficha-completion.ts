"use server";

import { parseCompleteFicha } from "@/lib/actions/parse/ficha-completion";
import { defineAction } from "@/lib/actions/define-action";
import { requireAccess } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { db } from "@/lib/db/client";
import { resolveFuncionRoleId } from "@/lib/people/ficha-completion-data";
import { completeOwnFicha } from "@/lib/people/identity";

// A portal user fills in their own ficha from the completion modal. No
// approval: holding the portal Acceso already is one. The session is the only
// input to whose ficha this is.
const complete = defineAction({
  fallbackRedirect: "/mi-jornada",
  authz: requireAccess,
  authzFailureNotice: true,
  parse: parseCompleteFicha,
  revalidate: ["/people"],
  async run(ctx, { funcion, phone, ciudad }) {
    if (!ctx.profileId || !ctx.email) {
      throw new Error("Tu cuenta no está lista para cargar una ficha.");
    }

    const { profileId, email } = ctx;
    const fullName =
      ctx.profile?.full_name?.trim() || email.split("@")[0] || email;
    const roleId = await resolveFuncionRoleId(db, funcion);
    const result = await db.transaction((tx) =>
      completeOwnFicha(tx, {
        profileId,
        email,
        fullName,
        phone,
        roleId,
        ciudad,
        actor: ctx,
      }),
    );

    if (result.kind === "review") {
      return {
        notice:
          "Encontramos una ficha con tu nombre: un admin la va a vincular a tu cuenta.",
      };
    }

    await writeAudit(ctx, {
      table: "people",
      recordId: result.personId,
      action: result.kind === "created" ? "INSERT" : "UPDATE",
      before: null,
      after: {
        id: result.personId,
        profile_id: profileId,
        phone,
        role_id: roleId,
        ciudad,
      },
    });

    return {
      notice:
        result.kind === "created"
          ? "Listo, creamos tu ficha."
          : "Listo, vinculamos tu ficha.",
    };
  },
});

export async function completeFichaAction(formData: FormData) {
  await complete(formData);
}
