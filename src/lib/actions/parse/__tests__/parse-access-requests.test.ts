import { describe, expect, it } from "vitest";

import { parseApproveAccessRequest } from "@/lib/actions/parse/access-requests";

function form(entries: Record<string, string> = {}) {
  const formData = new FormData();
  const values: Record<string, string> = {
    requestId: " request-1 ",
    fullName: "Ana Pérez",
    phone: "+5491122334455",
    ...entries,
  };
  for (const [key, value] of Object.entries(values)) {
    formData.set(key, value);
  }
  return formData;
}

describe("parseApproveAccessRequest", () => {
  it("parses the approver's submission", () => {
    const result = parseApproveAccessRequest(
      form({
        roleId: "role-relator",
        personId: "person-1",
        mergePersonId: "person-dup",
        accessRole: "editor",
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.input).toEqual({
      requestId: "request-1",
      fullName: "Ana Pérez",
      phone: "+5491122334455",
      roleId: "role-relator",
      personId: "person-1",
      mergePersonId: "person-dup",
      requestedTier: "editor",
    });
  });

  it("normalizes blanks to null and unknown tiers to collaborator", () => {
    const result = parseApproveAccessRequest(
      form({ roleId: "  ", accessRole: "root" }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.input.roleId).toBeNull();
    expect(result.input.personId).toBeNull();
    expect(result.input.mergePersonId).toBeNull();
    expect(result.input.requestedTier).toBe("collaborator");
  });

  it("rejects a too-short name before the phone", () => {
    const result = parseApproveAccessRequest(
      form({ fullName: "Al", phone: "1234" }),
    );

    expect(result).toEqual({
      ok: false,
      error: "El nombre completo no puede quedar vacío.",
    });
  });

  it("rejects a malformed phone", () => {
    const result = parseApproveAccessRequest(form({ phone: "1122334455" }));

    expect(result).toEqual({
      ok: false,
      error: "Revisá el teléfono antes de aprobar.",
    });
  });
});
