"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { Mail, MessageCircleMore, Send, X } from "lucide-react";

import { sendAllMatchNotificationsAction } from "@/app/actions/notifications";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";

export type SendAllRecipient = {
  personId: string;
  personName: string;
  roleNames: string[];
  hasPhone: boolean;
  hasEmail: boolean;
};

export function MatchNotifyAllButton({
  matchId,
  recipients,
}: {
  matchId: string;
  recipients: SendAllRecipient[];
}) {
  const [isOpen, setIsOpen] = useState(false);

  const withPhone = recipients.filter((recipient) => recipient.hasPhone).length;
  const withEmail = recipients.filter((recipient) => recipient.hasEmail).length;

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        disabled={!recipients.length}
        className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-4 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(227,27,35,0.18)] transition hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Send className="size-4" />
        Enviar a todos
      </button>

      {isOpen && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-[300] flex items-start justify-center bg-[rgba(15,23,42,0.48)] px-4 py-8 backdrop-blur-sm">
              <div
                className="absolute inset-0"
                aria-hidden="true"
                onClick={() => setIsOpen(false)}
              />
              <div className="relative z-[1] flex max-h-[calc(100vh-4rem)] w-full max-w-[560px] flex-col overflow-hidden rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[0_32px_80px_rgba(15,23,42,0.22)]">
                <div className="flex items-start justify-between gap-6 border-b border-[var(--border)] px-6 py-5">
                  <div className="space-y-1">
                    <h2 className="flex items-center gap-2 text-xl font-extrabold tracking-tight text-[var(--foreground)]">
                      <Send className="size-5 text-[var(--accent)]" />
                      Enviar notificación a todos
                    </h2>
                    <p className="text-sm font-medium text-[var(--muted)]">
                      Se enviará WhatsApp y correo a las personas asignadas:
                    </p>
                  </div>
                  <button
                    type="button"
                    className="inline-flex size-10 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--background-soft)] text-[var(--muted)] transition hover:text-[var(--foreground)]"
                    onClick={() => setIsOpen(false)}
                    aria-label="Cerrar"
                  >
                    <X className="size-4.5" />
                  </button>
                </div>

                <div className="flex flex-wrap gap-2 border-b border-[var(--border)] px-6 py-3">
                  <Badge className="gap-1">
                    <MessageCircleMore className="size-3.5" />
                    {withPhone} con WhatsApp
                  </Badge>
                  <Badge className="gap-1">
                    <Mail className="size-3.5" />
                    {withEmail} con correo
                  </Badge>
                  <Badge>{recipients.length} convocados</Badge>
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-4">
                  <ul className="space-y-2">
                    {recipients.map((recipient) => (
                      <li
                        key={recipient.personId}
                        className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--background-soft)] px-4 py-3"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-[var(--foreground)]">
                            {recipient.personName}
                          </p>
                          <p className="truncate text-xs font-medium text-[var(--muted)]">
                            {recipient.roleNames.join(" · ")}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5 text-[var(--muted)]">
                          {recipient.hasPhone ? (
                            <MessageCircleMore className="size-4 text-[#1b8b56]" />
                          ) : null}
                          {recipient.hasEmail ? (
                            <Mail className="size-4 text-[var(--accent)]" />
                          ) : null}
                          {!recipient.hasPhone && !recipient.hasEmail ? (
                            <span className="text-xs font-semibold text-[#ad1d39]">
                              sin contacto
                            </span>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="flex items-center justify-end gap-3 border-t border-[var(--border)] px-6 py-4">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setIsOpen(false)}
                  >
                    Cancelar
                  </Button>
                  <form action={sendAllMatchNotificationsAction}>
                    <input type="hidden" name="matchId" value={matchId} />
                    <SubmitButton pendingLabel="Enviando...">
                      Confirmar envío ({recipients.length})
                    </SubmitButton>
                  </form>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
