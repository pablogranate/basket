import { afterEach, describe, expect, it, vi } from "vitest";

import { revalidatePath } from "next/cache";
import { redirectWithNotice } from "@/app/actions/helpers";
import { requireAdmin } from "@/lib/auth-access";
import { saveGeminiSettingsAction } from "@/app/actions/settings";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    set: vi.fn(),
    delete: vi.fn(),
  })),
}));

vi.mock("@/lib/auth-access", () => ({
  requireAdmin: vi.fn(),
}));

// A save always ends in a redirect (the success notice). Model that redirect as
// a throw so the action returns control after revalidation, matching runtime.
vi.mock("@/app/actions/helpers", () => ({
  getRedirectTarget: () => "/settings",
  redirectWithNotice: vi.fn(() => {
    throw new Error("REDIRECT");
  }),
  rethrowNavigationError: (error: unknown) => {
    throw error;
  },
}));

const mockedRevalidatePath = vi.mocked(revalidatePath);
const mockedRequireAdmin = vi.mocked(requireAdmin);
const mockedRedirectWithNotice = vi.mocked(redirectWithNotice);

const PREVIOUSLY_REVALIDATED = [
  "/mi-jornada",
  "/grid",
  "/reports",
  "/incidents",
  "/people",
  "/teams",
];

describe("saveGeminiSettingsAction revalidation scope", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("revalidates only /settings, not the six unrelated routes", async () => {
    // Non-admin: exercises the cookie-only path (no DB), which still runs the
    // revalidation block we are scoping.
    mockedRequireAdmin.mockResolvedValue({ role: "editor" } as never);

    const formData = new FormData();
    formData.set("geminiApiKey", "test-key");
    formData.set("geminiModel", "gemini-2.5-flash");

    // The success redirect surfaces as a throw (see mock above).
    await expect(saveGeminiSettingsAction(formData)).rejects.toThrow("REDIRECT");

    const revalidatedPaths = mockedRevalidatePath.mock.calls.map(
      (call) => call[0],
    );

    expect(revalidatedPaths).toEqual(["/settings"]);
    for (const path of PREVIOUSLY_REVALIDATED) {
      expect(revalidatedPaths).not.toContain(path);
    }
    expect(mockedRedirectWithNotice).toHaveBeenCalledTimes(1);
    expect(mockedRedirectWithNotice).toHaveBeenCalledWith(
      expect.objectContaining({ intent: "success" }),
    );
  });
});
