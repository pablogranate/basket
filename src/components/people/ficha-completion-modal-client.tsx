"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { IdCard } from "lucide-react";

import { completeFichaAction } from "@/app/actions/ficha-completion";
import { CiudadFieldClient } from "@/components/access-requests/ciudad-field-client";
import { PhoneFieldClient } from "@/components/access-requests/phone-field-client";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  ACCESS_REQUEST_FUNCIONES,
  type AccessRequestFuncion,
} from "@/lib/access-requests/constants";

// "Más tarde" lasts the browser session; the modal comes back in a new one
// until the ficha exists.
const DISMISSED_STORAGE_KEY = "bp_ficha_completion_dismissed";

const LABEL_CLASS =
  "text-xs font-black uppercase tracking-[0.18em] text-[var(--n-500)]";

export function FichaCompletionModalClient({
  funcion,
  phone,
  ciudad,
}: {
  funcion: AccessRequestFuncion | null;
  phone: string | null;
  ciudad: string | null;
}) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  // Opens after hydration: sessionStorage is not readable on the server.
  useEffect(() => {
    let dismissed = false;

    try {
      dismissed = window.sessionStorage.getItem(DISMISSED_STORAGE_KEY) === "1";
    } catch {
      // Without storage the modal simply shows again on the next page.
    }

    if (dismissed) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setIsOpen(true);
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  function dismiss() {
    try {
      window.sessionStorage.setItem(DISMISSED_STORAGE_KEY, "1");
    } catch {
      // Closing still works; it just won't be remembered.
    }

    setIsOpen(false);
  }

  if (!isOpen) {
    return null;
  }

  // Portalled to the body: the shells' headers set backdrop-blur, which would
  // clip a fixed overlay rendered in place.
  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-start justify-center overflow-y-auto bg-[var(--n-900)]/60 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ficha-completion-title"
        className="panel-surface relative my-8 w-full max-w-lg border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow-lift)] sm:p-7"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            dismiss();
          }
        }}
      >
        <div className="mb-5 flex items-start gap-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
            <IdCard className="size-5" aria-hidden />
          </span>
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.24em] text-[var(--accent)]">
              Tu ficha
            </p>
            <h2
              id="ficha-completion-title"
              className="mt-1 text-xl font-extrabold tracking-[-0.02em] text-[var(--foreground)]"
            >
              Completá tus datos de producción
            </h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Con esto te pueden asignar partidos y ves tu jornada.
            </p>
          </div>
        </div>

        <form action={completeFichaAction} className="space-y-4">
          <input type="hidden" name="redirectTo" value={pathname} />

          <div className="space-y-1.5">
            <label htmlFor="ficha-completion-funcion" className={LABEL_CLASS}>
              Función
            </label>
            <Select
              id="ficha-completion-funcion"
              name="funcion"
              required
              defaultValue={funcion ?? ""}
            >
              <option value="" disabled>
                Elegí tu función
              </option>
              {ACCESS_REQUEST_FUNCIONES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </Select>
          </div>

          <CiudadFieldClient id="ficha-completion-ciudad" defaultValue={ciudad} />

          <div className="space-y-1.5">
            <label htmlFor="ficha-completion-phone" className={LABEL_CLASS}>
              Teléfono
            </label>
            <PhoneFieldClient
              id="ficha-completion-phone"
              name="phone"
              defaultValue={phone}
            />
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={dismiss}>
              Más tarde
            </Button>
            <SubmitButton pendingLabel="Guardando...">Guardar</SubmitButton>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
