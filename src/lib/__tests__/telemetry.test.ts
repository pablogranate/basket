import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createTelemetryReporter,
  inertTelemetryReporter,
  reportAuthEvent,
  reportServerError,
  scrubErrorMessage,
  trackServerEvent,
} from "@/lib/telemetry";

// The basket-telemetry server reporter against a fake fetch: inert without a
// token, the SPEC §6.2 payload, one POST per 1 s window, failures swallowed.

const INGEST_URL = "http://127.0.0.1:3011/ingest/server";

type Call = { url: string; init: RequestInit };

function fakeFetch(
  respond: () => Promise<Response> = async () => new Response(null, { status: 204 }),
) {
  const calls: Call[] = [];
  const fn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return respond();
  });
  return { fetch: fn as unknown as typeof fetch, calls };
}

const bodyOf = (call: Call) => JSON.parse(String(call.init.body));

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createTelemetryReporter", () => {
  it("is inert without TELEMETRY_TOKEN", async () => {
    const { fetch, calls } = fakeFetch();
    const reporter = createTelemetryReporter({ url: INGEST_URL, token: "", fetch });

    expect(reporter).toBe(inertTelemetryReporter);
    reporter.trackServerEvent("match_created", "user-test-1", {});
    reporter.reportServerError(new Error("boom"));
    await vi.advanceTimersByTimeAsync(5000);
    await reporter.flush();
    expect(calls).toHaveLength(0);
  });

  it("is inert without an ingest URL", () => {
    expect(createTelemetryReporter({ url: "", token: "t" })).toBe(
      inertTelemetryReporter,
    );
  });

  it("batches what happens within 1 s into one POST with the §6.2 payload and the bearer token", async () => {
    const { fetch, calls } = fakeFetch();
    const reporter = createTelemetryReporter({
      url: INGEST_URL,
      token: "fake-token",
      fetch,
      now: () => 1_730_000_000_000,
    });

    reporter.trackServerEvent("match_created", "user-test-1", {
      match_id: "match-1",
      staff_count: 2,
    });
    reporter.reportServerError(new TypeError("it broke"), {
      method: "POST",
      route: "/match/[id]",
      routeType: "render",
      userId: "user-test-1",
    });
    await vi.advanceTimersByTimeAsync(999);
    expect(calls).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);

    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call.url).toBe(INGEST_URL);
    expect(call.init.method).toBe("POST");
    expect(call.init.headers).toMatchObject({
      authorization: "Bearer fake-token",
      "content-type": "application/json",
    });
    expect(bodyOf(call)).toEqual({
      v: 1,
      events: [
        {
          name: "match_created",
          ts: 1_730_000_000_000,
          userId: "user-test-1",
          props: { match_id: "match-1", staff_count: 2 },
        },
      ],
      errors: [
        {
          ts: 1_730_000_000_000,
          source: "server",
          type: "TypeError",
          message: "it broke",
          stack: expect.stringMatching(/^TypeError: it broke\n\s+at /),
          userId: "user-test-1",
          context: { method: "POST", route: "/match/[id]", routeType: "render" },
        },
      ],
    });
  });

  it("starts a new batch after a flush, and sends nothing when nothing is pending", async () => {
    const { fetch, calls } = fakeFetch();
    const reporter = createTelemetryReporter({
      url: "http://ingest.test/ingest/server",
      token: "t",
      fetch,
    });

    reporter.trackServerEvent("grid_synced", null);
    await vi.advanceTimersByTimeAsync(1000);
    reporter.reportServerError("not an Error");
    await reporter.flush();
    await reporter.flush();

    expect(calls).toHaveLength(2);
    expect(calls[0].url).toBe("http://ingest.test/ingest/server");
    expect(bodyOf(calls[0]).events).toEqual([
      { name: "grid_synced", ts: expect.any(Number), userId: null, props: {} },
    ]);
    expect(bodyOf(calls[1]).errors[0]).toMatchObject({
      type: "Error",
      message: "not an Error",
      userId: null,
      context: {},
    });
  });

  it("swallows a failing ingest and aborts a hanging one after 1.5 s", async () => {
    const failing = fakeFetch(async () => Promise.reject(new Error("ECONNREFUSED")));
    const reporter = createTelemetryReporter({
      url: INGEST_URL,
      token: "t",
      fetch: failing.fetch,
    });
    reporter.trackServerEvent("grid_synced", null, { created: 1, updated: 0 });
    await expect(reporter.flush()).resolves.toBeUndefined();

    let signal: AbortSignal | undefined;
    const hanging = vi.fn((_url: string, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return new Promise<Response>((_resolve, reject) =>
        signal?.addEventListener("abort", () => reject(new Error("aborted"))),
      );
    }) as unknown as typeof fetch;
    const slow = createTelemetryReporter({ url: INGEST_URL, token: "t", fetch: hanging });
    slow.trackServerEvent("grid_synced", null);
    const flushing = slow.flush();
    await vi.advanceTimersByTimeAsync(1500);
    await expect(flushing).resolves.toBeUndefined();
    expect(signal?.aborted).toBe(true);
  });

  it("never throws to the caller, even with props that cannot be serialized", async () => {
    const { fetch, calls } = fakeFetch();
    const reporter = createTelemetryReporter({ url: INGEST_URL, token: "t", fetch });
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    expect(() =>
      reporter.trackServerEvent("x", null, circular as never),
    ).not.toThrow();
    await expect(reporter.flush()).resolves.toBeUndefined();
    expect(calls).toHaveLength(0);

    // The broken batch is dropped; the next one goes out.
    reporter.trackServerEvent("grid_synced", null);
    await reporter.flush();
    expect(calls).toHaveLength(1);
  });

  it("never sends query params, quoted values, objects, emails or numbers of an error", async () => {
    const { fetch, calls } = fakeFetch();
    const reporter = createTelemetryReporter({ url: INGEST_URL, token: "t", fetch });
    // The shape of a failed drizzle query, with fake values.
    const fromDb = new Error(
      'Failed query: insert into "people" ("full_name", "phone") values ($1, $2)\nparams: Fake Person,5491100000000',
    );
    fromDb.name = "DrizzleQueryError";
    reporter.reportServerError(fromDb);
    reporter.reportServerError(
      new Error(
        `Unexpected payload: ${JSON.stringify({ email: "fake.person@example.test", note: "Fake note" })}`,
      ),
    );
    await reporter.flush();

    const sent = String(calls[0]!.init.body);
    for (const value of ["Fake Person", "5491100000000", "fake.person", "Fake note"]) {
      expect(sent).not.toContain(value);
    }
    const [db, payload] = bodyOf(calls[0]!).errors;
    expect(db).toMatchObject({
      type: "DrizzleQueryError",
      message: 'Failed query: insert into "…" ("…", "…") values ($1, $2)',
    });
    expect(db.stack.split("\n")[0]).toBe(
      'DrizzleQueryError: Failed query: insert into "…" ("…", "…") values ($1, $2)',
    );
    expect(payload.message).toBe("Unexpected payload: {…}");
  });

  it("drops what exceeds the queue limit instead of growing without bound", async () => {
    const { fetch, calls } = fakeFetch();
    const reporter = createTelemetryReporter({ url: INGEST_URL, token: "t", fetch });

    for (let i = 0; i < 500; i++) {
      reporter.trackServerEvent("staff_assigned", null, { i });
    }
    await reporter.flush();

    expect(bodyOf(calls[0]).events).toHaveLength(200);
  });
});

describe("reportAuthEvent", () => {
  it("sends auth events in the batch's auth array (SPEC §6.2)", async () => {
    const { fetch, calls } = fakeFetch();
    const reporter = createTelemetryReporter({
      url: INGEST_URL,
      token: "t",
      fetch,
      now: () => 1_730_000_000_000,
    });

    reporter.reportAuthEvent({ type: "login_success", userId: "user-test-1", method: "google" });
    reporter.reportAuthEvent({ type: "no_access", userId: "user-test-1", app: "facturacion" });
    await reporter.flush();

    expect(bodyOf(calls[0])).toEqual({
      v: 1,
      events: [],
      errors: [],
      auth: [
        {
          ts: 1_730_000_000_000,
          type: "login_success",
          userId: "user-test-1",
          email: null,
          method: "google",
          app: null,
          detail: {},
        },
        {
          ts: 1_730_000_000_000,
          type: "no_access",
          userId: "user-test-1",
          email: null,
          method: null,
          app: "facturacion",
          detail: {},
        },
      ],
    });
  });

  it("sends the email lower-cased only when there is no user id", async () => {
    const { fetch, calls } = fakeFetch();
    const reporter = createTelemetryReporter({ url: INGEST_URL, token: "t", fetch });

    reporter.reportAuthEvent({
      type: "login_failed",
      email: "  Fake.Person@Example.TEST ",
      method: "magic_link",
      detail: { error: "INVALID_TOKEN" },
    });
    reporter.reportAuthEvent({
      type: "magic_link_requested",
      userId: "user-test-1",
      email: "fake.person@example.test",
      method: "magic_link",
    });
    await reporter.flush();

    const [failed, requested] = bodyOf(calls[0]).auth;
    expect(failed).toMatchObject({
      userId: null,
      email: "fake.person@example.test",
      detail: { error: "INVALID_TOKEN" },
    });
    expect(requested).toMatchObject({ userId: "user-test-1", email: null });
  });

  it("is inert without a token and from the default reporter in tests", () => {
    expect(() =>
      inertTelemetryReporter.reportAuthEvent({ type: "logout", userId: "u" }),
    ).not.toThrow();
    expect(() => reportAuthEvent({ type: "logout", userId: "u" })).not.toThrow();
  });
});

describe("scrubErrorMessage", () => {
  it("keeps the shape of a message", () => {
    expect(
      scrubErrorMessage("Cannot read properties of undefined (reading 'id')"),
    ).toBe('Cannot read properties of undefined (reading "…")');
    expect(scrubErrorMessage("timeout after 1500 ms")).toBe("timeout after # ms");
    expect(scrubErrorMessage("no account for fake.person@example.test (portal)")).toBe(
      "no account for …@… (portal)",
    );
    expect(scrubErrorMessage("match_id 42 and -3.5")).toBe("match_id # and #");
  });

  it("caps the message length", () => {
    expect(scrubErrorMessage("a".repeat(2000))).toHaveLength(500);
  });
});

describe("the default reporter", () => {
  it("is inert in tests (no TELEMETRY_TOKEN) and never throws", () => {
    expect(() => reportServerError(new Error("boom"))).not.toThrow();
    expect(() => trackServerEvent("match_created", null)).not.toThrow();
  });
});
