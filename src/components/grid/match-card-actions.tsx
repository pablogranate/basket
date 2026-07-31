"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CreateMatchModal } from "@/components/grid/create-match-modal-lazy";
import { MatchCardIcon } from "@/components/grid/match-card-icon-sprite";
import { usePeople } from "@/components/grid/people-context";
import { formatMatchDate } from "@/lib/date";
import type { MatchEditPrefill } from "@/lib/types";
import { cn } from "@/lib/utils";

type MatchCardActionsProps = {
  canEdit: boolean;
  detailsId: string;
  match: MatchEditPrefill;
  redirectTo: string;
  className?: string;
};

const controlClassName = "mca-btn";

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
      className={cn("mca-wrap", className)}
    >
      <Link
        href={`/match/${match.id}`}
        aria-label="Abrir detalle"
        title="Abrir detalle"
        onClick={(event) => event.stopPropagation()}
        className={controlClassName}
      >
        <MatchCardIcon name="maximize-2" className="size-4" />
      </Link>

      <CreateMatchModal
        people={people}
        redirectTo={redirectTo}
        canEdit={canEdit}
        initialDate={formatMatchDate(match.kickoff_at, match.timezone, "yyyy-MM-dd")}
        match={match}
        triggerVariant="icon"
        triggerLabel="Editar partido"
        triggerIcon={<MatchCardIcon name="pencil-line" className="size-4" />}
        triggerClassName={controlClassName}
      />

      <button
        type="button"
        aria-label={isOpen ? "Contraer partido" : "Expandir partido"}
        onClick={toggleDetails}
        className={cn(
          controlClassName,
          isOpen &&
            "rotate-180 border-[rgba(227,27,35,0.24)] bg-[var(--accent-soft)] text-[var(--accent)]",
        )}
      >
        <MatchCardIcon name="chevron-down" className="size-4" />
      </button>
    </div>
  );
}
