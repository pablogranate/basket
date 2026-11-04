import type { Instrumentation } from "next";

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

// Every uncaught error of a render, route handler, server action or the proxy
// goes to basket-telemetry with the route pattern, never the concrete path
// (it carries ids), and the request id of the line the error marked. Server
// actions built with defineAction catch their own errors and report them there.
// Next bundles this file into the edge middleware too, and basket-tv-telemetry
// is Node-only, so it is only loaded dynamically, on Node: a static import
// makes every request answer 500.
export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const [{ telemetry }, { requestIdOf }] = await Promise.all([
    import("@/lib/telemetry"),
    import("basket-tv-telemetry/log"),
  ]);
  telemetry.reportServerError(error, {
    method: request.method,
    route: context.routePath,
    route_type: context.routeType,
    request_id: requestIdOf(error),
  });
};
