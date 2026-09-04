import {
  parsed,
  parseFailure,
  type ParseResult,
} from "@/lib/actions/define-action";
import { isAccessRequestFuncion } from "@/lib/access-requests/constants";
import { composeAccessRequestCiudad } from "@/lib/access-requests/locations";
import { isE164Phone } from "@/lib/access-requests/phone";
import { normalizeAccessTier, type AccessTierRole } from "@/lib/access-tier";
import { maybeNull } from "@/lib/utils";

export type SubmitAccessRequestInput = {
  fullName: string;
  phone: string;
  funcion: string;
  ciudad: string;
  mensaje: string | null;
};

export function parseSubmitAccessRequest(
  formData: FormData,
): ParseResult<SubmitAccessRequestInput> {
  const fullName = String(formData.get("fullName") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const funcion = String(formData.get("funcion") ?? "").trim();

  if (fullName.length < 3) {
    return parseFailure("Escribí tu nombre completo.");
  }

  if (!isE164Phone(phone)) {
    return parseFailure("Revisá el teléfono: falta el país o tiene caracteres.");
  }

  if (!isAccessRequestFuncion(funcion)) {
    return parseFailure("Elegí una función de la lista.");
  }

  const ciudad = composeAccessRequestCiudad({
    pais: String(formData.get("pais") ?? "").trim(),
    ciudad: String(formData.get("ciudad") ?? "").trim(),
    otraCiudad: String(formData.get("otraCiudad") ?? "").trim(),
  });

  if (!ciudad) {
    return parseFailure("Elegí tu país y tu ciudad de la lista.");
  }

  return parsed({
    fullName,
    phone,
    funcion,
    ciudad,
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
