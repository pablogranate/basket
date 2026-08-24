"use client";

import { memo } from "react";
import { Mail, MapPin, MessageCircle } from "lucide-react";
import Link from "next/link";

import {
  getInitials,
  getWhatsAppHref,
} from "@/components/people/people-view-helpers";
import { PersonActiveToggle } from "@/components/people/person-active-toggle";
import type { PersonView } from "@/components/people/people-view-context";
import { cn } from "@/lib/utils";

// Phone fallback for `PeopleTable`: the table is 1538px wide, so on a 390px
// viewport only the first column is ever visible.
export const PeopleCardList = memo(function PeopleCardList({
  rows,
  canEdit,
}: {
  rows: PersonView[];
  canEdit: boolean;
}) {
  return (
    <ul className="divide-y divide-[var(--n-100)]">
      {rows.map(({ person, roleLabel, rolePresentation, city, cityIndicator }) => {
        const whatsAppHref = getWhatsAppHref(person.phone);

        return (
          <li key={person.id} className="px-4 py-4">
            <div className="flex items-start gap-3">
              <div className="grid size-10 shrink-0 place-items-center rounded-full border border-[var(--border)] bg-[var(--n-100)] text-sm font-extrabold text-[var(--n-600)]">
                {getInitials(person.full_name)}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    {canEdit ? (
                      <Link
                        href={`/people?edit=${person.id}`}
                        className="block truncate text-sm font-extrabold text-[var(--foreground)]"
                      >
                        {person.full_name}
                      </Link>
                    ) : (
                      <p className="truncate text-sm font-extrabold text-[var(--foreground)]">
                        {person.full_name}
                      </p>
                    )}

                    <div className="mt-1 flex items-center gap-1.5">
                      <span
                        className={cn(
                          "inline-flex size-5 items-center justify-center rounded-full",
                          rolePresentation.className,
                        )}
                      >
                        <rolePresentation.Icon className="size-3" />
                      </span>
                      <span className="truncate text-xs font-semibold text-[var(--n-500)]">
                        {roleLabel}
                      </span>
                    </div>
                  </div>

                  <PersonActiveToggle
                    personId={person.id}
                    active={person.active}
                    fullName={person.full_name}
                    canEdit={canEdit}
                  />
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span
                    title={cityIndicator.label}
                    className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[var(--n-100)] px-3 text-xs font-semibold text-[var(--n-600)]"
                  >
                    {cityIndicator.emoji ? (
                      <span aria-hidden="true">{cityIndicator.emoji}</span>
                    ) : (
                      <MapPin className="size-3.5 text-[var(--n-400)]" />
                    )}
                    {city || "Sin ciudad"}
                  </span>

                  {whatsAppHref ? (
                    <a
                      href={whatsAppHref}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#ecfdf3] px-3 text-xs font-bold text-[#16a34a]"
                    >
                      <MessageCircle className="size-3.5" />
                      {person.phone}
                    </a>
                  ) : (
                    <span className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[var(--n-100)] px-3 text-xs font-semibold text-[var(--n-400)]">
                      <MessageCircle className="size-3.5" />
                      Sin teléfono
                    </span>
                  )}

                  {person.email ? (
                    <a
                      href={`mailto:${person.email}`}
                      className="inline-flex h-9 max-w-full items-center gap-1.5 rounded-full bg-[var(--accent-soft)] px-3 text-xs font-bold text-[var(--accent)]"
                    >
                      <Mail className="size-3.5 shrink-0" />
                      <span className="truncate">{person.email}</span>
                    </a>
                  ) : null}
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
});
