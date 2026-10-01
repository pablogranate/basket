import {
  parsed,
  parseFailure,
  type ParseResult,
} from "@/lib/actions/define-action";
import { requestAsksFuncion } from "@/lib/acceso/catalog";
import {
  isAccessRequestFuncion,
  type AccessRequestFuncion,
} from "@/lib/access-requests/constants";
import { composeAccessRequestCiudad } from "@/lib/access-requests/locations";
import { isE164Phone } from "@/lib/access-requests/phone";
import type { AppRole } from "@/lib/database.types";
import { normalizeAccessTier } from "@/lib/roles";
import { maybeNull } from "@/lib/utils";

export type SubmitAccessRequestInput = {
  // As submitted; the action checks it against the auth_app catalog.
  app: string | null;
  fullName: string;
  phone: string;
  // Null when the form didn't ask; whether the app needs one is the action's
  // call, once the app is resolved (checkAccessRequestFuncion).
  funcion: AccessRequestFuncion | null;
  ciudad: string;
  mensaje: string | null;
};

// Función is required for the portal and never stored for any other app.
export function checkAccessRequestFuncion({
  app,
  funcion,
}: {
  app: string;
  funcion: AccessRequestFuncion | null;
}): { ok: true; funcion: AccessRequestFuncion | null } | { ok: false; error: string } {
  if (!requestAsksFuncion(app)) {
    return { ok: true, funcion: null };
  }

  return funcion
    ? { ok: true, funcion }
    : { ok: false, error: "Elegí una función de la lista." };
}

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

  if (funcion && !isAccessRequestFuncion(funcion)) {
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
    app: maybeNull(String(formData.get("app") ?? "")),
    fullName,
    phone,
    funcion: funcion && isAccessRequestFuncion(funcion) ? funcion : null,
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
  requestedTier: AppRole;
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
