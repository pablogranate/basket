import type { AccessRequestStatus } from "@/lib/access-requests/constants";

export type AccessRequestDecision = "aprobar" | "rechazar";

// One request per email, ever. A rejection is terminal: only an admin reopening
// it (out of scope for now) can free the address.
export function canSubmitAccessRequest(
  existing: { status: AccessRequestStatus } | null,
):
  | { ok: true }
  | { ok: false; reason: AccessRequestStatus } {
  if (!existing) {
    return { ok: true };
  }

  return { ok: false, reason: existing.status };
}

// First decision wins: a request that already carries a decision cannot be
// re-decided by the next approver who happens to have the modal open.
export function resolveDecision(
  request: { status: AccessRequestStatus },
  decision: AccessRequestDecision,
):
  | { ok: true; status: AccessRequestStatus }
  | { ok: false; reason: "ya-resuelta" } {
  if (request.status !== "pendiente") {
    return { ok: false, reason: "ya-resuelta" };
  }

  return { ok: true, status: decision === "aprobar" ? "aprobada" : "rechazada" };
}
