import "server-only";

import { addFields } from "basket-tv-telemetry/log";
import cron from "node-cron";

import { sendFixturesSyncAlertEmail } from "@/lib/email/mailer";
import { appEnv, isSmtpConfigured } from "@/lib/env";
import { FIXTURE_TIMEZONE } from "@/lib/fixtures/schedule";
import { runFixturesSync } from "@/lib/fixtures/sync";
import { buildFixturesSyncAlert, type FixturesSyncAlert } from "@/lib/fixtures/sync-alert";
import { defaultFixturesSyncWindow } from "@/lib/fixtures/window";
import { logSchedulerStart, reportError, runJob, storedErrorMessage } from "@/lib/log";

const JOB = "fixtures_sync";

let scheduled = false;

async function sendAlert(alert: FixturesSyncAlert | null) {
  if (!alert || !appEnv.fixturesSyncAlertEmail) {
    return;
  }
  if (!isSmtpConfigured) {
    addFields({ alert: "smtp_missing" });
    return;
  }

  try {
    await sendFixturesSyncAlertEmail({ to: appEnv.fixturesSyncAlertEmail, ...alert });
    addFields({ alert: "sent" });
  } catch {
    // The mailer reported it; a failed alert must not end the run.
    addFields({ alert: "failed" });
  }
}

async function runScheduledSync() {
  let result: Awaited<ReturnType<typeof runFixturesSync>>;
  try {
    result = await runFixturesSync(defaultFixturesSyncWindow(new Date()));
  } catch (error) {
    reportError(error, JOB);
    await sendAlert(buildFixturesSyncAlert({ error: storedErrorMessage(error) }));
    return;
  }

  await sendAlert(buildFixturesSyncAlert({ result }));
  if (result.skipped) {
    addFields({ skipped: result.reason });
    return;
  }

  result.errors.forEach((message) => {
    // A feed failure is caught inside the run and kept as text.
    const error = new Error(message);
    error.name = "FixturesFeedError";
    reportError(error, JOB);
  });
  addFields({
    fixtures_sync: {
      upserted: result.upserted,
      deleted: result.deleted,
      linked: result.linked,
      warnings: result.warnings.length,
      feed_errors: result.errors.length,
    },
  });
}

export function registerFixturesSyncScheduler() {
  if (scheduled) {
    return;
  }

  if (!appEnv.fixturesSyncEnabled) {
    logSchedulerStart(JOB, "disabled");
    return;
  }

  if (!cron.validate(appEnv.fixturesSyncCron)) {
    logSchedulerStart(JOB, "invalid_cron", appEnv.fixturesSyncCron);
    return;
  }

  scheduled = true;
  cron.schedule(
    appEnv.fixturesSyncCron,
    () => {
      void runJob(JOB, runScheduledSync);
    },
    { timezone: FIXTURE_TIMEZONE },
  );
  logSchedulerStart(JOB, "started", appEnv.fixturesSyncCron);
}
