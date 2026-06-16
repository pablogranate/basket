import "server-only";

import cron from "node-cron";

import { appEnv } from "@/lib/env";
import { runMatchDayNotifications } from "@/lib/notifications/send-match-day";

const ARG_TZ = "America/Argentina/Buenos_Aires";
// Hourly catch-up: no-ops when every qualifying match is already marked (D6).
const CATCHUP_CRON = "0 * * * *";

let scheduled = false;

export function registerNotificationScheduler() {
  if (scheduled) {
    return;
  }

  if (!appEnv.notificationsEnabled) {
    console.info(
      "[notifications] scheduler disabled (NOTIFICATIONS_ENABLED=false)",
    );
    return;
  }

  if (!cron.validate(appEnv.notificationsCron)) {
    console.error(
      `[notifications] invalid NOTIFICATIONS_CRON "${appEnv.notificationsCron}"; scheduler not started`,
    );
    return;
  }

  scheduled = true;

  cron.schedule(
    appEnv.notificationsCron,
    () => {
      void runMatchDayNotifications("cron");
    },
    { timezone: ARG_TZ },
  );

  cron.schedule(
    CATCHUP_CRON,
    () => {
      void runMatchDayNotifications("catchup");
    },
    { timezone: ARG_TZ },
  );

  // Catch-up after a restart: if the process was down at 12:30, the boot tick
  // sends today's still-unmarked qualifying matches once now >= 12:30 ARG.
  void runMatchDayNotifications("boot");

  console.info(
    `[notifications] scheduler started (main "${appEnv.notificationsCron}", catch-up "${CATCHUP_CRON}", tz ${ARG_TZ})`,
  );
}
