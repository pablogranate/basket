import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAuthEventSender, reportAuthEvent } from "@/lib/telemetry";

// The Portal's auth events against a fake fetch: inert without a token, the
// SPEC §6.2 `auth` array, one POST per 1 s window, failures swallowed. The
// error and event reporter is the shared package's, tested there.

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

describe("reportAuthEvent", () => {
  it("sends auth events in the batch's auth array (SPEC §6.2)", async () => {
    const { fetch, calls } = fakeFetch();
    const reporter = createAuthEventSender({
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
    const reporter = createAuthEventSender({ url: INGEST_URL, token: "t", fetch });

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

  it("is inert without a token and from the default sender in tests", async () => {
    const { fetch, calls } = fakeFetch();
    const sender = createAuthEventSender({ url: INGEST_URL, token: "", fetch });

    sender.reportAuthEvent({ type: "logout", userId: "u" });
    await vi.advanceTimersByTimeAsync(5000);
    await sender.flush();

    expect(calls).toHaveLength(0);
    expect(() => reportAuthEvent({ type: "logout", userId: "u" })).not.toThrow();
  });

  it("batches what happens within 1 s into one POST with the bearer token", async () => {
    const { fetch, calls } = fakeFetch();
    const sender = createAuthEventSender({ url: INGEST_URL, token: "t", fetch });

    sender.reportAuthEvent({ type: "logout", userId: "u-1" });
    sender.reportAuthEvent({ type: "logout", userId: "u-2" });
    await vi.advanceTimersByTimeAsync(1000);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(INGEST_URL);
    expect(new Headers(calls[0].init.headers).get("authorization")).toBe("Bearer t");
    expect(bodyOf(calls[0]).auth).toHaveLength(2);
  });

  it("swallows a failing ingest", async () => {
    const { fetch } = fakeFetch(async () => {
      throw new Error("ECONNREFUSED");
    });
    const sender = createAuthEventSender({ url: INGEST_URL, token: "t", fetch });

    sender.reportAuthEvent({ type: "logout", userId: "u" });

    await expect(sender.flush()).resolves.toBeUndefined();
  });
});
