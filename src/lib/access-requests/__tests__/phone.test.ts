import { describe, expect, it } from "vitest";

import { isE164Phone } from "@/lib/access-requests/phone";

describe("isE164Phone", () => {
  it("accepts an E.164 number as the phone field posts it", () => {
    expect(isE164Phone("+5491122334455")).toBe(true);
    expect(isE164Phone(" +5491122334455 ")).toBe(true);
  });

  it("rejects the national-formatted text the visible input shows", () => {
    expect(isE164Phone("11 2233 4455")).toBe(false);
    expect(isE164Phone("+54 9 11 2233 4455")).toBe(false);
  });

  it("rejects a missing country prefix and an empty value", () => {
    expect(isE164Phone("5491122334455")).toBe(false);
    expect(isE164Phone("")).toBe(false);
  });
});
