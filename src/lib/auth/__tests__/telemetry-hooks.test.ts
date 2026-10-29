import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { APIError } from "better-auth/api";
import { magicLink } from "better-auth/plugins";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  authTelemetryOptions,
  endpointFailure,
  loginMethodOf,
  reportLoginSuccess,
  reportLogout,
  reportSignInOutcome,
} from "@/lib/auth/telemetry-hooks";
import { reportAuthEvent } from "@/lib/telemetry";

vi.mock("@/lib/telemetry", () => ({ reportAuthEvent: vi.fn() }));

const mockedReport = vi.mocked(reportAuthEvent);
const FAKE_EMAIL = "fake.person@example.test";

afterEach(() => {
  vi.clearAllMocks();
});

function redirect(location: string) {
  return new APIError("FOUND", undefined, new Headers({ location }));
}

describe("loginMethodOf", () => {
  it.each([
    [{ path: "/magic-link/verify" }, "magic_link"],
    [{ path: "/sign-in/magic-link" }, "magic_link"],
    [{ path: "/callback/:id", params: { id: "google" } }, "google"],
    [{ path: "/sign-in/social", body: { provider: "google" } }, "google"],
    [{ path: "/admin/impersonate-user" }, "impersonation"],
    [{ path: "/update-user" }, "other"],
    [null, "other"],
  ])("maps %j to %s", (endpoint, method) => {
    expect(loginMethodOf(endpoint)).toBe(method);
  });
});

describe("endpointFailure", () => {
  it("reads the error code of a redirect that carries ?error=", () => {
    expect(endpointFailure(redirect("https://portal.test/login?error=INVALID_TOKEN"))).toBe(
      "INVALID_TOKEN",
    );
  });

  it("treats a plain redirect or a JSON result as a success", () => {
    expect(endpointFailure(redirect("https://portal.test/grid"))).toBeNull();
    expect(endpointFailure({ status: true })).toBeNull();
    expect(endpointFailure(undefined)).toBeNull();
  });

  it("reads the code or the status of an APIError", () => {
    expect(
      endpointFailure(new APIError("FORBIDDEN", { message: "solo staff", code: "FORBIDDEN_DOMAIN" })),
    ).toBe("FORBIDDEN_DOMAIN");
    expect(endpointFailure(new APIError("FORBIDDEN", { message: "solo staff" }))).toBe("403");
  });
});

describe("session hooks", () => {
  it("reports a new session as login_success with its method", () => {
    reportLoginSuccess(
      { userId: "user-test-1" },
      { path: "/callback/:id", params: { id: "google" } },
    );

    expect(mockedReport).toHaveBeenCalledWith({
      type: "login_success",
      userId: "user-test-1",
      method: "google",
    });
  });

  it("reports a logout only for a session deleted by /sign-out", () => {
    reportLogout({ userId: "user-test-1" }, { path: "/admin/revoke-user-sessions" });
    expect(mockedReport).not.toHaveBeenCalled();

    reportLogout({ userId: "user-test-1" }, { path: "/sign-out" });
    expect(mockedReport).toHaveBeenCalledWith({ type: "logout", userId: "user-test-1" });
  });

  it("never throws into Better Auth", () => {
    mockedReport.mockImplementation(() => {
      throw new Error("reporter broke");
    });

    expect(() => reportLoginSuccess({ userId: "u" }, null)).not.toThrow();
    expect(() => reportLogout({ userId: "u" }, { path: "/sign-out" })).not.toThrow();
    mockedReport.mockReset();
  });
});

describe("reportSignInOutcome", () => {
  const unknownEmail = async () => null;

  it("ignores endpoints that are not sign-ins", () => {
    reportSignInOutcome({
      endpoint: { path: "/get-session" },
      returned: new APIError("UNAUTHORIZED"),
      findUserIdByEmail: unknownEmail,
    });

    expect(mockedReport).not.toHaveBeenCalled();
  });

  it("reports a failed magic link verify without an email", () => {
    reportSignInOutcome({
      endpoint: { path: "/magic-link/verify" },
      returned: redirect("/login?error=INVALID_TOKEN"),
      findUserIdByEmail: unknownEmail,
    });

    expect(mockedReport).toHaveBeenCalledWith({
      type: "login_failed",
      email: null,
      method: "magic_link",
      detail: { error: "INVALID_TOKEN" },
    });
  });

  it("reports a failed Google callback with the provider as method", () => {
    reportSignInOutcome({
      endpoint: { path: "/callback/:id", params: { id: "google" } },
      returned: new APIError("FORBIDDEN", { message: "solo staff" }),
      findUserIdByEmail: unknownEmail,
    });

    expect(mockedReport).toHaveBeenCalledWith(
      expect.objectContaining({ type: "login_failed", method: "google", detail: { error: "403" } }),
    );
  });

  it("does not report a successful verify (the session hook does)", () => {
    reportSignInOutcome({
      endpoint: { path: "/magic-link/verify" },
      returned: redirect("/grid"),
      findUserIdByEmail: unknownEmail,
    });

    expect(mockedReport).not.toHaveBeenCalled();
  });

  it("reports a failed magic link request with the lower-cased email", () => {
    reportSignInOutcome({
      endpoint: { path: "/sign-in/magic-link", body: { email: " Fake.Person@Example.TEST " } },
      returned: new APIError("BAD_REQUEST", { message: "x", code: "INVALID_EMAIL" }),
      findUserIdByEmail: unknownEmail,
    });

    expect(mockedReport).toHaveBeenCalledWith({
      type: "login_failed",
      email: FAKE_EMAIL,
      method: "magic_link",
      detail: { error: "INVALID_EMAIL" },
    });
  });

  it("reports a magic link request with the user id when the email has an identity", async () => {
    const findUserIdByEmail = vi.fn(async () => "user-test-1");

    reportSignInOutcome({
      endpoint: { path: "/sign-in/magic-link", body: { email: FAKE_EMAIL } },
      returned: { status: true },
      findUserIdByEmail,
    });
    await vi.waitFor(() => expect(mockedReport).toHaveBeenCalled());

    expect(findUserIdByEmail).toHaveBeenCalledWith(FAKE_EMAIL);
    expect(mockedReport).toHaveBeenCalledWith({
      type: "magic_link_requested",
      userId: "user-test-1",
      email: null,
      method: "magic_link",
    });
  });

  it("reports a magic link request with the email when no identity has it, or the lookup fails", async () => {
    reportSignInOutcome({
      endpoint: { path: "/sign-in/magic-link", body: { email: FAKE_EMAIL } },
      returned: { status: true },
      findUserIdByEmail: async () => {
        throw new Error("auth db down");
      },
    });
    await vi.waitFor(() => expect(mockedReport).toHaveBeenCalled());

    expect(mockedReport).toHaveBeenCalledWith({
      type: "magic_link_requested",
      userId: null,
      email: FAKE_EMAIL,
      method: "magic_link",
    });
  });
});

// The hooks wired into a real Better Auth instance (the installed version, an
// in-memory database), to pin the hook API this relies on: the endpoint path
// in the database hook context, ctx.context.returned in the after hook, and
// the redirect a failed verify makes.
describe("authTelemetryOptions on a Better Auth instance", () => {
  function makeAuth() {
    const db: Record<string, unknown[]> = { user: [], session: [], account: [], verification: [] };
    const sent: Array<{ email: string; token: string }> = [];
    const auth = betterAuth({
      secret: "test-better-auth-secret-value-0000000000",
      baseURL: "http://localhost:3000",
      database: memoryAdapter(db),
      databaseHooks: authTelemetryOptions.databaseHooks,
      hooks: authTelemetryOptions.hooks,
      plugins: [
        magicLink({
          sendMagicLink: async ({ email, token }) => {
            sent.push({ email, token });
          },
        }),
      ],
    });
    return { auth, sent };
  }

  it("reports a magic link request, the login it leads to, and the logout", async () => {
    const { auth, sent } = makeAuth();

    await auth.api.signInMagicLink({
      body: { email: FAKE_EMAIL, callbackURL: "/grid" },
      headers: new Headers(),
    });
    await vi.waitFor(() =>
      expect(mockedReport).toHaveBeenCalledWith(
        expect.objectContaining({ type: "magic_link_requested", email: FAKE_EMAIL }),
      ),
    );

    const verified = await auth.api.magicLinkVerify({
      query: { token: sent[0]!.token },
      headers: new Headers(),
      returnHeaders: true,
    });
    const userId = (verified.response as { user: { id: string } }).user.id;
    expect(mockedReport).toHaveBeenCalledWith({
      type: "login_success",
      userId,
      method: "magic_link",
    });

    const cookie = verified.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ");
    await auth.api.signOut({ headers: new Headers({ cookie }) });
    await vi.waitFor(() =>
      expect(mockedReport).toHaveBeenCalledWith({ type: "logout", userId }),
    );
  });

  it("reports a verify with a bad token as login_failed", async () => {
    const { auth } = makeAuth();

    await auth.api
      .magicLinkVerify({
        query: { token: "not-a-token", callbackURL: "/grid" },
        headers: new Headers(),
      })
      .catch(() => undefined);

    expect(mockedReport).toHaveBeenCalledWith({
      type: "login_failed",
      email: null,
      method: "magic_link",
      detail: { error: "INVALID_TOKEN" },
    });
  });
});
