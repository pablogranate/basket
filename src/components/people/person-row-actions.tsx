"use client";

import Link from "next/link";
import { PencilLine, Trash2 } from "lucide-react";

import { deletePersonAction } from "@/app/actions/people";

export function PersonRowActions({
  personId,
  fullName,
}: {
  personId: string;
  fullName: string;
}) {
  return (
    <div className="flex items-center justify-end gap-2">
      <Link
        href={`/people?edit=${personId}`}
        className="inline-flex size-9 items-center justify-center rounded-lg text-[var(--n-500)] transition hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]"
        title="Editar"
      >
        <PencilLine className="size-4" />
      </Link>
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
        <input type="hidden" name="redirectTo" value="/people" />
        <button
          type="submit"
          className="inline-flex size-9 items-center justify-center rounded-lg text-[var(--n-500)] transition hover:bg-[var(--accent-soft)] hover:text-[var(--accent-strong)]"
          title="Eliminar"
        >
          <Trash2 className="size-4" />
        </button>
      </form>
    </div>
  );
}
