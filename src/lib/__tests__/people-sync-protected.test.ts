import { describe, expect, it } from "vitest";

import { isProtectedFromSyncDelete, isSyncableEmail } from "@/lib/people/sync";

describe("isProtectedFromSyncDelete", () => {
  it("protects internal staff from a sheet-driven removal", () => {
    expect(isProtectedFromSyncDelete("wences.capolo@basquetpass.tv")).toBe(true);
    expect(isProtectedFromSyncDelete("  Wences@BasquetPass.TV  ")).toBe(true);
  });

  it("leaves everyone else removable by the sync", () => {
    expect(isProtectedFromSyncDelete("alguien@gmail.com")).toBe(false);
    expect(isProtectedFromSyncDelete("basquetpass.tv@gmail.com")).toBe(false);
    expect(isProtectedFromSyncDelete(null)).toBe(false);
    expect(isProtectedFromSyncDelete("")).toBe(false);
  });
});

describe("isSyncableEmail", () => {
  it("accepts any non-empty correo", () => {
    expect(isSyncableEmail("alguien@gmail.com")).toBe(true);
    expect(isSyncableEmail(" x@y.tv ")).toBe(true);
  });

  it("rejects the phone-only contacts the sheet never managed", () => {
    expect(isSyncableEmail(null)).toBe(false);
    expect(isSyncableEmail(undefined)).toBe(false);
    expect(isSyncableEmail("")).toBe(false);
    expect(isSyncableEmail("   ")).toBe(false);
  });
});
