import { describe, expect, it } from "vitest";

import { isUniqueViolation } from "@/lib/db/errors";

describe("isUniqueViolation", () => {
  it("reads the SQLSTATE off a bare driver error", () => {
    expect(isUniqueViolation({ code: "23505" })).toBe(true);
    expect(isUniqueViolation({ code: "23503" })).toBe(false);
  });

  it("finds the driver error behind drizzle's wrapper", () => {
    const wrapped = new Error("Failed query", { cause: { code: "23505" } });
    expect(isUniqueViolation(wrapped)).toBe(true);
  });

  it("is false for nullish and codeless errors", () => {
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation(undefined)).toBe(false);
    expect(isUniqueViolation(new Error("boom"))).toBe(false);
  });
});
