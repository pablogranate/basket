import { requestIdOf } from "basket-tv-telemetry/log";
import type { Instrumentation } from "next";

import { telemetry } from "@/lib/telemetry";

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
export const onRequestError: Instrumentation.onRequestError = (
  error,
  request,
  context,
) => {
  telemetry.reportServerError(error, {
    method: request.method,
    route: context.routePath,
    route_type: context.routeType,
    request_id: requestIdOf(error),
  });
};
