"use client";

import { useFormStatus } from "react-dom";
import { RefreshCw } from "lucide-react";

import { syncGridAction } from "@/app/actions/grid-sync";

function SubmitButton({ title }: { title: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-label={pending ? "Sincronizando grilla" : title}
      title={pending ? "Sincronizando grilla" : title}
      className="inline-flex size-[52px] items-center justify-center rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--surface)] text-[#7c3aed] shadow-[0_8px_18px_rgba(15,23,42,0.06)] transition hover:border-[rgba(124,58,237,0.24)] hover:text-[#6d28d9] disabled:cursor-not-allowed disabled:opacity-60"
    >
      <RefreshCw className={pending ? "size-4 animate-spin" : "size-4"} />
    </button>
  );
}

type GridSyncButtonProps = {
  redirectTo: string;
  lastSyncedLabel?: string;
};

export function GridSyncButton({ redirectTo, lastSyncedLabel }: GridSyncButtonProps) {
  const title = lastSyncedLabel
    ? `Sincronizar grilla (última: ${lastSyncedLabel})`
    : "Sincronizar grilla";

  return (
    <form action={syncGridAction}>
      <input type="hidden" name="redirectTo" value={redirectTo} />
      <SubmitButton title={title} />
    </form>
  );
}
