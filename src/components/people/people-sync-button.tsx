"use client";

import dynamic from "next/dynamic";
import { RefreshCw } from "lucide-react";

import { getToolbarIconButtonClassName } from "@/components/ui/toolbar-icon-button";
import { cn } from "@/lib/utils";

// Lazy boundary: the confirmation modal is hidden until the button is pressed,
// so it ships as its own async chunk.
const PeopleSyncModal = dynamic(
  () =>
    import("@/components/people/people-sync-modal").then(
      (mod) => mod.PeopleSyncModal,
    ),
  { ssr: false },
);

type PeopleSyncButtonProps = {
  lastSyncedLabel?: string;
};

export function PeopleSyncButton({ lastSyncedLabel }: PeopleSyncButtonProps) {
  const title = lastSyncedLabel
    ? `Sincronizar contactos (última: ${lastSyncedLabel})`
    : "Sincronizar contactos desde la planilla";

  return (
    <PeopleSyncModal
      title={title}
      triggerClassName={cn(
        getToolbarIconButtonClassName({ tone: "violet" }),
        "disabled:cursor-not-allowed disabled:opacity-60",
      )}
    >
      <RefreshCw className="size-4" />
    </PeopleSyncModal>
  );
}
