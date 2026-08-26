import { describe, expect, it } from "vitest";

import {
  canSubmitAccessRequest,
  resolveDecision,
} from "@/lib/access-requests/state";

describe("canSubmitAccessRequest", () => {
  it("allows a first request", () => {
    expect(canSubmitAccessRequest(null).ok).toBe(true);
  });

  it("blocks a second request while one is pending", () => {
    const result = canSubmitAccessRequest({ status: "pendiente" });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe("pendiente");
  });

  it("blocks re-submitting after a rejection", () => {
    const result = canSubmitAccessRequest({ status: "rechazada" });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe("rechazada");
  });

  it("blocks re-submitting after approval", () => {
    expect(canSubmitAccessRequest({ status: "aprobada" }).ok).toBe(false);
  });
});

describe("resolveDecision", () => {
  it("moves a pending request to aprobada", () => {
    const result = resolveDecision({ status: "pendiente" }, "aprobar");

    expect(result.ok).toBe(true);
    expect(result.ok === true && result.status).toBe("aprobada");
  });

  it("moves a pending request to rechazada", () => {
    const result = resolveDecision({ status: "pendiente" }, "rechazar");

    expect(result.ok === true && result.status).toBe("rechazada");
  });

  it("refuses to re-decide an already resolved request (first decision wins)", () => {
    expect(resolveDecision({ status: "aprobada" }, "rechazar").ok).toBe(false);
    expect(resolveDecision({ status: "rechazada" }, "aprobar").ok).toBe(false);
  });
});
