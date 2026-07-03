"use client";

import { useEffect, useState } from "react";
import {
  type LucideIcon,
  Mic2,
  PencilLine,
  SlidersHorizontal,
  Video,
} from "lucide-react";

import dynamic from "next/dynamic";

import { getMatchCardSectionsAction } from "@/app/actions/match-card-sections";
import { getCompactPersonName, getRoleDisplayName } from "@/lib/display";
import { getAttendanceTextClass } from "@/lib/grid/attendance";
import type {
  MatchCardSection,
  MatchCardSectionKey,
  SectionRow,
} from "@/lib/grid/match-card-sections";
import { cn, ensureErrorMessage } from "@/lib/utils";

// Lazy: the contacts modal only mounts when a card is expanded and its button
// clicked, so keep it out of the initial grid bundle.
const MatchContactsModal = dynamic(
  () =>
    import("@/components/grid/match-contacts-modal").then(
      (mod) => mod.MatchContactsModal,
    ),
  { ssr: false },
);

const SECTION_META: Record<
  MatchCardSectionKey,
  { title: string; icon: LucideIcon }
> = {
  production: { title: "Producción y Dirección", icon: SlidersHorizontal },
  cameras: { title: "Cámaras", icon: Video },
  talent: { title: "Relatos & Comentarios", icon: Mic2 },
  observations: { title: "Observaciones / Transporte", icon: PencilLine },
};

function Section({
  title,
  icon: Icon,
  rows,
}: {
  title: string;
  icon: LucideIcon;
  rows: SectionRow[];
}) {
  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-center gap-2 border-b border-[var(--border)] pb-3">
        <Icon className="size-4 text-[var(--accent)]" />
        <h4 className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-[var(--accent)]">
          {title}
        </h4>
      </div>

      <div className="flex flex-1 flex-col gap-4">
        {rows.map((row) => {
          const displayValue =
            row.compactValue && !row.muted
              ? getCompactPersonName(row.value)
              : row.value;

          return (
            <div key={row.label} className="space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--n-400)]">
                {getRoleDisplayName(row.label)}
              </p>
              <p
                className={cn(
                  "text-sm text-[var(--foreground)]",
                  row.multiline ? "leading-6 font-medium whitespace-pre-line" : "font-bold",
                  row.muted &&
                    (row.multiline
                      ? "text-[var(--muted)] italic"
                      : "text-[var(--muted)] italic font-semibold"),
                  getAttendanceTextClass(row.attendanceState ?? null),
                )}
              >
                {displayValue}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function MatchCardDetails({
  detailsId,
  matchId,
  matchLabel,
}: {
  detailsId: string;
  matchId: string;
  matchLabel: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [sections, setSections] = useState<MatchCardSection[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const details = document.getElementById(detailsId);
    if (!(details instanceof HTMLDetailsElement)) {
      return undefined;
    }

    const handler = () => setIsOpen(details.open);
    details.addEventListener("toggle", handler);

    return () => details.removeEventListener("toggle", handler);
  }, [detailsId]);

  useEffect(() => {
    // Fetch the detail rows on first expand only; they are no longer serialized
    // into the collapsed card's Flight payload. Cache across close/reopen.
    if (!isOpen || sections !== null) {
      return;
    }

    let active = true;

    getMatchCardSectionsAction(matchId)
      .then((result) => {
        if (active) {
          setSections(result);
          setError(null);
        }
      })
      .catch((caught) => {
        if (active) {
          setError(ensureErrorMessage(caught));
        }
      });

    return () => {
      active = false;
    };
  }, [isOpen, matchId, sections]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="overflow-hidden rounded-b-[10px] border-t border-[var(--border)] bg-[#fffefd] px-5 py-5 sm:px-6">
      <div className="mb-5 flex justify-end">
        <MatchContactsModal matchId={matchId} matchLabel={matchLabel} />
      </div>
      {error ? (
        <p className="rounded-[var(--panel-radius)] border border-[var(--accent-border)] bg-[var(--accent-soft)] px-5 py-4 text-sm font-semibold text-[var(--accent-strong)]">
          {error}
        </p>
      ) : sections === null ? (
        <SectionsSkeleton />
      ) : (
        <div className="grid gap-6 xl:grid-cols-4">
          {sections.map((section) => {
            const meta = SECTION_META[section.key];

            return (
              <Section
                key={section.key}
                title={meta.title}
                icon={meta.icon}
                rows={section.rows}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function SectionsSkeleton() {
  return (
    <div className="grid gap-6 xl:grid-cols-4" aria-busy="true" aria-live="polite">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="flex flex-col gap-4">
          <div className="h-4 w-2/3 animate-pulse rounded bg-[var(--background-soft)]" />
          <div className="flex flex-col gap-4">
            {Array.from({ length: 3 }).map((__, row) => (
              <div key={row} className="space-y-1">
                <div className="h-2.5 w-1/2 animate-pulse rounded bg-[var(--background-soft)]" />
                <div className="h-3.5 w-4/5 animate-pulse rounded bg-[var(--background-soft)]" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
