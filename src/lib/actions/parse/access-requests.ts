import {
  parsed,
  parseFailure,
  type ParseResult,
} from "@/lib/actions/define-action";
import { isE164Phone } from "@/lib/access-requests/phone";
import { normalizeAccessTier, type AccessTierRole } from "@/lib/access-tier";
import { maybeNull } from "@/lib/utils";

export type SubmitAccessRequestInput = {
  fullName: string;
  phone: string;
  funcion: string;
  mensaje: string | null;
};

// The submit validations (name length, phone, funcion) stay in `run`: they must
// come after the signed-in check, which needs the auth context.
export function parseSubmitAccessRequest(
  formData: FormData,
): ParseResult<SubmitAccessRequestInput> {
  return parsed({
    fullName: String(formData.get("fullName") ?? "").trim(),
    phone: String(formData.get("phone") ?? "").trim(),
    funcion: String(formData.get("funcion") ?? "").trim(),
    mensaje: maybeNull(String(formData.get("mensaje") ?? "")),
  });
}

export type RejectAccessRequestInput = { requestId: string };

export function parseRejectAccessRequest(
  formData: FormData,
): ParseResult<RejectAccessRequestInput> {
  return parsed({ requestId: String(formData.get("requestId") ?? "").trim() });
}

export type ApproveAccessRequestInput = {
  requestId: string;
  fullName: string;
  phone: string;
  roleId: string | null;
  personId: string | null;
  mergePersonId: string | null;
  requestedTier: AccessTierRole;
};

export function parseApproveAccessRequest(
  formData: FormData,
): ParseResult<ApproveAccessRequestInput> {
  // What the approver submitted is what persists (D-10).
  const fullName = String(formData.get("fullName") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();

  if (fullName.length < 3) {
    return parseFailure("El nombre completo no puede quedar vacío.");
  }

  if (!isE164Phone(phone)) {
    return parseFailure("Revisá el teléfono antes de aprobar.");
  }

  return parsed({
    requestId: String(formData.get("requestId") ?? "").trim(),
    fullName,
    phone,
    roleId: maybeNull(String(formData.get("roleId") ?? "")),
    personId: maybeNull(String(formData.get("personId") ?? "")),
    mergePersonId: maybeNull(String(formData.get("mergePersonId") ?? "")),
    requestedTier: normalizeAccessTier(
      String(formData.get("accessRole") ?? "collaborator"),
    ),
  });
}

export type LinkProfileToPersonInput = {
  profileId: string;
  personId: string;
};

export function parseLinkProfileToPerson(
  formData: FormData,
): ParseResult<LinkProfileToPersonInput> {
  const profileId = String(formData.get("profileId") ?? "").trim();
  const personId = String(formData.get("personId") ?? "").trim();

  if (!profileId || !personId) {
    return parseFailure("Faltan datos para vincular.");
  }

  return parsed({ profileId, personId });
}
