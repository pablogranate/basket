"use client";

import { useState } from "react";
import { ChevronDown, ShieldCheck } from "lucide-react";

import { updatePersonAccessRoleAction } from "@/app/actions/people";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { APP_ROLE_DISPLAY_NAMES } from "@/lib/display";
import { PeopleRedirectToInput } from "@/components/people/people-redirect-to";

const ACCESS_TIER_OPTIONS = [
  { value: "admin", label: APP_ROLE_DISPLAY_NAMES.admin },
  { value: "editor", label: APP_ROLE_DISPLAY_NAMES.editor },
  { value: "collaborator", label: APP_ROLE_DISPLAY_NAMES.collaborator },
] as const;

type AccessTierValue = (typeof ACCESS_TIER_OPTIONS)[number]["value"];

export function PersonAccessRoleForm({
  personId,
  currentAccessRole,
}: {
  personId: string;
  currentAccessRole: AccessTierValue;
}) {
  const [accessRole, setAccessRole] =
    useState<AccessTierValue>(currentAccessRole);
  const hasChanged = accessRole !== currentAccessRole;

  return (
    <form action={updatePersonAccessRoleAction} className="space-y-3">
      <input type="hidden" name="personId" value={personId} />
      <PeopleRedirectToInput keepEdit />
      <input type="hidden" name="accessRole" value={accessRole} />

      <label className="space-y-2">
        <span className="flex items-center gap-2 text-sm font-semibold text-[var(--n-700)]">
          Nivel de acceso
          <span className="inline-block size-1.5 rounded-full bg-[var(--accent)]" />
        </span>
        <div className="relative">
          <Select
            value={accessRole}
            onChange={(event) =>
              setAccessRole(event.target.value as AccessTierValue)
            }
            className="h-12 appearance-none rounded-[var(--panel-radius)] border-[var(--n-200)] bg-[var(--n-50)] pr-10 text-[15px] font-medium text-[var(--n-800)] shadow-[inset_0_2px_4px_rgba(28,13,16,0.04)] focus:border-[var(--accent)] focus:bg-white focus:ring-[3px] focus:ring-[rgba(227,27,35,0.08)]"
          >
            {ACCESS_TIER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          <ChevronDown className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-[var(--n-400)]" />
        </div>
      </label>

      {hasChanged ? (
        <SubmitButton
          pendingLabel="Actualizando..."
          className="h-11 gap-2 rounded-[var(--panel-radius)] px-6 text-sm font-bold"
        >
          <ShieldCheck className="size-4" />
          Actualizar nivel
        </SubmitButton>
      ) : (
        <p className="text-sm text-[var(--n-500)]">
          Cambia el nivel para actualizar el acceso sin revocarlo.
        </p>
      )}
    </form>
  );
}
