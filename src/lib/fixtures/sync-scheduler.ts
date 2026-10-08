import "server-only";

import cron from "node-cron";

import { appEnv } from "@/lib/env";
import { FIXTURE_TIMEZONE } from "@/lib/fixtures/schedule";
import { runFixturesSync } from "@/lib/fixtures/sync";
import { defaultFixturesSyncWindow } from "@/lib/fixtures/window";

let scheduled = false;

async function runScheduledSync() {
  try {
    const result = await runFixturesSync(defaultFixturesSyncWindow(new Date()));
    if (result.skipped) {
      console.info(`[fixtures-sync] cron run skipped (${result.reason})`);
      return;
    }

    result.warnings.forEach((warning) => console.warn(`[fixtures-sync] ${warning}`));
    result.errors.forEach((error) => console.error(`[fixtures-sync] ${error}`));
    console.info(
      `[fixtures-sync] cron run done (${result.from} a ${result.to}): ${result.upserted} guardados, ${result.deleted} eliminados, ${result.linked} vinculados`,
    );
  } catch (error) {
    console.error("[fixtures-sync] cron run failed", error);
  }
}

export function registerFixturesSyncScheduler() {
  if (scheduled) {
    return;
  }

  if (!appEnv.fixturesSyncEnabled) {
    console.info("[fixtures-sync] scheduler disabled (FIXTURES_SYNC_ENABLED=false)");
    return;
  }

  if (!cron.validate(appEnv.fixturesSyncCron)) {
    console.error(`[fixtures-sync] invalid FIXTURES_SYNC_CRON "${appEnv.fixturesSyncCron}"; scheduler not started`);
    return;
  }

  scheduled = true;
  cron.schedule(
    appEnv.fixturesSyncCron,
    () => {
      void runScheduledSync();
    },
    { timezone: FIXTURE_TIMEZONE },
  );
  console.info(`[fixtures-sync] scheduler started (${appEnv.fixturesSyncCron} ${FIXTURE_TIMEZONE})`);
}
