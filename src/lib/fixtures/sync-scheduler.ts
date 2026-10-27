import "server-only";

import cron from "node-cron";

import { sendFixturesSyncAlertEmail } from "@/lib/email/mailer";
import { appEnv, isSmtpConfigured } from "@/lib/env";
import { FIXTURE_TIMEZONE } from "@/lib/fixtures/schedule";
import { runFixturesSync } from "@/lib/fixtures/sync";
import { buildFixturesSyncAlert, type FixturesSyncAlert } from "@/lib/fixtures/sync-alert";
import { defaultFixturesSyncWindow } from "@/lib/fixtures/window";

let scheduled = false;

async function sendAlert(alert: FixturesSyncAlert | null) {
  if (!alert || !appEnv.fixturesSyncAlertEmail) {
    return;
  }
  if (!isSmtpConfigured) {
    console.warn("[fixtures-sync] SMTP not configured; alert not sent");
    return;
  }

  try {
    await sendFixturesSyncAlertEmail({ to: appEnv.fixturesSyncAlertEmail, ...alert });
  } catch {
    // The mailer already logged it; a failed alert must not crash the cron.
  }
}

async function runScheduledSync() {
  try {
    const result = await runFixturesSync(defaultFixturesSyncWindow(new Date()));
    await sendAlert(buildFixturesSyncAlert({ result }));
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
    await sendAlert(
      buildFixturesSyncAlert({ error: error instanceof Error ? (error.stack ?? error.message) : String(error) }),
    );
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
