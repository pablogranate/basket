import { appEnv } from "@/lib/env";

// Server reporter to basket-telemetry (its SPEC §11.2 and §6.2). Errors,
// business events and auth events are batched for 1 s and sent in one POST
// to the loopback ingest with this app's token. Without TELEMETRY_TOKEN (dev,
// tests, CI) it is a no-op. It never throws, is never awaited on a response
// path, and aborts a send after 1.5 s. Not "server-only": src/instrumentation.ts
// imports it, and on the client the token is unset so it is inert anyway.

// Small, non-personal values only: ids, counts, enums. Never emails, names,
// free text or amounts.
export type TelemetryProps = Readonly<
  Record<string, string | number | boolean | null>
>;

// Where an error happened: the method, the route pattern (no ids), the kind
// of route, the status and, when known, who.
export type ServerErrorContext = {
  method?: string;
  route?: string;
  routeType?: string;
  status?: number;
  userId?: string | null;
};

// Auth events (SPEC §6.2 `auth`, §11.5), accepted by the ingest only from
// the portal token: the portal is the only auth server.
export type AuthEventType =
  | "login_success"
  | "login_failed"
  | "magic_link_requested"
  | "logout"
  | "no_access";

export type AuthEvent = {
  type: AuthEventType;
  userId?: string | null;
  // Sent only when there is no user id (a failed login, a magic link for an
  // unknown address), lower-cased. Dropped whenever userId is set.
  email?: string | null;
  method?: string | null;
  app?: string | null;
  detail?: TelemetryProps;
};

export type TelemetryReporter = {
  reportServerError(error: unknown, context?: ServerErrorContext): void;
  trackServerEvent(
    name: string,
    userId: string | null,
    props?: TelemetryProps,
  ): void;
  reportAuthEvent(event: AuthEvent): void;
  // Sends what is pending now. Never rejects.
  flush(): Promise<void>;
};

const BATCH_WINDOW_MS = 1000;
const SEND_TIMEOUT_MS = 1500;
// If the ingest is down the queue stops growing: the excess is dropped.
const MAX_QUEUED = 200;
const MAX_MESSAGE_LENGTH = 500;

type ServerEvent = {
  name: string;
  ts: number;
  userId: string | null;
  props: TelemetryProps;
};

type ServerAuthEvent = {
  ts: number;
  type: AuthEventType;
  userId: string | null;
  email: string | null;
  method: string | null;
  app: string | null;
  detail: TelemetryProps;
};

type ServerError = {
  ts: number;
  source: "server";
  type: string;
  message: string;
  stack: string | null;
  userId: string | null;
  context: Omit<ServerErrorContext, "userId">;
};

// An error message without data: a failed query (postgres-js, drizzle) carries
// its parameters after `params:`, and other errors quote values, an email or
// a JSON object. Cut at `params:` and mask emails, quoted text, objects and
// numbers; the shape that groups the error stays.
export function scrubErrorMessage(message: string): string {
  return (message.split(/\bparams:/)[0] ?? "")
    .replace(/[^\s@"'<>()]+@[^\s@"'<>()]+/g, "…@…")
    .replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '"…"')
    .replace(/\{[^{}]*\}/g, "{…}")
    .replace(/(^|[^\w$])-?\d[\d.,]*/g, "$1#")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_MESSAGE_LENGTH);
}

// The stack with the scrubbed message in place of the original (its first
// line repeats it) and the frames as they are.
function scrubStack(error: Error, type: string, message: string): string | null {
  if (!error.stack) {
    return null;
  }

  const frames = error.stack
    .split("\n")
    .filter((line) => /^\s+at /.test(line));
  return [`${type}: ${message}`, ...frames].join("\n");
}

export const inertTelemetryReporter: TelemetryReporter = {
  reportServerError: () => {},
  trackServerEvent: () => {},
  reportAuthEvent: () => {},
  flush: async () => {},
};

export function createTelemetryReporter(options: {
  url: string;
  token: string;
  fetch?: typeof fetch;
  now?: () => number;
}): TelemetryReporter {
  const { url, token } = options;

  if (!token || !url) {
    return inertTelemetryReporter;
  }

  const send = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  let events: ServerEvent[] = [];
  let errors: ServerError[] = [];
  let auth: ServerAuthEvent[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;

  async function flush(): Promise<void> {
    if (timer) {
      clearTimeout(timer);
    }
    timer = null;

    if (!events.length && !errors.length && !auth.length) {
      return;
    }

    const batch = auth.length
      ? { v: 1, events, errors, auth }
      : { v: 1, events, errors };
    events = [];
    errors = [];
    auth = [];
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), SEND_TIMEOUT_MS);

    try {
      await send(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(batch),
        signal: abort.signal,
      });
    } catch {
      // Telemetry never breaks the app: a lost batch is lost.
    } finally {
      clearTimeout(timeout);
    }
  }

  function enqueue(add: () => void) {
    try {
      if (events.length + errors.length + auth.length >= MAX_QUEUED) {
        return;
      }

      add();

      if (!timer) {
        timer = setTimeout(() => void flush().catch(() => {}), BATCH_WINDOW_MS);
        // Node only: a pending batch must not keep the process alive.
        (timer as { unref?: () => void }).unref?.();
      }
    } catch {
      // Nothing from telemetry reaches the caller.
    }
  }

  return {
    reportServerError(error, context = {}) {
      enqueue(() => {
        const { userId = null, ...rest } = context;
        const err = error instanceof Error ? error : new Error(String(error));
        const type = err.name || "Error";
        const message = scrubErrorMessage(err.message);
        errors.push({
          ts: now(),
          source: "server",
          type,
          message,
          stack: scrubStack(err, type, message),
          userId,
          context: rest,
        });
      });
    },
    trackServerEvent(name, userId, props = {}) {
      enqueue(() => events.push({ name, ts: now(), userId, props }));
    },
    reportAuthEvent(event) {
      enqueue(() => {
        const userId = event.userId || null;
        const email = userId ? null : event.email?.trim().toLowerCase() || null;
        auth.push({
          ts: now(),
          type: event.type,
          userId,
          email,
          method: event.method ?? null,
          app: event.app ?? null,
          detail: event.detail ?? {},
        });
      });
    },
    flush: () => flush().catch(() => {}),
  };
}

const reporter = createTelemetryReporter({
  url: appEnv.telemetryIngestUrl,
  token: appEnv.telemetryToken,
});

export function reportServerError(
  error: unknown,
  context?: ServerErrorContext,
): void {
  reporter.reportServerError(error, context);
}

export function trackServerEvent(
  name: string,
  userId: string | null,
  props?: TelemetryProps,
): void {
  reporter.trackServerEvent(name, userId, props);
}

export function reportAuthEvent(event: AuthEvent): void {
  reporter.reportAuthEvent(event);
}
