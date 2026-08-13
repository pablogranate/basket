import { describe, expect, it } from "vitest";

import { isProtectedFromSyncDelete } from "@/lib/people/sync";

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
