"use client";

import { Trash2 } from "lucide-react";

import { deletePersonAction } from "@/app/actions/people";
import { cn } from "@/lib/utils";

export function PersonDeleteButton({
  personId,
  fullName,
  redirectTo,
  className,
  title,
  label,
}: {
  personId: string;
  fullName: string;
  redirectTo: string;
  className?: string;
  title?: string;
  label?: string;
}) {
  return (
    <form
      action={deletePersonAction}
      onSubmit={(event) => {
        const confirmed = window.confirm(
          `Vas a eliminar el registro de ${fullName}. Este cambio puede ser permanente y afectar futuras asignaciones. ¿Quieres continuar?`,
        );

        if (!confirmed) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="personId" value={personId} />
      <input type="hidden" name="redirectTo" value={redirectTo} />
      <button
        type="submit"
        className={cn(
          "inline-flex size-9 items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--n-500)] transition hover:border-[var(--accent-border)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent-strong)]",
          className,
        )}
        title={title ?? `Eliminar ${fullName}`}
      >
        <Trash2 className="size-4" />
        {label ? <span>{label}</span> : null}
      </button>
    </form>
  );
}
