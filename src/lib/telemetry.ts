import { createReporter } from "basket-tv-telemetry";

import { appEnv } from "@/lib/env";

// The server reporter to basket-telemetry: errors and business events, from
// the shared package. Without TELEMETRY_TOKEN (dev, tests, CI) it is a no-op.
// Not "server-only": src/instrumentation.ts imports it, and on the client the
// token is unset so it is inert anyway.
export const telemetry = createReporter({
  app: "portal",
  ingestUrl: appEnv.telemetryIngestUrl,
  token: appEnv.telemetryToken,
});

// Auth events are the Portal's alone (the ingest accepts the batch's `auth`
// array from the portal token only), so the package has no sender for them.
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
  // Ids, counts and enums only.
  detail?: Readonly<Record<string, string | number | boolean | null>>;
};

export type AuthEventSender = {
  reportAuthEvent(event: AuthEvent): void;
  flush(): Promise<void>;
};

const BATCH_WINDOW_MS = 1000;
const SEND_TIMEOUT_MS = 1500;
// The ingest refuses a batch with more auth events than this.
const MAX_QUEUED = 100;

export function createAuthEventSender(options: {
  url: string;
  token: string;
  fetch?: typeof fetch;
  now?: () => number;
}): AuthEventSender {
  const { url, token } = options;

  if (!token || !url) {
    return { reportAuthEvent: () => {}, flush: async () => {} };
  }

  const send = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  let queue: object[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;

  async function flush(): Promise<void> {
    if (timer) {
      clearTimeout(timer);
    }
    timer = null;

    if (!queue.length) {
      return;
    }

    const body = JSON.stringify({ v: 1, events: [], errors: [], auth: queue });
    queue = [];
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), SEND_TIMEOUT_MS);

    try {
      await send(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body,
        signal: abort.signal,
      });
    } catch {
      // A lost batch is lost: telemetry never breaks the app.
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    reportAuthEvent(event) {
      try {
        if (queue.length >= MAX_QUEUED) {
          return;
        }

        const userId = event.userId || null;
        queue.push({
          ts: now(),
          type: event.type,
          userId,
          email: userId ? null : event.email?.trim().toLowerCase() || null,
          method: event.method ?? null,
          app: event.app ?? null,
          detail: event.detail ?? {},
        });

        if (!timer) {
          timer = setTimeout(() => void flush(), BATCH_WINDOW_MS);
          // Node only: a pending batch must not keep the process alive.
          (timer as { unref?: () => void }).unref?.();
        }
      } catch {
        // Nothing from telemetry reaches the caller.
      }
    },
    flush: () => flush().catch(() => {}),
  };
}

const authEvents = createAuthEventSender({
  url: appEnv.telemetryIngestUrl,
  token: appEnv.telemetryToken,
});

export function reportAuthEvent(event: AuthEvent): void {
  authEvents.reportAuthEvent(event);
}
