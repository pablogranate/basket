"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { CircleAlert, MessageCircle, X } from "lucide-react";

import { sendAssignmentNotificationsAction } from "@/app/actions/notifications";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";

export type NotifyRecipient = {
  assignmentId: string;
  personName: string;
  roleName: string;
  resolvedNumber: string;
  willSend: boolean;
};

type Props = {
  matchId: string;
  recipients: NotifyRecipient[];
};

export function AssignmentNotifyConfirm({ matchId, recipients }: Props) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(true);

  if (!isOpen || !recipients.length || typeof document === "undefined") {
    return null;
  }

  const close = () => {
    setIsOpen(false);
    router.replace(`/match/${matchId}`);
  };

  const sendableCount = recipients.filter((recipient) => recipient.willSend).length;

  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-start justify-center bg-[rgba(15,23,42,0.48)] px-4 py-8 backdrop-blur-sm">
      <div className="absolute inset-0" aria-hidden="true" onClick={close} />
      <div className="relative z-[1] flex max-h-[calc(100vh-4rem)] w-full max-w-[560px] flex-col overflow-hidden rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[0_32px_80px_rgba(15,23,42,0.22)]">
        <div className="flex items-start justify-between gap-6 border-b border-[var(--border)] px-6 py-5">
          <div className="space-y-1">
            <h2 className="flex items-center gap-2 text-xl font-extrabold tracking-tight text-[var(--foreground)]">
              <MessageCircle className="size-5 text-[var(--accent)]" />
              Actualizado
            </h2>
            <p className="text-sm font-medium text-[var(--muted)]">
              Se enviarán mensajes de WhatsApp notificando a:
            </p>
          </div>
          <button
            type="button"
            className="inline-flex size-10 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--background-soft)] text-[var(--muted)] transition hover:text-[var(--foreground)]"
            onClick={close}
            aria-label="Cerrar"
          >
            <X className="size-4.5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          <ul className="space-y-2">
            {recipients.map((recipient) => (
              <li
                key={recipient.assignmentId}
                className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--background-soft)] px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-[var(--foreground)]">
                    {recipient.personName}
                  </p>
                  <p className="truncate text-xs font-medium text-[var(--muted)]">
                    {recipient.roleName}
                  </p>
                </div>
                {recipient.willSend ? (
                  <span className="shrink-0 font-mono text-xs text-[var(--muted)]">
                    +{recipient.resolvedNumber}
                  </span>
                ) : (
                  <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-[#ad1d39]">
                    <CircleAlert className="size-3.5" />
                    número incompleto — no se enviará
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-[var(--border)] px-6 py-4">
          <Button type="button" variant="secondary" onClick={close}>
            Cancelar
          </Button>
          {sendableCount ? (
            <form action={sendAssignmentNotificationsAction}>
              <input type="hidden" name="matchId" value={matchId} />
              <input
                type="hidden"
                name="assignmentIds"
                value={recipients
                  .filter((recipient) => recipient.willSend)
                  .map((recipient) => recipient.assignmentId)
                  .join(",")}
              />
              <SubmitButton pendingLabel="Enviando...">
                Confirmar envío ({sendableCount})
              </SubmitButton>
            </form>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
