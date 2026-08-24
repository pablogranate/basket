"use server";

import { revalidatePath } from "next/cache";

import {
  getRedirectTarget,
  redirectWithNotice,
  rethrowNavigationError,
} from "@/app/actions/helpers";
import { z } from "zod";

import { requireAccessManager } from "@/lib/auth-access";
import {
  previewPeopleSync,
  runPeopleSync,
  type PeopleSyncPreview,
} from "@/lib/people/sync";
import type { TeamsSyncDecisions } from "@/lib/people/sync-preview";
import { ensureErrorMessage } from "@/lib/utils";

// What the modal resolved on screen. Names absent from this payload are not
// created, even if "Listas" grew between the preview and the confirm.
const teamsDecisionsSchema = z.object({
  create: z.array(z.string().trim().min(1)).max(500),
  aliases: z
    .array(z.object({ alias: z.string().trim().min(1), clubId: z.string().uuid() }))
    .max(500),
});

function readTeamDecisions(formData: FormData): TeamsSyncDecisions | undefined {
  const raw = formData.get("teamDecisions");
  if (typeof raw !== "string" || !raw.trim()) {
    return undefined;
  }

  try {
    const parsed = teamsDecisionsSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

// Read-only diff behind the confirmation modal: nothing is written until the
// operator confirms and the form posts syncPeopleAction.
export async function previewPeopleSyncAction(): Promise<PeopleSyncPreview> {
  await requireAccessManager();
  return previewPeopleSync();
}

function buildSyncNotice(result: Awaited<ReturnType<typeof runPeopleSync>>) {
  const parts = [
    ...(result.teamsCreated ? [`${result.teamsCreated} equipos creados`] : []),
    `${result.created} creados`,
    `${result.updated} actualizados`,
    `${result.restored} restaurados`,
    `${result.deleted} eliminados`,
    `${result.unchanged} sin cambios`,
    ...(result.skippedRows ? [`${result.skippedRows} filas descartadas`] : []),
  ];

  return `Sincronización de contactos lista — ${parts.join(", ")}.`;
}

export async function syncPeopleAction(formData: FormData) {
  const redirectTo = getRedirectTarget(formData, "/people");

  try {
    // Admin + Productor (access managers) may run the sync.
    await requireAccessManager();

    const result = await runPeopleSync("manual", readTeamDecisions(formData));

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
