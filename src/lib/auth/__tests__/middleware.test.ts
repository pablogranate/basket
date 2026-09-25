import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { updateSession } from "@/lib/auth/middleware";

function request(host: string, path: string, { session = true } = {}) {
  const headers = new Headers({ host });
  if (session) {
    headers.set("cookie", "better-auth.session_token=abc.def");
  }
  return new NextRequest(`http://${host}${path}`, { headers });
}

// /usuarios answers on the apex only (basket#187); the page and actions
// repeat the check with the super admin lookup.
describe("updateSession /usuarios", () => {
  it("404s the section off the apex, with or without a session", async () => {
    for (const session of [true, false]) {
      const response = await updateSession(
        request("portal.basket-app.com", "/usuarios", { session }),
      );
      expect(response.status).toBe(404);
    }
  });

  it("lets a signed-in apex request through to the page guard", async () => {
    const response = await updateSession(request("basket-app.com", "/usuarios"));
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("sends a session-less apex request to the portal login", async () => {
    const response = await updateSession(
      request("basket-app.com", "/usuarios", { session: false }),
    );
    expect(response.headers.get("location")).toContain("portal.basket-app.com/login");
  });
});
