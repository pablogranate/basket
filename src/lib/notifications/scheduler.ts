import "server-only";

import cron from "node-cron";

import { appEnv } from "@/lib/env";
import { logSchedulerStart, runJob } from "@/lib/log";
import { runMatchDayNotifications } from "@/lib/notifications/send-match-day";

const ARG_TZ = "America/Argentina/Buenos_Aires";
// Hourly tick is the sole engine. It fires exactly at 11:00 and 22:00 (the two
// send times) and every other hour acts as a catch-up; per-match send time
// decides which matches are due (see schedule.ts / send-match-day.ts).
const TICK_CRON = "0 * * * *";
const JOB = "match_day_notifications";

let scheduled = false;

export function registerNotificationScheduler() {
  if (scheduled) {
    return;
  }

  if (!appEnv.notificationsEnabled) {
    logSchedulerStart(JOB, "disabled");
    return;
  }

  scheduled = true;

  cron.schedule(
    TICK_CRON,
    () => {
      void runJob(JOB, () => runMatchDayNotifications("catchup"));
    },
    { timezone: ARG_TZ },
  );

  // Catch-up after a restart: send any match whose send time has already passed
  // and that is still unmarked.
  void runJob(JOB, () => runMatchDayNotifications("boot"));

  logSchedulerStart(JOB, "started", TICK_CRON);
}
