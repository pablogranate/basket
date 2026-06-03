import { NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { withAuth } from "@/lib/api/with-auth";
import { consumeGuestRateLimit } from "@/lib/api/rate-limit";
import { getUserContext } from "@/lib/auth";
import { makeGuestContext, makeUserContext } from "@/test/fixtures/user-context";

vi.mock("@/lib/auth", () => ({
  getUserContext: vi.fn(),
}));

const mockedGetUserContext = vi.mocked(getUserContext);

function buildRequest() {
  return new Request("https://portal.basket-app.test/api/example");
}

describe("withAuth", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when there is no session and guests are not allowed", async () => {
    mockedGetUserContext.mockResolvedValue(makeGuestContext());
    const handler = vi.fn();

    const wrapped = withAuth({}, handler);
    const response = await wrapped(buildRequest());

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBeTruthy();
    expect(handler).not.toHaveBeenCalled();
  });

  it("calls the handler with the guest context when allowGuest is set", async () => {
    const guest = makeGuestContext();
    mockedGetUserContext.mockResolvedValue(guest);
    const handler = vi.fn(async () => NextResponse.json({ ok: true }));

    const wrapped = withAuth({ allowGuest: true }, handler);
    const response = await wrapped(buildRequest());

    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
    const passedContext = handler.mock.calls[0][1];
    expect(passedContext.userId).toBeNull();
  });

  it("returns 403 when the resolved role is not in the allowed set", async () => {
    mockedGetUserContext.mockResolvedValue(
      makeUserContext({ role: "collaborator", canEdit: true }),
    );
    const handler = vi.fn();

    const wrapped = withAuth({ roles: ["admin"] }, handler);
    const response = await wrapped(buildRequest());

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toBeTruthy();
    expect(handler).not.toHaveBeenCalled();
  });

  it("calls the handler and passes the resolved context through on the success path", async () => {
    const context = makeUserContext({ userId: "user-42", role: "editor" });
    mockedGetUserContext.mockResolvedValue(context);
    const handler = vi.fn(async () => NextResponse.json({ ok: true }));

    const wrapped = withAuth({ roles: ["admin", "editor"] }, handler);
    const response = await wrapped(buildRequest());

    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
    const passedContext = handler.mock.calls[0][1];
    expect(passedContext.userId).toBe("user-42");
    expect(passedContext.role).toBe("editor");
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
