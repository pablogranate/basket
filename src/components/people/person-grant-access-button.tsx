"use client";

import { useState } from "react";
import { ChevronDown, ShieldCheck } from "lucide-react";

import { grantPersonAccessAction } from "@/app/actions/people";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { APP_ROLE_DISPLAY_NAMES } from "@/lib/display";

const ACCESS_TIER_OPTIONS = [
  { value: "admin", label: APP_ROLE_DISPLAY_NAMES.admin },
  { value: "editor", label: APP_ROLE_DISPLAY_NAMES.editor },
  { value: "collaborator", label: APP_ROLE_DISPLAY_NAMES.collaborator },
] as const;

type AccessTierValue = (typeof ACCESS_TIER_OPTIONS)[number]["value"];

export function PersonGrantAccessButton({
  personId,
  redirectTo,
  canSelectAccessTier = false,
}: {
  personId: string;
  redirectTo: string;
  canSelectAccessTier?: boolean;
}) {
  const [accessRole, setAccessRole] = useState<AccessTierValue>("collaborator");

  return (
    <form action={grantPersonAccessAction} className="mt-5 space-y-4">
      <input type="hidden" name="personId" value={personId} />
      <input type="hidden" name="redirectTo" value={redirectTo} />
      <input
        type="hidden"
        name="accessRole"
        value={canSelectAccessTier ? accessRole : "collaborator"}
      />

      <label className="space-y-2">
        <span className="flex items-center gap-2 text-sm font-semibold text-[var(--n-700)]">
          Nivel de acceso
          <span className="inline-block size-1.5 rounded-full bg-[var(--accent)]" />
        </span>
        {canSelectAccessTier ? (
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
        ) : (
          <div className="flex h-12 items-center rounded-[var(--panel-radius)] border border-[var(--n-200)] bg-[var(--n-50)] px-4 text-[15px] font-medium text-[var(--n-800)] shadow-[inset_0_2px_4px_rgba(28,13,16,0.04)]">
            {APP_ROLE_DISPLAY_NAMES.collaborator}
          </div>
        )}
      </label>

      <div className="rounded-[var(--panel-radius)] border border-[var(--n-200)] bg-[var(--n-50)] px-4 py-3 shadow-[inset_0_2px_4px_rgba(28,13,16,0.04)]">
        <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[var(--n-400)]">
          Correo de ingreso
        </p>
        <p className="mt-1 text-sm font-medium text-[var(--n-700)]">
          Se enviará una invitación al correo del colaborador. Ingresa con un
          enlace de acceso (o Google); no se define contraseña.
        </p>
      </div>

      <div className="flex justify-end">
        <SubmitButton
          pendingLabel="Habilitando..."
          className="h-11 gap-2 rounded-[var(--panel-radius)] px-6 text-sm font-bold"
        >
          <ShieldCheck className="size-4" />
          Habilitar acceso
        </SubmitButton>
      </div>
    </form>
  );
}
