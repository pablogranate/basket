"use client";

import { useFormStatus } from "react-dom";
import { RefreshCw } from "lucide-react";

import { syncPeopleAction } from "@/app/actions/people-sync";
import { getToolbarIconButtonClassName } from "@/components/ui/toolbar-icon-button";
import { cn } from "@/lib/utils";
import { PeopleRedirectToInput } from "@/components/people/people-redirect-to";

function SubmitButton({ title }: { title: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-label={pending ? "Sincronizando contactos" : title}
      title={pending ? "Sincronizando contactos" : title}
      className={cn(
        getToolbarIconButtonClassName({ tone: "violet" }),
        "disabled:cursor-not-allowed disabled:opacity-60",
      )}
    >
      <RefreshCw className={pending ? "size-4 animate-spin" : "size-4"} />
    </button>
  );
}

type PeopleSyncButtonProps = {
  lastSyncedLabel?: string;
};

export function PeopleSyncButton({
  lastSyncedLabel,
}: PeopleSyncButtonProps) {
  const title = lastSyncedLabel
    ? `Sincronizar contactos (última: ${lastSyncedLabel})`
    : "Sincronizar contactos desde la planilla";

  return (
    <form action={syncPeopleAction}>
      <PeopleRedirectToInput />
      <SubmitButton title={title} />
    </form>
  );
}
