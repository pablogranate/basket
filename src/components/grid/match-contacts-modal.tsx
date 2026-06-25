"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Mail, MessageCircleMore, Phone, Users, X } from "lucide-react";

import {
  getMatchContactsAction,
  type MatchContact,
} from "@/app/actions/contacts";
import { HoverAvatarBadge } from "@/components/ui/hover-avatar-badge";
import { getAttendanceTextClass } from "@/lib/grid/attendance";
import { buildWhatsAppUrl, cn, ensureErrorMessage } from "@/lib/utils";

function getInitials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

const linkBaseClass =
  "inline-flex size-10 items-center justify-center rounded-full border transition";
const linkActiveClass =
  "border-[#c9d8fb] bg-[#eef4ff] text-[#2b6be7] hover:brightness-105";
const linkDisabledClass =
  "cursor-not-allowed border-[var(--border)] bg-[#f4f6fa] text-[#b1bccd]";

export function MatchContactsModal({
  matchId,
  matchLabel,
}: {
  matchId: string;
  matchLabel: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [contacts, setContacts] = useState<MatchContact[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // SSR-safe portal gate: document is only available after mount.
    setIsMounted(true);

    return () => {
      setIsMounted(false);
    };
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  async function loadContacts() {
    setIsLoading(true);
    setError(null);

    try {
      const result = await getMatchContactsAction(matchId);
      setContacts(result);
    } catch (caught) {
      setError(ensureErrorMessage(caught));
    } finally {
      setIsLoading(false);
    }
  }

  function openModal() {
    setIsOpen(true);

    // Local per-card cache: keep the first successful fetch for re-opens.
    if (contacts === null && !isLoading) {
      void loadContacts();
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--background-soft)] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[#5f6d84] transition hover:border-[rgba(230,18,56,0.24)] hover:text-[var(--accent)]"
      >
        <Users className="size-3.5" />
        Ver contactos
      </button>

      {isOpen && isMounted
        ? createPortal(
            <div className="fixed inset-0 z-[300] flex items-start justify-center bg-[rgba(15,23,42,0.48)] px-4 py-8 backdrop-blur-sm">
              <div
                className="absolute inset-0"
                aria-hidden="true"
                onClick={() => setIsOpen(false)}
              />
              <div className="relative z-[1] flex max-h-[calc(100vh-4rem)] w-full max-w-[640px] flex-col overflow-hidden rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[0_32px_80px_rgba(15,23,42,0.22)]">
                <div className="flex items-start justify-between gap-6 border-b border-[var(--border)] px-7 py-6">
                  <div className="min-w-0 space-y-1">
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#8ea0bb]">
                      Contactos del equipo
                    </p>
                    <h2 className="truncate text-xl font-extrabold tracking-tight text-[var(--foreground)]">
                      {matchLabel}
                    </h2>
                  </div>
                  <button
                    type="button"
                    className="inline-flex size-11 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--background-soft)] text-[var(--muted)] transition hover:text-[var(--foreground)]"
                    onClick={() => setIsOpen(false)}
                    aria-label="Cerrar"
                  >
                    <X className="size-4.5" />
                  </button>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7 sm:py-6">
                  {isLoading ? (
                    <div className="space-y-3">
                      {[0, 1, 2].map((key) => (
                        <div
                          key={key}
                          className="h-[68px] animate-pulse rounded-[var(--panel-radius)] bg-[var(--background-soft)]"
                        />
                      ))}
                    </div>
                  ) : error ? (
                    <div className="space-y-4 rounded-[var(--panel-radius)] border border-[#efbcc7] bg-[#fff5f7] px-5 py-5 text-sm font-semibold text-[#b73656]">
                      <p>{error}</p>
                      <button
                        type="button"
                        onClick={() => void loadContacts()}
                        className="inline-flex items-center rounded-full border border-[#efbcc7] bg-white px-4 py-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[#b73656] transition hover:brightness-105"
                      >
                        Reintentar
                      </button>
                    </div>
                  ) : contacts && contacts.length ? (
                    <div className="space-y-3">
                      {contacts.map((contact) => {
                        const whatsappHref = buildWhatsAppUrl(contact.phone);
                        const mailtoHref = contact.email
                          ? `mailto:${contact.email}`
                          : "";

                        return (
                          <div
                            key={contact.personId}
                            className="flex flex-wrap items-center justify-between gap-4 rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--background-soft)] px-4 py-3"
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              <HoverAvatarBadge
                                initials={getInitials(contact.name)}
                                roleLabel={contact.roles.join(" · ")}
                                showTooltip={false}
                                tone="neutral"
                                size="md"
                              />
                              <div className="min-w-0">
                                <p
                                  className={cn(
                                    "truncate text-sm font-bold text-[var(--foreground)]",
                                    getAttendanceTextClass(contact.attendance),
                                  )}
                                >
                                  {contact.name}
                                </p>
                                <p className="mt-1 truncate text-[10px] font-bold uppercase tracking-[0.16em] text-[#7587a1]">
                                  {contact.roles.join(" · ") || "Sin rol"}
                                </p>
                                <p className="mt-1 truncate text-xs font-semibold text-[var(--muted)]">
                                  {contact.phone ?? "—"}
                                  {" · "}
                                  {contact.email ?? "—"}
                                </p>
                              </div>
                            </div>

                            <div className="flex shrink-0 items-center gap-2">
                              <a
                                href={mailtoHref || undefined}
                                aria-label={`Enviar correo a ${contact.name}`}
                                aria-disabled={!mailtoHref}
                                onClick={(event) => {
                                  if (!mailtoHref) {
                                    event.preventDefault();
                                  }
                                }}
                                className={cn(
                                  linkBaseClass,
                                  mailtoHref ? linkActiveClass : linkDisabledClass,
                                )}
                              >
                                <Mail className="size-4" />
                              </a>
                              <a
                                href={whatsappHref || undefined}
                                target={whatsappHref ? "_blank" : undefined}
                                rel="noopener noreferrer"
                                aria-label={`Abrir WhatsApp de ${contact.name}`}
                                aria-disabled={!whatsappHref}
                                onClick={(event) => {
                                  if (!whatsappHref) {
                                    event.preventDefault();
                                  }
                                }}
                                className={cn(
                                  linkBaseClass,
                                  whatsappHref
                                    ? "border-[#c9ead8] bg-[#eefbf3] text-[#1b8b56] hover:brightness-105"
                                    : linkDisabledClass,
                                )}
                              >
                                <MessageCircleMore className="size-4" />
                              </a>
                              <a
                                href={contact.phone ? `tel:${contact.phone}` : undefined}
                                aria-label={`Llamar a ${contact.name}`}
                                aria-disabled={!contact.phone}
                                onClick={(event) => {
                                  if (!contact.phone) {
                                    event.preventDefault();
                                  }
                                }}
                                className={cn(
                                  linkBaseClass,
                                  contact.phone ? linkActiveClass : linkDisabledClass,
                                )}
                              >
                                <Phone className="size-4" />
                              </a>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--background-soft)] px-4 py-5 text-sm font-semibold text-[#7d8ca4]">
                      Sin personas asignadas.
                    </div>
                  )}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
