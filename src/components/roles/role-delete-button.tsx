"use client";

import { useFormStatus } from "react-dom";

import { deleteRoleAction } from "@/app/actions/roles";
import { cn } from "@/lib/utils";

// Gives role delete the same pending feedback the "Guardar" SubmitButton has.
// The delete and save buttons share one form, so useFormStatus().pending goes
// true for either submission — we scope the "Eliminando..." label to this
// action via `action`, while disabling on any pending submit so the row can't
// be double-submitted mid-flight.
export function RoleDeleteButton() {
  const { pending, action } = useFormStatus();
  const deleting = pending && action === deleteRoleAction;

  return (
    <button
      type="submit"
      formAction={deleteRoleAction}
      disabled={pending}
      className={cn(
        "inline-flex items-center justify-center rounded-xl border border-[var(--accent-border)] bg-[var(--accent-soft)] px-4 py-2 text-sm font-semibold text-[var(--accent-strong)] transition hover:bg-[var(--accent-border)]",
        pending && "cursor-not-allowed opacity-70",
      )}
    >
      {deleting ? "Eliminando..." : "Eliminar"}
    </button>
  );
}
