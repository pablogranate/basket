"use server";

import { revalidatePath } from "next/cache";

import {
  getRedirectTarget,
  redirectWithNotice,
  rethrowNavigationError,
} from "@/app/actions/helpers";
import { requireAccessManager } from "@/lib/auth-access";
import { runPeopleSync } from "@/lib/people/sync";
import { ensureErrorMessage } from "@/lib/utils";

function buildSyncNotice(result: Awaited<ReturnType<typeof runPeopleSync>>) {
  const parts = [
    `${result.created} creados`,
    `${result.updated} actualizados`,
    `${result.restored} restaurados`,
    `${result.deleted} eliminados`,
    `${result.unchanged} sin cambios`,
  ];

  return `Sincronización de contactos lista — ${parts.join(", ")}.`;
}

export async function syncPeopleAction(formData: FormData) {
  const redirectTo = getRedirectTarget(formData, "/people");

  try {
    // Admin + Productor (access managers) may run the sync.
    await requireAccessManager();

    const result = await runPeopleSync("manual");

    if (result.skipped) {
      redirectWithNotice({
        redirectTo,
        intent: "error",
        notice:
          "Ya hay una sincronización de contactos en curso. Probá de nuevo en unos segundos.",
      });
      return;
    }

    revalidatePath("/people");

    if (result.status === "error") {
      redirectWithNotice({
        redirectTo,
        intent: "error",
        notice: result.error ?? "La sincronización de contactos falló.",
      });
      return;
    }

    const warningSuffix = result.warnings.length
      ? ` Con avisos: ${result.warnings[0]}${
          result.warnings.length > 1
            ? ` (+${result.warnings.length - 1} más)`
            : ""
        }`
      : "";

    redirectWithNotice({
      redirectTo,
      intent: result.warnings.length ? "error" : "success",
      notice: `${buildSyncNotice(result)}${warningSuffix}`,
    });
  } catch (error) {
    rethrowNavigationError(error);

    redirectWithNotice({
      redirectTo,
      intent: "error",
      notice: ensureErrorMessage(error),
    });
  }
}
