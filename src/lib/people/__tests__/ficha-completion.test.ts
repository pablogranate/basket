import { describe, expect, it } from "vitest";

import { shouldAskFichaCompletion } from "@/lib/people/ficha-completion";

const EXTERNO = {
  hasAccess: true,
  role: "collaborator" as const,
  superAdmin: false,
  hasFicha: false,
  awaitingLinkReview: false,
};

// basket#202: who the portal asks for the missing ficha data.
describe("shouldAskFichaCompletion", () => {
  it("asks a portal user whose Cuenta has no ficha", () => {
    expect(shouldAskFichaCompletion(EXTERNO)).toBe(true);
    expect(shouldAskFichaCompletion({ ...EXTERNO, role: "editor" })).toBe(true);
  });

  it("does not ask once the ficha exists", () => {
    expect(shouldAskFichaCompletion({ ...EXTERNO, hasFicha: true })).toBe(false);
  });

  it("never asks a portal Admin or a super admin", () => {
    expect(shouldAskFichaCompletion({ ...EXTERNO, role: "admin" })).toBe(false);
    expect(
      shouldAskFichaCompletion({ ...EXTERNO, role: "admin", superAdmin: true }),
    ).toBe(false);
    expect(shouldAskFichaCompletion({ ...EXTERNO, superAdmin: true })).toBe(false);
  });

  it("leaves a name-only match to the admins' link review", () => {
    expect(shouldAskFichaCompletion({ ...EXTERNO, awaitingLinkReview: true })).toBe(false);
  });

  it("never asks someone without the portal", () => {
    expect(shouldAskFichaCompletion({ ...EXTERNO, hasAccess: false })).toBe(false);
  });
});
