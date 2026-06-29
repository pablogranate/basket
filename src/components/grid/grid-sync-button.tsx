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
      className="inline-flex size-[52px] items-center justify-center rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--surface)] text-[var(--accent)] shadow-[var(--shadow-rest)] transition hover:border-[var(--accent-border)] hover:text-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-60"
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
