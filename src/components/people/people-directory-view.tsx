import Link from "next/link";
import { Power, UserRound } from "lucide-react";

import { togglePersonActiveAction } from "@/app/actions/people";
import {
  getCityIndicator,
  getInitials,
  getPersonRoleDisplay,
  getWhatsAppHref,
  Mail,
  MapPin,
  MessageCircle,
} from "@/components/people/people-view-helpers";
import type { PeopleFilters } from "@/lib/people-filters";
import { parsePersonNotesMeta } from "@/lib/people-notes";
import type { PersonListItem } from "@/lib/types";
import { cn } from "@/lib/utils";

const FILTER_KEYS = ["role", "state", "city", "team"] as const;

function buildDirectoryHref(input: {
  query?: string;
  edit?: string;
  filters?: PeopleFilters;
}) {
  const search = new URLSearchParams();

  search.set("view", "directory");

  if (input.query) {
    search.set("q", input.query);
  }

  if (input.filters) {
    for (const key of FILTER_KEYS) {
      if (input.filters[key]) {
        search.set(key, input.filters[key]);
      }
    }
  }

  if (input.edit) {
    search.set("edit", input.edit);
  }

  return `/people?${search.toString()}`;
}

function getStatePresentation(person: PersonListItem) {
  if (!person.active || person.assignment_state === "Inactivo") {
    return {
      avatarShellClassName: "bg-[#eef2f6]",
      avatarInnerClassName:
        "border-[#eef2f6] bg-[radial-gradient(circle_at_top_left,#f8fafc_0%,#e7ecf3_100%)]",
      avatarTextClassName: "text-[#95a1b4]",
      toggleButtonClassName:
        "border-[#d8dee8] bg-white/80 text-[#94a3b8] hover:border-[#cfd7e3] hover:bg-white hover:text-[#64748b]",
    };
  }

  if (person.assignment_state === "En asignacion") {
    return {
      avatarShellClassName: "bg-[#dcfce7]",
      avatarInnerClassName:
        "border-[#dcfce7] bg-[radial-gradient(circle_at_top_left,#f4fff7_0%,#dff7e7_100%)]",
      avatarTextClassName: "text-[#4f8f64]",
      toggleButtonClassName:
        "border-[#cdeed7] bg-[#f1fcf5] text-[#179a56] hover:border-[#bce5ca] hover:bg-[#e8faef] hover:text-[#177245]",
    };
  }

  return {
    avatarShellClassName: "bg-[#dcfce7]",
    avatarInnerClassName:
      "border-[#dcfce7] bg-[radial-gradient(circle_at_top_left,#f4fff7_0%,#dff7e7_100%)]",
    avatarTextClassName: "text-[#4f8f64]",
    toggleButtonClassName:
      "border-[#cdeed7] bg-[#f1fcf5] text-[#179a56] hover:border-[#bce5ca] hover:bg-[#e8faef] hover:text-[#177245]",
  };
}

export function PeopleDirectoryView({
  people,
  query,
  filters,
  selectedPersonId,
  canEdit,
}: {
  people: PersonListItem[];
  query: string;
  filters: PeopleFilters;
  selectedPersonId?: string | null;
  canEdit: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-5 p-6">
      {people.map((person) => {
        const meta = parsePersonNotesMeta(person.notes);
        const { roleLabel, rolePresentation } = getPersonRoleDisplay(person);
        const whatsappHref = getWhatsAppHref(person.phone);
        const city = meta.city || "";
        const cityIndicator = getCityIndicator(city);
        const isSelected = selectedPersonId === person.id;
        const profileHref = buildDirectoryHref({
          query,
          filters,
          edit: person.id,
        });
        const state = getStatePresentation(person);
        const cityLabel = city || "Sin ciudad";
        const actionHref = whatsappHref ?? profileHref;
        const actionLabel = whatsappHref ? "Enviar mensaje" : "Ver perfil";
        const currentDirectoryHref = buildDirectoryHref({
          query,
          filters,
          edit: isSelected ? person.id : undefined,
        });

        return (
          <article
            key={person.id}
            className={cn(
              "group relative w-full max-w-full overflow-hidden rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[0_10px_24px_rgba(28,13,16,0.05)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_14px_28px_rgba(28,13,16,0.07)] sm:w-[330px] sm:max-w-[330px]",
              isSelected && "border-[#f0d9de] ring-1 ring-[#f4d2da]",
            )}
          >
            <div className="absolute -right-10 -top-10 size-40 rounded-full bg-[rgba(231,19,58,0.03)] blur-3xl" />
            <div className="absolute -bottom-10 -left-10 size-40 rounded-full bg-[rgba(231,19,58,0.04)] blur-3xl" />

            <div className="relative h-32 bg-[linear-gradient(135deg,rgba(231,19,58,0.12),transparent_72%)]">
              <div className="absolute left-6 top-6 flex items-center gap-2 text-[var(--accent)]">
                <rolePresentation.Icon className="size-4" />
                <span className="text-[11px] font-bold uppercase tracking-[0.16em]">
                  {roleLabel}
                </span>
              </div>
              <form action={togglePersonActiveAction} className="absolute right-5 top-5">
                <input type="hidden" name="personId" value={person.id} />
                <input
                  type="hidden"
                  name="active"
                  value={person.active ? "off" : "on"}
                />
                <input type="hidden" name="redirectTo" value={currentDirectoryHref} />
                <button
                  type="submit"
                  disabled={!canEdit}
                  aria-label={`${person.active ? "Desactivar" : "Activar"} a ${person.full_name}`}
                  title={person.active ? "Desactivar" : "Activar"}
                  className={cn(
                    "inline-flex size-9 items-center justify-center rounded-full border transition",
                    state.toggleButtonClassName,
                    !canEdit && "cursor-not-allowed opacity-60",
                  )}
                >
                  <Power className="size-4" />
                </button>
              </form>
            </div>

            <div className="relative flex justify-center -mt-16">
              <div
                className={cn(
                  "rounded-full p-1.5 shadow-[0_8px_18px_rgba(15,23,42,0.05)]",
                  state.avatarShellClassName,
                )}
              >
                <div
                  className={cn(
                    "flex size-32 items-center justify-center overflow-hidden rounded-full border-4",
                    state.avatarInnerClassName,
                  )}
                >
                  <span
                    className={cn(
                      "text-[2.4rem] font-black tracking-[-0.06em]",
                      state.avatarTextClassName,
                    )}
                  >
                    {getInitials(person.full_name)}
                  </span>
                </div>
              </div>
            </div>

            <div className="px-8 pb-8 pt-6 text-center">
              <div>
                <h3 className="text-[1.65rem] font-black leading-[1.05] tracking-[-0.03em] text-[var(--foreground)]">
                  {person.full_name}
                </h3>
              </div>

              <div className="mt-4 flex items-center justify-center gap-1.5 text-xs font-medium text-[#7b8798]">
                {cityIndicator.emoji ? (
                  <span className="inline-flex size-4 items-center justify-center text-sm leading-none">
                    {cityIndicator.emoji}
                  </span>
                ) : (
                  <MapPin className="size-4 text-[#b0bccd]" />
                )}
                <p className="max-w-[16rem] truncate">
                  {cityLabel}
                </p>
              </div>

              <div className="mt-8 space-y-3">
                {person.email ? (
                  <a
                    href={`mailto:${person.email}`}
                    className="group flex items-center gap-4 rounded-[var(--panel-radius)] border border-[#eef1f5] p-3 text-left transition hover:bg-[#fafbfc]"
                  >
                    <div className="flex size-10 items-center justify-center rounded-full bg-[#eef2ff] text-[#4f46e5] transition group-hover:bg-[#e0e7ff]">
                      <Mail className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#a0abba]">
                        Correo institucional
                      </p>
                      <p className="truncate text-sm font-medium text-[#445164]">
                        {person.email}
                      </p>
                    </div>
                  </a>
                ) : (
                  <div className="flex items-center gap-4 rounded-[var(--panel-radius)] border border-[#eef1f5] p-3 text-left">
                    <div className="flex size-10 items-center justify-center rounded-full bg-[#f4f7fb] text-[#94a3b8]">
                      <Mail className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#a0abba]">
                        Correo institucional
                      </p>
                      <p className="truncate text-sm font-medium text-[#7b8798]">
                        Sin correo
                      </p>
                    </div>
                  </div>
                )}

                {person.phone ? (
                  <a
                    href={whatsappHref ?? undefined}
                    target="_blank"
                    rel="noreferrer"
                    className="group flex items-center gap-4 rounded-[var(--panel-radius)] border border-[#eef1f5] p-3 text-left transition hover:bg-[#fafbfc]"
                  >
                    <div className="flex size-10 items-center justify-center rounded-full bg-[#ecfdf3] text-[#16a34a] transition group-hover:bg-[#dcfce7]">
                      <MessageCircle className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#a0abba]">
                        Teléfono directo
                      </p>
                      <p className="truncate text-sm font-medium text-[#445164]">
                        {person.phone}
                      </p>
                    </div>
                  </a>
                ) : (
                  <div className="flex items-center gap-4 rounded-[var(--panel-radius)] border border-[#eef1f5] p-3 text-left">
                    <div className="flex size-10 items-center justify-center rounded-full bg-[#f4f7fb] text-[#94a3b8]">
                      <MessageCircle className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#a0abba]">
                        Teléfono directo
                      </p>
                      <p className="truncate text-sm font-medium text-[#7b8798]">
                        Sin teléfono
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-7 flex gap-3">
                <a
                  href={actionHref}
                  target={whatsappHref ? "_blank" : undefined}
                  rel={whatsappHref ? "noreferrer" : undefined}
                  className="inline-flex h-12 flex-1 items-center justify-center rounded-[var(--panel-radius)] bg-[var(--accent)] px-6 text-sm font-bold text-white shadow-[0_12px_28px_rgba(231,19,58,0.2)] transition hover:brightness-110"
                >
                  {actionLabel}
                </a>
                <Link
                  href={profileHref}
                  className="inline-flex size-12 items-center justify-center rounded-[var(--panel-radius)] border border-[#e6e9ef] text-[#6b778b] transition hover:bg-[#fafbfc] hover:text-[var(--foreground)]"
                >
                  <UserRound className="size-4" />
                </Link>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
