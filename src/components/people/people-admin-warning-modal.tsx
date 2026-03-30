"use client";

import { useEffect, useState } from "react";
import { Info, PencilLine, X } from "lucide-react";
import { cn } from "@/lib/utils";

export function PeopleAdminWarningModal({
  triggerClassName,
}: {
  triggerClassName?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={cn(
          "inline-flex size-9 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[#7b8798] transition hover:border-[#f0d9de] hover:bg-[#fff7f8] hover:text-[var(--accent)]",
          triggerClassName,
        )}
        title="Ver advertencia de edición"
        aria-label="Ver advertencia de edición"
      >
        <PencilLine className="size-4" />
      </button>

      {isOpen ? (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-[#101828]/60 p-4 backdrop-blur-sm"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="panel-surface relative w-full max-w-lg border border-[var(--border)] bg-[var(--surface)] shadow-[0_24px_64px_rgba(15,23,42,0.22)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex size-10 items-center justify-center rounded-2xl bg-[#fff1f4] text-[var(--accent)]">
                  <Info className="size-5" />
                </span>
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.24em] text-[var(--accent)]">
                    Edición
                  </p>
                  <h3 className="mt-2 text-xl font-extrabold text-[var(--foreground)]">
                    Selecciona una persona para editar
                  </h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="inline-flex size-10 items-center justify-center rounded-full bg-[var(--background-soft)] text-[#94a3b8] transition hover:bg-[#eef2f6] hover:text-[#52627a]"
                aria-label="Cerrar modal"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="space-y-4 px-6 py-5 text-sm leading-6 text-[#5f6c80]">
              <p>
                Este lápiz edita el registro que tengas seleccionado en
                <strong className="font-semibold text-[var(--foreground)]">
                  {" "}Tabla{" "}
                </strong>
                o
                <strong className="font-semibold text-[var(--foreground)]">
                  {" "}Directorio
                </strong>
                .
              </p>
              <p>
                Haz clic primero sobre una persona del listado para abrir su
                edición, o usa el lápiz de la fila si prefieres entrar directo
                desde ahí.
              </p>
            </div>

            <div className="flex justify-end border-t border-[var(--border)] px-6 py-4">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="inline-flex h-10 items-center justify-center rounded-xl bg-[var(--accent)] px-5 text-sm font-bold text-white transition hover:bg-[var(--accent-strong)]"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
