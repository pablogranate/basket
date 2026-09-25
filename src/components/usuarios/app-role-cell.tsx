"use client";

import { useState } from "react";
import { Check } from "lucide-react";

import { setAppRoleAction } from "@/app/actions/usuarios";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { NO_ROLE_OPTION } from "@/lib/acceso/catalog";

// One matrix cell: the role for one identity in one app, from that app's
// catalog. Saving grants, changes or revokes ("Sin acceso") the Acceso.
export function AppRoleCell({
  userId,
  app,
  appLabel,
  roles,
  currentRole,
}: {
  userId: string;
  app: string;
  appLabel: string;
  roles: ReadonlyArray<{ key: string; label: string }>;
  currentRole: string | null;
}) {
  const current = currentRole ?? NO_ROLE_OPTION;
  const [role, setRole] = useState(current);
  const hasChanged = role !== current;
  // A role the catalog no longer declares still shows, so the cell reflects the row.
  const options =
    currentRole && !roles.some((entry) => entry.key === currentRole)
      ? [{ key: currentRole, label: `${currentRole} (no aplica)` }, ...roles]
      : roles;

  return (
    <form action={setAppRoleAction} className="flex items-center gap-2">
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="app" value={app} />
      <Select
        name="role"
        value={role}
        onChange={(event) => setRole(event.target.value)}
        aria-label={`Rol en ${appLabel}`}
        className={
          currentRole
            ? "h-10 min-w-[8.5rem] px-3 py-0 font-semibold"
            : "h-10 min-w-[8.5rem] px-3 py-0 text-[var(--n-500)]"
        }
      >
        <option value={NO_ROLE_OPTION}>Sin acceso</option>
        {options.map((option) => (
          <option key={option.key} value={option.key}>
            {option.label}
          </option>
        ))}
      </Select>
      {hasChanged ? (
        <SubmitButton
          pendingLabel="…"
          className="h-10 gap-1 rounded-[var(--panel-radius)] px-3 text-xs font-bold"
        >
          <Check className="size-4" />
          Guardar
        </SubmitButton>
      ) : null}
    </form>
  );
}
