import {
  parsed,
  parseFailure,
  type ParseResult,
} from "@/lib/actions/define-action";
import { NO_ROLE_OPTION } from "@/lib/acceso/catalog";
import {
  isValidRecipientAddress,
  parseRecipientList,
} from "@/lib/access-requests/recipients";

// One matrix cell. Whether the app and role exist is the catalog's call, read
// in the action: parsing stays pure.
export type SetAppRoleInput = {
  userId: string;
  app: string;
  role: string | null;
};

export function parseSetAppRole(formData: FormData): ParseResult<SetAppRoleInput> {
  const userId = String(formData.get("userId") ?? "").trim();
  const app = String(formData.get("app") ?? "").trim();
  const role = String(formData.get("role") ?? "").trim();

  if (!userId) {
    return parseFailure("Falta la identidad.");
  }

  if (!app) {
    return parseFailure("Falta la app.");
  }

  if (!role) {
    return parseFailure("Falta el rol.");
  }

  return parsed({ userId, app, role: role === NO_ROLE_OPTION ? null : role });
}

export type CreateIdentityInput = { email: string; name: string };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseCreateIdentity(
  formData: FormData,
): ParseResult<CreateIdentityInput> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim();

  if (!EMAIL_PATTERN.test(email)) {
    return parseFailure("Escribí un correo válido.");
  }

  if (!name) {
    return parseFailure("Escribí el nombre.");
  }

  return parsed({ email, name });
}

export type IdentityTargetInput = { userId: string };

export function parseIdentityTarget(
  formData: FormData,
): ParseResult<IdentityTargetInput> {
  const userId = String(formData.get("userId") ?? "").trim();

  return userId ? parsed({ userId }) : parseFailure("Falta la identidad.");
}

export type SetSuperAdminInput = { userId: string; superAdmin: boolean };

export function parseSetSuperAdmin(
  formData: FormData,
): ParseResult<SetSuperAdminInput> {
  const userId = String(formData.get("userId") ?? "").trim();
  const superAdmin = String(formData.get("superAdmin") ?? "");

  if (!userId) {
    return parseFailure("Falta la identidad.");
  }

  if (superAdmin !== "true" && superAdmin !== "false") {
    return parseFailure("Falta el valor de super admin.");
  }

  return parsed({ userId, superAdmin: superAdmin === "true" });
}

export type SetAppRequestRecipientsInput = { app: string; emails: string[] };

// One app's "new Solicitud" list. Every address has to look like one: a typo
// saved here is a Solicitud nobody hears about.
export function parseSetAppRequestRecipients(
  formData: FormData,
): ParseResult<SetAppRequestRecipientsInput> {
  const app = String(formData.get("app") ?? "").trim();
  const emails = parseRecipientList(String(formData.get("emails") ?? ""));
  const invalid = emails.filter((email) => !isValidRecipientAddress(email));

  if (!app) {
    return parseFailure("Falta la app.");
  }

  if (invalid.length) {
    return parseFailure(`Revisá estos correos: ${invalid.join(", ")}.`);
  }

  return parsed({ app, emails });
}
