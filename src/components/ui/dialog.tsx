"use client";

import {
  useId,
  useLayoutEffect,
  useRef,
  type PointerEvent,
  type ReactNode,
  type SyntheticEvent,
} from "react";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

// basket-tv-ui's Select keeps a hidden native <select> (tabIndex -1) next to its button.
const FIRST_FIELD =
  'input, select:not([tabindex="-1"]), textarea, button[role="combobox"]';

// Safari has no `closedby`: a backdrop click is detected by hand there.
const NATIVE_LIGHT_DISMISS =
  typeof HTMLDialogElement !== "undefined" &&
  "closedBy" in HTMLDialogElement.prototype;

// A Select list lives inside the <dialog> even where it overflows its box, so only the dialog itself counts.
function isOnBackdrop(event: PointerEvent<HTMLDialogElement>) {
  if (event.target !== event.currentTarget) return false;
  const box = event.currentTarget.getBoundingClientRect();
  return (
    event.clientX < box.left ||
    event.clientX > box.right ||
    event.clientY < box.top ||
    event.clientY > box.bottom
  );
}

type DialogProps = {
  eyebrow: string;
  title: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
};

export function Dialog({
  eyebrow,
  title,
  onClose,
  children,
  className,
}: DialogProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closedByReact = useRef(false);
  const pressedBackdrop = useRef(false);

  // The cleanup must close the dialog before React removes it, or focus does not return to the opener.
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    closedByReact.current = false;
    if (!dialog.open) dialog.showModal();
    (
      dialog.querySelector<HTMLElement>("[data-autofocus]") ??
      dialog.querySelector<HTMLElement>(FIRST_FIELD) ??
      dialog
    ).focus();
    return () => {
      closedByReact.current = true;
      dialog.close();
    };
  }, []);

  // `close` fires in a later task: under StrictMode the dialog may already be open again.
  function handleClose(event: SyntheticEvent<HTMLDialogElement>) {
    if (!closedByReact.current && !event.currentTarget.open) onClose();
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      tabIndex={-1}
      closedby="any"
      onClose={handleClose}
      onPointerDown={
        NATIVE_LIGHT_DISMISS
          ? undefined
          : (event) => (pressedBackdrop.current = isOnBackdrop(event))
      }
      onPointerUp={
        NATIVE_LIGHT_DISMISS
          ? undefined
          : (event) => {
              if (pressedBackdrop.current && isOnBackdrop(event)) {
                event.currentTarget.close();
              }
            }
      }
      className={cn(
        "mx-auto mb-auto mt-8 max-h-[calc(100dvh-4rem)] w-[calc(100%-2rem)] max-w-[640px] flex-col overflow-hidden overscroll-contain rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--surface)] p-0 text-[var(--foreground)] shadow-[var(--shadow-lift)] outline-none open:flex backdrop:overflow-hidden backdrop:overscroll-contain backdrop:bg-[rgba(28,13,16,0.48)] backdrop:backdrop-blur-sm",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-6 border-b border-[var(--border)] px-7 py-6">
        <div className="min-w-0 space-y-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--n-400)]">
            {eyebrow}
          </p>
          <h2
            id={titleId}
            className="truncate text-xl font-extrabold tracking-tight text-[var(--foreground)]"
          >
            {title}
          </h2>
        </div>
        <button
          type="button"
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--background-soft)] text-[var(--muted)] transition hover:text-[var(--foreground)]"
          onClick={onClose}
          aria-label="Cerrar"
        >
          <X className="size-4.5" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-7 sm:py-6">
        {children}
      </div>
    </dialog>
  );
}
