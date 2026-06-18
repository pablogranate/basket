"use client";

import { useEffect, useState } from "react";
import { ChevronDown, PencilLine } from "lucide-react";

import { CreateMatchModal } from "@/components/grid/create-match-modal";
import { usePeople } from "@/components/grid/people-context";
import { formatMatchDate } from "@/lib/date";
import type { MatchListItem } from "@/lib/types";
import { cn } from "@/lib/utils";

type MatchCardActionsProps = {
  canEdit: boolean;
  detailsId: string;
  match: MatchListItem;
  redirectTo: string;
  className?: string;
};

const controlClassName =
  "inline-flex size-10 items-center justify-center rounded-full border border-[#d7dde7] bg-[#f4f6fa] text-[#16181d] transition hover:border-[rgba(230,18,56,0.24)] hover:bg-[#fff3f6] hover:text-[var(--accent)]";

export function MatchCardActions({
  canEdit,
  detailsId,
  match,
  redirectTo,
  className,
}: MatchCardActionsProps) {
  const people = usePeople();
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const details = document.getElementById(detailsId);
    if (!(details instanceof HTMLDetailsElement)) {
      return undefined;
    }

    const observer = new MutationObserver(() => {
      setIsOpen(details.open);
    });

    observer.observe(details, {
      attributes: true,
      attributeFilter: ["open"],
    });

    return () => observer.disconnect();
  }, [detailsId]);

  function toggleDetails(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();

    const details = document.getElementById(detailsId);
    if (details instanceof HTMLDetailsElement) {
      details.open = !details.open;
      setIsOpen(details.open);
    }
  }

  return (
    <div
      className={cn(
        "pointer-events-auto flex flex-col items-center justify-center gap-3",
        className,
      )}
    >
      <CreateMatchModal
        people={people}
        redirectTo={redirectTo}
        canEdit={canEdit}
        initialDate={formatMatchDate(match.kickoff_at, match.timezone, "yyyy-MM-dd")}
        match={match}
        triggerVariant="icon"
        triggerLabel="Editar partido"
        triggerIcon={<PencilLine className="size-4" />}
        triggerClassName={cn(controlClassName, "shadow-none")}
      />

      <button
        type="button"
        aria-label={isOpen ? "Contraer partido" : "Expandir partido"}
        onClick={toggleDetails}
        className={cn(
          controlClassName,
          isOpen &&
            "rotate-180 border-[rgba(230,18,56,0.24)] bg-[#fff3f6] text-[var(--accent)]",
        )}
      >
        <ChevronDown className="size-4" />
      </button>
    </div>
  );
}
