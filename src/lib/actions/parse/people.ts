import { parsed, type ParseResult } from "@/lib/actions/define-action";
import { normalizeAccessTier, type AccessTierRole } from "@/lib/access-tier";
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
  const payload = {
    full_name: String(formData.get("fullName") ?? "").trim(),
    phone: maybeNull(String(formData.get("phone") ?? "")),
    email: maybeNull(String(formData.get("email") ?? "")),
    notes: buildPersonNotesMeta({
      city: maybeNull(String(formData.get("city") ?? "")),
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

export type UpdatePersonAccessRoleInput = {
  personId: string;
  requestedAccessRole: AccessTierRole;
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
