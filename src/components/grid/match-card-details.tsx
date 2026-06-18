"use client";

import { useEffect, useState } from "react";
import {
  type LucideIcon,
  Mic2,
  PencilLine,
  SlidersHorizontal,
  Video,
} from "lucide-react";

import { getCompactPersonName, getRoleDisplayName } from "@/lib/display";
import { cn } from "@/lib/utils";

export type SectionRow = {
  label: string;
  value: string;
  muted?: boolean;
  compactValue?: boolean;
  multiline?: boolean;
};

export type MatchCardSectionKey =
  | "production"
  | "cameras"
  | "talent"
  | "observations";

export type MatchCardSection = {
  key: MatchCardSectionKey;
  rows: SectionRow[];
};

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
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#a08f91]">
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
  sections,
}: {
  detailsId: string;
  sections: MatchCardSection[];
}) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const details = document.getElementById(detailsId);
    if (!(details instanceof HTMLDetailsElement)) {
      return undefined;
    }

    const handler = () => setIsOpen(details.open);
    details.addEventListener("toggle", handler);

    return () => details.removeEventListener("toggle", handler);
  }, [detailsId]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="overflow-hidden rounded-b-[10px] border-t border-[var(--border)] bg-[#fffefd] px-5 py-5 sm:px-6">
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
    </div>
  );
}
