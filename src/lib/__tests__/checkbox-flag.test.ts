import { describe, expect, it } from "vitest";

import { resolveCheckboxFlag } from "@/lib/utils";

// A checkbox posts nothing when unchecked, so the forms pair it with a hidden
// companion carrying "off". Both entries share the field name, and the hidden
// one is declared first in the markup — the exact shape that made
// `formData.get("active")` always read "off".
function modalFormData({ checked }: { checked: boolean }) {
  const formData = new FormData();
  formData.append("active", "off");
  if (checked) {
    formData.append("active", "on");
  }
  return formData;
}

describe("resolveCheckboxFlag", () => {
  it("reads the checkbox, not the hidden companion declared before it", () => {
    expect(resolveCheckboxFlag(modalFormData({ checked: true }), "active", true)).toBe(
      true,
    );
  });

  it("stays false when only the hidden companion is posted", () => {
    expect(
      resolveCheckboxFlag(modalFormData({ checked: false }), "active", true),
    ).toBe(false);
  });

  it("is order-independent when the companion is declared after the checkbox", () => {
    const formData = new FormData();
    formData.append("active", "on");
    formData.append("active", "off");

    expect(resolveCheckboxFlag(formData, "active", true)).toBe(true);
  });

  it("falls back when the form posts no entry for the field", () => {
    expect(resolveCheckboxFlag(new FormData(), "active", true)).toBe(true);
    expect(resolveCheckboxFlag(new FormData(), "active", false)).toBe(false);
  });

  it("treats a lone toggle field as its posted value", () => {
    const on = new FormData();
    on.set("active", "on");
    const off = new FormData();
    off.set("active", "off");

    expect(resolveCheckboxFlag(on, "active", false)).toBe(true);
    expect(resolveCheckboxFlag(off, "active", false)).toBe(false);
  });

  it("ignores unrelated field names", () => {
    const formData = new FormData();
    formData.set("other", "on");

    expect(resolveCheckboxFlag(formData, "active", false)).toBe(false);
  });
});
