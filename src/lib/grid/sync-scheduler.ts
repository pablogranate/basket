import "server-only";

import cron from "node-cron";

import { appEnv } from "@/lib/env";
import { getLastSuccessfulSync, runGridSync } from "@/lib/grid/sync";

// Skip a cron run if a success started within this window. Guards against
// duplicate fires across server restarts or multiple workers sharing the DB,
// while still allowing the normal 30-minute cadence through.
const MIN_GAP_MS = 25 * 60 * 1000; // 25m

let scheduled = false;

async function runScheduledSync() {
  try {
    const last = await getLastSuccessfulSync();
    if (last?.started_at) {
      const elapsed = Date.now() - new Date(last.started_at).getTime();
      if (elapsed < MIN_GAP_MS) {
        console.info(
          `[grid-sync] skipping cron run; last success ${Math.round(elapsed / 60000)}m ago`,
        );
        return;
      }
    }

    const result = await runGridSync("cron");
    if (result.skipped) {
      console.info("[grid-sync] cron run skipped (sync already in progress)");
      return;
    }

    console.info(
      `[grid-sync] cron run done: ${result.created} creados, ${result.updated} actualizados, ${result.unchanged} sin cambios, ${result.deleted} eliminados, asignaciones +${result.assignmentsUpserted}/-${result.assignmentsDeleted}`,
    );
  } catch (error) {
    console.error("[grid-sync] cron run failed", error);
  }
}

export function registerGridSyncScheduler() {
  if (scheduled) {
    return;
  }

  if (!appEnv.gridSyncEnabled) {
    console.info("[grid-sync] scheduler disabled (GRID_SYNC_ENABLED=false)");
    return;
  }

  if (!cron.validate(appEnv.gridSyncCron)) {
    console.error(`[grid-sync] invalid GRID_SYNC_CRON "${appEnv.gridSyncCron}"; scheduler not started`);
    return;
  }

  scheduled = true;
  cron.schedule(appEnv.gridSyncCron, () => {
    void runScheduledSync();
  });
  console.info(`[grid-sync] scheduler started (${appEnv.gridSyncCron})`);
}
