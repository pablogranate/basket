import type { AccessRequestStatus } from "@/lib/access-requests/constants";

export type AccessRequestDecision = "aprobar" | "rechazar";

// One PENDING request per email. A resolved one never blocks: an approved email
// standing here again means its access was revoked, and self-signup is the only
// door back in — so a resolved request must not become a lockout.
export function canSubmitAccessRequest(
  existing: { status: AccessRequestStatus } | null,
):
  | { ok: true }
  | { ok: false; reason: AccessRequestStatus } {
  if (existing?.status === "pendiente") {
    return { ok: false, reason: "pendiente" };
  }

  return { ok: true };
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
