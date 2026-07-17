import { afterEach, describe, expect, it, vi } from "vitest";

// Hoisted so the (hoisted) vi.mock factories can reference them without TDZ.
const { PORTAL_SECRET, appSettingsRow } = vi.hoisted(() => {
  const secret = "AIzaSy-portal-secret-key-value-1234";
  return {
    PORTAL_SECRET: secret,
    appSettingsRow: { secret_value: secret, public_value: "gemini-2.5-flash" },
  };
});

const cookieStore = {
  get: vi.fn(() => undefined),
};

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => cookieStore),
}));

// loadPortalGeminiConfig now reads through Drizzle:
// db.select(cols).from(app_settings).where(eq(...)).limit(1) -> row[].
vi.mock("@/lib/db/client", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [appSettingsRow],
        }),
      }),
    }),
  },
}));

vi.mock("@/lib/env", () => ({
  appEnv: {
    portalGeminiApiKey: "",
    portalGeminiModel: "gemini-2.5-flash",
  },
}));

import { getGeminiRuntimeConfig, getSettingsSnapshot } from "@/lib/settings";

describe("settings secret exposure (D-08)", () => {
  afterEach(() => {
    cookieStore.get.mockReset();
    cookieStore.get.mockReturnValue(undefined);
  });

  it("never returns the raw secret_value on the user-facing snapshot for any role", async () => {
    const snapshot = await getSettingsSnapshot();
    const serialized = JSON.stringify(snapshot);

    expect(serialized).not.toContain(PORTAL_SECRET);
    expect(Object.values(snapshot)).not.toContain(PORTAL_SECRET);
    // user-facing surface exposes only presence booleans
    expect(snapshot.hasPortalGeminiKey).toBe(true);
    expect(snapshot).not.toHaveProperty("secret_value");
    expect(snapshot).not.toHaveProperty("apiKey");
  });

  it("still returns a working portal apiKey from the server-only runtime read for a non-admin/guest", async () => {
    // No getUserContext mock: the runtime read must not depend on role.
    const runtime = await getGeminiRuntimeConfig();

    expect(runtime.apiKey).toBe(PORTAL_SECRET);
    expect(runtime.apiKey.length).toBeGreaterThan(0);
    expect(runtime.source).toBe("portal");
    expect(runtime.hasPortalGeminiKey).toBe(true);
  });
});
