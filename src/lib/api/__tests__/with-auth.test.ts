import { NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { withAuth } from "@/lib/api/with-auth";
import { consumeGuestRateLimit } from "@/lib/api/rate-limit";
import { getUserContext } from "@/lib/auth";
import type { UserContext } from "@/lib/auth";
import { captureLogLines } from "@/test/fixtures/log-lines";
import { noParams } from "@/test/fixtures/route-context";
import { makeGuestContext, makeUserContext } from "@/test/fixtures/user-context";

function makeHandler() {
  return vi.fn(
    async (_request: Request, _context: UserContext) =>
      NextResponse.json({ ok: true }) as Response,
  );
}

vi.mock("@/lib/auth", () => ({
  getUserContext: vi.fn(),
}));

const mockedGetUserContext = vi.mocked(getUserContext);

function buildRequest() {
  return new Request("https://portal.basket-app.test/api/example");
}

describe("withAuth", () => {
  let log: ReturnType<typeof captureLogLines>;

  beforeEach(() => {
    log = captureLogLines();
  });

  afterEach(() => {
    log.restore();
    vi.clearAllMocks();
  });

  it("returns 401 when there is no session and guests are not allowed", async () => {
    mockedGetUserContext.mockResolvedValue(makeGuestContext());
    const handler = vi.fn();

    const wrapped = withAuth({ route: "/api/example" }, handler);
    const response = await wrapped(buildRequest(), noParams);

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBeTruthy();
    expect(handler).not.toHaveBeenCalled();
  });

  it("calls the handler with the guest context when allowGuest is set", async () => {
    const guest = makeGuestContext();
    mockedGetUserContext.mockResolvedValue(guest);
    const handler = makeHandler();

    const wrapped = withAuth({ route: "/api/example", allowGuest: true }, handler);
    const response = await wrapped(buildRequest(), noParams);

    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
    const passedContext = handler.mock.calls[0][1];
    expect(passedContext.userId).toBeNull();
  });

  it("returns 403 when the resolved context lacks the capability", async () => {
    mockedGetUserContext.mockResolvedValue(
      makeUserContext({ role: "collaborator", canEdit: true }),
    );
    const handler = vi.fn();

    const wrapped = withAuth({ route: "/api/example", capability: "admin" }, handler);
    const response = await wrapped(buildRequest(), noParams);

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toBeTruthy();
    expect(handler).not.toHaveBeenCalled();
  });

  it("calls the handler and passes the resolved context through on the success path", async () => {
    const context = makeUserContext({ userId: "user-42", role: "editor" });
    mockedGetUserContext.mockResolvedValue(context);
    const handler = makeHandler();

    const wrapped = withAuth({ route: "/api/example", capability: "dashboard.full" }, handler);
    const response = await wrapped(buildRequest(), noParams);

    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
    const passedContext = handler.mock.calls[0][1];
    expect(passedContext.userId).toBe("user-42");
    expect(passedContext.role).toBe("editor");
  });

  it.each([
    ["no session", makeGuestContext(), "no_session", 401],
    ["the capability missing", makeUserContext({ role: "collaborator" }), "no_access", 403],
  ] as const)(
    "writes one info line when it rejects a request with %s",
    async (_name, context, reason, status) => {
      mockedGetUserContext.mockResolvedValue(context);

      await withAuth({ route: "/api/example", capability: "admin" }, vi.fn())(
        buildRequest(),
        noParams,
      );

      expect(log.lines).toEqual([
        expect.objectContaining({
          level: "info",
          kind: "request",
          method: "GET",
          route: "/api/example",
          status,
          outcome: "rejected",
          reason,
        }),
      ]);
    },
  );

  it("writes one ok line for a request it lets through", async () => {
    mockedGetUserContext.mockResolvedValue(makeUserContext());

    const response = await withAuth({ route: "/api/example" }, makeHandler())(
      buildRequest(),
      noParams,
    );

    expect(log.lines).toEqual([
      expect.objectContaining({ level: "info", status: 200, outcome: "ok" }),
    ]);
    expect(response.headers.get("X-Request-Id")).toBe(log.lines[0].request_id);
  });
});

describe("consumeGuestRateLimit", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("allows the first N calls then blocks the (N+1)th within the window", async () => {
    const key = `guest-${Math.random().toString(36).slice(2)}`;
    const limit = 5;

    for (let i = 0; i < limit; i += 1) {
      const result = await consumeGuestRateLimit(key);
      expect(result.allowed).toBe(true);
    }

    const blocked = await consumeGuestRateLimit(key);
    expect(blocked.allowed).toBe(false);
  });
});
