import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/(auth)/logout/route";

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
}));

vi.mock("@/lib/auth/server", () => ({
  auth: {
    api: {
      signOut: vi.fn(async () => {
        const response = new Response(null);
        response.headers.append(
          "set-cookie",
          "__Secure-better-auth.session_token=; Max-Age=0; Domain=.basket-app.com; Path=/",
        );
        return response;
      }),
    },
  },
}));

function callLogout(url: string, host: string) {
  return GET(new NextRequest(url, { headers: { host } }));
}

// basket#203: next start sits behind nginx, so request.url is the upstream
// address; the redirect must follow the public Host header.
describe("GET /logout", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("lands on the public portal login behind the proxy", async () => {
    const response = await callLogout(
      "http://localhost:3000/logout",
      "portal.basket-app.com",
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://portal.basket-app.com/login",
    );
  });

  it("forwards the sign-out cookies", async () => {
    const response = await callLogout(
      "http://localhost:3000/logout",
      "portal.basket-app.com",
    );

    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("keeps the local port in development", async () => {
    const response = await callLogout(
      "http://portal.basket-app.localhost:3000/logout",
      "portal.basket-app.localhost:3000",
    );

    expect(response.headers.get("location")).toBe(
      "http://portal.basket-app.localhost:3000/login",
    );
  });

  it("falls back to the request origin for an unknown host", async () => {
    const response = await callLogout(
      "http://preview.example.com/logout",
      "preview.example.com",
    );

    expect(response.headers.get("location")).toBe("http://preview.example.com/login");
  });
});
