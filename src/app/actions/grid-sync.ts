"use server";

import { revalidatePath } from "next/cache";

import {
  getRedirectTarget,
  redirectWithNotice,
  rethrowNavigationError,
} from "@/app/actions/helpers";
import { requireEditor } from "@/lib/auth";
import { runGridSync } from "@/lib/grid/sync";
import { ensureErrorMessage } from "@/lib/utils";

function buildSyncNotice(result: Awaited<ReturnType<typeof runGridSync>>) {
  const parts = [
    `${result.created} creados`,
    `${result.updated} actualizados`,
    `${result.unchanged} sin cambios`,
    `${result.deleted} eliminados`,
  ];

  if (result.assignmentsUpserted || result.assignmentsDeleted) {
    parts.push(
      `asignaciones +${result.assignmentsUpserted}/-${result.assignmentsDeleted}`,
    );
  }

  if (result.tabsMissing.length) {
    parts.push(`pestañas omitidas: ${result.tabsMissing.join(", ")}`);
  }

  return `Sincronización lista — ${parts.join(", ")}.`;
}

export async function syncGridAction(formData: FormData) {
  const redirectTo = getRedirectTarget(formData, "/grid");

  try {
    await requireEditor();

    const result = await runGridSync("manual");

    if (result.skipped) {
      redirectWithNotice({
        redirectTo,
        intent: "error",
        notice: "Ya hay una sincronización en curso. Probá de nuevo en unos segundos.",
      });
      return;
    }

    revalidatePath("/grid");

    redirectWithNotice({
      redirectTo,
      intent: result.errors.length ? "error" : "success",
      notice: result.errors.length
        ? `${buildSyncNotice(result)} Con avisos: ${result.errors[0]}`
        : buildSyncNotice(result),
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
