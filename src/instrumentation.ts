export async function register() {
  // Node-only: the scheduler uses node-cron + the service-role client.
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const { registerGridSyncScheduler } = await import("@/lib/grid/sync-scheduler");
  registerGridSyncScheduler();

  const { registerFixturesSyncScheduler } = await import("@/lib/fixtures/sync-scheduler");
  registerFixturesSyncScheduler();

  const { registerNotificationScheduler } = await import(
    "@/lib/notifications/scheduler"
  );
  registerNotificationScheduler();
}
