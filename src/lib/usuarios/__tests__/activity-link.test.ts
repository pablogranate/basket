import { describe, expect, it } from "vitest";

import { buildUserActivityUrl } from "@/lib/usuarios/activity-link";

describe("buildUserActivityUrl", () => {
  it("links the apex users section to the identity's page on server.basket-app.com", () => {
    expect(buildUserActivityUrl("basket-app.com", "user-test-1")).toBe(
      "https://server.basket-app.com/users/user-test-1",
    );
  });

  it("escapes the id", () => {
    expect(buildUserActivityUrl("basket-app.com", "a/b c")).toBe(
      "https://server.basket-app.com/users/a%2Fb%20c",
    );
  });

  it("falls back to the production panel for an unknown host", () => {
    expect(buildUserActivityUrl("10.0.0.1:3000", "user-test-1")).toBe(
      "https://server.basket-app.com/users/user-test-1",
    );
  });
});
