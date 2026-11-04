import { scrubMessage } from "basket-tv-telemetry";
import {
  currentEvent,
  emit,
  emitThrottled,
  markError,
  runLogged,
  startEvent,
  type WideEvent,
} from "basket-tv-telemetry/log";

import { isDomainError } from "@/lib/errors";
import { telemetry } from "@/lib/telemetry";

const MAX_DETAIL_LENGTH = 200;

const ROUTE_TYPE: Partial<Record<WideEvent["kind"], string>> = {
  request: "route",
  action: "action",
  job: "job",
};

// A caught failure that is not a DomainError (an outcome, not a failure) is
// printed once and reported once. Inside a request, action or job it marks
// that unit's line, whose route the report takes. Outside one (a page render's
// loader, an email Better Auth sends) it is a `message` line of its own,
// throttled per route: a dependency that is down fails on every render.
export function reportError(
  error: unknown,
  route: string,
  context: { routeType?: "render" | "auth"; userId?: string | null } = {},
): void {
  if (isDomainError(error)) {
    return;
  }

  const event = currentEvent();

  if (event) {
    markError(error, event);
    telemetry.reportServerError(error, {
      route_type: ROUTE_TYPE[event.kind],
      userId: context.userId ?? undefined,
    });
    return;
  }

  const line = startEvent("message", { route });
  markError(error, line);
  emitThrottled(route, line);
  telemetry.reportServerError(error, {
    route,
    route_type: context.routeType ?? "render",
    userId: context.userId,
  });
}

// One `job` line per scheduler run. A failure is reported and ends the run;
// it never reaches the cron.
export async function runJob(route: string, run: () => Promise<void>): Promise<void> {
  await runLogged(startEvent("job", { route }), async () => {
    try {
      await run();
    } catch (error) {
      reportError(error, route);
    }
  });
}

// One `start` line per scheduler at boot: whether it runs, and on what cron.
export function logSchedulerStart(
  route: string,
  scheduler: "started" | "disabled" | "invalid_cron",
  cron?: string,
): void {
  emit({
    ts: new Date().toISOString(),
    level: scheduler === "invalid_cron" ? "error" : "info",
    kind: "start",
    route,
    scheduler,
    cron,
  });
}

// The start of an upstream response body, scrubbed.
export function upstreamDetail(body: string): string {
  return scrubMessage(body).slice(0, MAX_DETAIL_LENGTH);
}

// A message to store where a page or a response reads it back later: a
// DomainError's own text, otherwise the scrubbed message. Driver errors are
// not always Error instances, so `.message` is read explicitly.
export function storedErrorMessage(error: unknown): string {
  if (isDomainError(error)) {
    return error.message;
  }

  const message =
    error instanceof Error
      ? error.message
      : (error as { message?: unknown } | null)?.message;
  return scrubMessage(
    typeof message === "string" && message ? message : String(error),
  );
}
