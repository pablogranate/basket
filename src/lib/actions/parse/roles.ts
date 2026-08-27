import { parsed, type ParseResult } from "@/lib/actions/define-action";
import { normalizeRoleCategoryInput, normalizeRoleNameInput } from "@/lib/display";
import { resolveCheckboxFlag } from "@/lib/utils";

export type UpsertRoleInput = {
  roleId: string;
  payload: {
    name: string;
    category: string;
    sort_order: number;
    active: boolean;
  };
};

export function parseUpsertRole(
  formData: FormData,
): ParseResult<UpsertRoleInput> {
  return parsed({
    roleId: String(formData.get("roleId") ?? ""),
    payload: {
      name: normalizeRoleNameInput(String(formData.get("name") ?? "")),
      category: normalizeRoleCategoryInput(
        String(formData.get("category") ?? "Produccion"),
      ),
      sort_order: Number(formData.get("sortOrder") ?? 0),
      active: resolveCheckboxFlag(formData, "active", true),
    },
  });
}

export type DeleteRoleInput = { roleId: string };

export function parseDeleteRole(
  formData: FormData,
): ParseResult<DeleteRoleInput> {
  return parsed({ roleId: String(formData.get("roleId") ?? "") });
}
