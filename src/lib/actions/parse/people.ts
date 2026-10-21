import { parsed, parseFailure, type ParseResult } from "@/lib/actions/define-action";
import { composeAccessRequestCiudad } from "@/lib/access-requests/locations";
import type { AppRole } from "@/lib/database.types";
import { normalizeAccessTier } from "@/lib/roles";
import { isPersonFunctionKey, type PersonFunctionKey } from "@/lib/functions";
import { buildPersonNotesMeta } from "@/lib/people-notes";
import { maybeNull, resolveCheckboxFlag } from "@/lib/utils";

export type UpsertPersonInput = {
  personId: string;
  payload: {
    full_name: string;
    phone: string | null;
    email: string | null;
    notes: string | null;
    active: boolean;
  };
  selectedFunctions: PersonFunctionKey[];
  selectedTeamIds: string[];
};

export function parseUpsertPerson(
  formData: FormData,
): ParseResult<UpsertPersonInput> {
  // Same country/city picker as the Solicitud, so both store "Ciudad, País".
  // An empty city leaves the ficha without one.
  const ciudad = String(formData.get("ciudad") ?? "").trim();
  const city = ciudad
    ? composeAccessRequestCiudad({
        pais: String(formData.get("pais") ?? "").trim(),
        ciudad,
        otraCiudad: String(formData.get("otraCiudad") ?? "").trim(),
      })
    : null;

  if (ciudad && !city) {
    return parseFailure("Elegí el país y la ciudad de la lista.");
  }

  const payload = {
    full_name: String(formData.get("fullName") ?? "").trim(),
    phone: maybeNull(String(formData.get("phone") ?? "")),
    email: maybeNull(String(formData.get("email") ?? "")),
    notes: buildPersonNotesMeta({
      city,
      coverage: maybeNull(String(formData.get("coverageTeams") ?? "")),
      notes: maybeNull(String(formData.get("notes") ?? "")),
    }),
    active: resolveCheckboxFlag(formData, "active", true),
  };

  // Canonical capabilities: the only role source. Validate at the boundary and
  // dedupe; an empty selection is allowed and simply leaves the person out of
  // every assignment dropdown.
  const selectedFunctions = Array.from(
    new Set(
      formData
        .getAll("functions")
        .map((value) => String(value))
        .filter(isPersonFunctionKey),
    ),
  );

  // "Club" links: the person's team FKs, submitted as repeated teamIds fields.
  const selectedTeamIds = Array.from(
    new Set(
      formData
        .getAll("teamIds")
        .map((value) => String(value).trim())
        .filter(Boolean),
    ),
  );

  return parsed({
    personId: String(formData.get("personId") ?? ""),
    payload,
    selectedFunctions,
    selectedTeamIds,
  });
}

export type PersonIdInput = { personId: string };

export function parsePersonId(formData: FormData): ParseResult<PersonIdInput> {
  return parsed({ personId: String(formData.get("personId") ?? "").trim() });
}

export type FichaPairInput = {
  personId: string;
  otherPersonId: string;
};

export function parseFichaPair(formData: FormData): ParseResult<FichaPairInput> {
  const personId = String(formData.get("personId") ?? "").trim();
  const otherPersonId = String(formData.get("otherPersonId") ?? "").trim();

  if (!personId || !otherPersonId) {
    return parseFailure("Elegí las dos fichas.");
  }

  return parsed({ personId, otherPersonId });
}

export type UpdatePersonAccessRoleInput = {
  personId: string;
  requestedAccessRole: AppRole;
};

export function parseUpdatePersonAccessRole(
  formData: FormData,
): ParseResult<UpdatePersonAccessRoleInput> {
  return parsed({
    personId: String(formData.get("personId") ?? "").trim(),
    requestedAccessRole: normalizeAccessTier(
      String(formData.get("accessRole") ?? "collaborator"),
    ),
  });
}
