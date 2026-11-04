"use server";

import { addFields } from "basket-tv-telemetry/log";
import { withActionLog } from "basket-tv-telemetry/next";
import { revalidatePath } from "next/cache";

import {
  getRedirectTarget,
  redirectWithNotice,
  rethrowNavigationError,
} from "@/app/actions/helpers";
import { requireEditor } from "@/lib/auth";
import { userErrorMessage } from "@/lib/errors";
import { previewGridSync, runGridSync } from "@/lib/grid/sync";
import { updateChangesMatchRow } from "@/lib/grid/sync-plan";
import type { SyncDeletePassSkipReason } from "@/lib/grid/sync-plan";
import { reportError } from "@/lib/log";
import { telemetry } from "@/lib/telemetry";

export type GridSyncPreview = {
  creates: number;
  updates: number;
  unchanged: number;
  deletes: Array<{ id: string; label: string }>;
  assignmentUpserts: number;
  assignmentDeletes: number;
  peopleToCreate: string[];
  peopleToResurrect: string[];
  errors: string[];
  warnings: string[];
  tabsSynced: string[];
  tabsMissing: string[];
  deletePassSkipped: SyncDeletePassSkipReason | null;
};

// Plan-only preview for the manual sync: fetch → parse → snapshots → plan,
// nothing written. Confirming re-runs the full sync fresh — the previewed plan
// is informative and never applied as-is.
export const previewGridSyncAction = withActionLog("previewGridSyncAction", async (): Promise<GridSyncPreview> => {
  await requireEditor();

  const plan = await previewGridSync();

  return {
    creates: plan.creates.length,
    updates: plan.updates.filter(updateChangesMatchRow).length,
    unchanged: plan.unchanged,
    deletes: plan.deletes,
    assignmentUpserts:
      plan.creates.reduce((sum, item) => sum + item.assignments.length, 0) +
      plan.updates.reduce((sum, item) => sum + item.assignmentUpserts.length, 0),
    assignmentDeletes: plan.updates.reduce(
      (sum, item) => sum + item.assignmentDeletes.length,
      0,
    ),
    peopleToCreate: plan.peopleToCreate.map((person) => person.name),
    peopleToResurrect: plan.peopleToResurrect.map((person) => person.name),
    errors: plan.errors,
    warnings: plan.warnings,
    tabsSynced: plan.tabsSynced,
    tabsMissing: plan.tabsMissing,
    deletePassSkipped: plan.deletePassSkipped,
  };
});

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

export const syncGridAction = withActionLog("syncGridAction", async (formData: FormData) => {
  const redirectTo = getRedirectTarget(formData, "/grid");
  try {
    const ctx = await requireEditor();

    const result = await runGridSync("manual");

    if (result.skipped) {
      addFields({ outcome: "rejected", reason: "sync_in_progress" });
      redirectWithNotice({
        redirectTo,
        intent: "error",
        notice: "Ya hay una sincronización en curso. Probá de nuevo en unos segundos.",
      });
      return;
    }

    telemetry.trackServerEvent("grid_synced", ctx.userId, {
      created: result.created,
      updated: result.updated,
    });

    revalidatePath("/grid");

    redirectWithNotice({
      redirectTo,
      intent: result.errors.length ? "error" : "success",
      notice: result.errors.length
        ? `${buildSyncNotice(result)} Con avisos: ${result.errors[0]}${
            result.errors.length > 1 ? ` (+${result.errors.length - 1} más)` : ""
          }`
        : buildSyncNotice(result),
    });
  } catch (error) {
    rethrowNavigationError(error);
    reportError(error, "syncGridAction");

    redirectWithNotice({
      redirectTo,
      intent: "error",
      notice: userErrorMessage(error),
    });
  }
});
