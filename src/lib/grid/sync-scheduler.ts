import "server-only";

import { addFields } from "basket-tv-telemetry/log";
import cron from "node-cron";

import { appEnv } from "@/lib/env";
import { getLastSuccessfulSync, runGridSync } from "@/lib/grid/sync";
import { logSchedulerStart, runJob } from "@/lib/log";

// Skip a cron run if a success started within this window. Guards against
// duplicate fires across server restarts or multiple workers sharing the DB,
// while still allowing the normal 30-minute cadence through.
const MIN_GAP_MS = 25 * 60 * 1000; // 25m
const JOB = "grid_sync";

let scheduled = false;

async function runScheduledSync() {
  const last = await getLastSuccessfulSync();
  if (last?.started_at) {
    const elapsed = Date.now() - new Date(last.started_at).getTime();
    if (elapsed < MIN_GAP_MS) {
      addFields({ skipped: "recent_success" });
      return;
    }
  }

  const result = await runGridSync("cron");
  if (result.skipped) {
    addFields({ skipped: "in_progress" });
  }
}

export function registerGridSyncScheduler() {
  if (scheduled) {
    return;
  }

  if (!appEnv.gridSyncEnabled) {
    logSchedulerStart(JOB, "disabled");
    return;
  }

  if (!cron.validate(appEnv.gridSyncCron)) {
    logSchedulerStart(JOB, "invalid_cron", appEnv.gridSyncCron);
    return;
  }

  scheduled = true;
  cron.schedule(appEnv.gridSyncCron, () => {
    void runJob(JOB, runScheduledSync);
  });
  logSchedulerStart(JOB, "started", appEnv.gridSyncCron);
}
