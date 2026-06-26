"use client";

import { Copy, Mail, MessageCircleMore, Send, UsersRound } from "lucide-react";
import { useMemo, useState } from "react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type MatchNotificationRecipient = {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  roles: string[];
  emailHref: string;
  whatsappHref: string;
  personalMessage: string;
};

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

async function writeClipboard(value: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "absolute";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

export function MatchNotificationWorkspace({
  bulkMailtoHref,
  batchMessage,
  recipients,
  unassignedRoles,
}: {
  bulkMailtoHref: string;
  batchMessage: string;
  recipients: MatchNotificationRecipient[];
  unassignedRoles: string[];
}) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const whatsappRecipients = useMemo(
    () => recipients.filter((recipient) => recipient.whatsappHref),
    [recipients],
  );
  const emailRecipients = useMemo(
    () => recipients.filter((recipient) => recipient.emailHref),
    [recipients],
  );

  async function handleCopy(value: string, key: string) {
    try {
      await writeClipboard(value);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey((current) => (current === key ? null : current)), 1800);
    } catch {
      setCopiedKey(null);
    }
  }

  function handleBulkEmail() {
    if (!bulkMailtoHref) {
      return;
    }

    window.location.assign(bulkMailtoHref);
  }

  function handleBulkWhatsApp() {
    whatsappRecipients.forEach((recipient, index) => {
      window.setTimeout(() => {
        window.open(recipient.whatsappHref, "_blank", "noopener,noreferrer");
      }, index * 180);
    });
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_320px]">
      <div className="space-y-6">
        <Card className="space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1">
              <p className="text-[11px] font-black uppercase tracking-[0.24em] text-[var(--accent)]">
                Notificar
              </p>
              <h2 className="text-2xl font-black tracking-tight text-[var(--foreground)]">
                Convocatoria del partido
              </h2>
              <p className="max-w-2xl text-sm leading-6 text-[var(--n-600)]">
                Abre tu correo o WhatsApp con el mensaje listo para pedir confirmación
                de disponibilidad al equipo asignado.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={handleBulkEmail}
                disabled={!emailRecipients.length}
                className="gap-2"
              >
                <Mail className="size-4" />
                Correo a todos
              </Button>
              <Button
                onClick={handleBulkWhatsApp}
                disabled={!whatsappRecipients.length}
                className="gap-2 bg-[#12b76a] shadow-[0_10px_24px_rgba(18,183,106,0.18)] hover:bg-[#0f9f5c]"
              >
                <MessageCircleMore className="size-4" />
                WhatsApp a todos
              </Button>
              <Button
                variant="secondary"
                onClick={() => handleCopy(batchMessage, "batch")}
                className="gap-2"
              >
                <Copy className="size-4" />
                {copiedKey === "batch" ? "Copiado" : "Copiar texto"}
              </Button>
            </div>
          </div>

          <div className="rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--background-soft)] p-4">
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[var(--n-400)]">
              Mensaje base
            </p>
            <pre className="mt-3 whitespace-pre-wrap font-body text-sm leading-6 text-[var(--foreground)]">
              {batchMessage}
            </pre>
          </div>

          <div className="flex flex-wrap gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--n-400)]">
            <Badge>{emailRecipients.length} con correo</Badge>
            <Badge>{whatsappRecipients.length} con WhatsApp</Badge>
            <Badge>{recipients.length} convocados</Badge>
          </div>
        </Card>

        <Card className="space-y-5">
          <div className="space-y-1">
            <p className="text-[11px] font-black uppercase tracking-[0.24em] text-[var(--n-400)]">
              Convocados
            </p>
            <h3 className="text-xl font-black tracking-tight text-[var(--foreground)]">
              Contactos por persona
            </h3>
          </div>

          {recipients.length ? (
            <div className="space-y-4">
              {recipients.map((recipient, index) => (
                <div
                  key={recipient.id}
                  className={cn(
                    "flex flex-wrap items-center justify-between gap-4",
                    index === recipients.length - 1
                      ? ""
                      : "border-b border-[var(--border)] pb-4",
                  )}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-[#c9ead8] bg-[#eefbf3] text-sm font-black text-[#1b8b56]">
                      {getInitials(recipient.fullName)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-base font-bold text-[var(--foreground)]">
                        {recipient.fullName}
                      </p>
                      <p className="mt-1 truncate text-[10px] font-black uppercase tracking-[0.16em] text-[var(--n-500)]">
                        {recipient.roles.join(" · ")}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {recipient.email ? (
                          <span className="inline-flex items-center rounded-full border border-[var(--accent-border)] bg-[var(--accent-soft)] px-3 py-1 text-xs font-semibold text-[var(--accent)]">
                            {recipient.email}
                          </span>
                        ) : (
                          <Badge>Sin correo</Badge>
                        )}
                        {recipient.phone ? (
                          <span className="inline-flex items-center rounded-full border border-[#c9ead8] bg-[#eefbf3] px-3 py-1 text-xs font-semibold text-[#1b8b56]">
                            {recipient.phone}
                          </span>
                        ) : (
                          <Badge>Sin WhatsApp</Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      variant="secondary"
                      onClick={() => handleCopy(recipient.personalMessage, recipient.id)}
                      className="gap-2"
                    >
                      <Copy className="size-4" />
                      {copiedKey === recipient.id ? "Copiado" : "Copiar"}
                    </Button>
                    <button
                      type="button"
                      onClick={() => {
                        if (recipient.emailHref) {
                          window.location.assign(recipient.emailHref);
                        }
                      }}
                      disabled={!recipient.emailHref}
                      aria-label={`Enviar correo a ${recipient.fullName}`}
                      className={cn(
                        "inline-flex size-11 items-center justify-center rounded-full border transition",
                        recipient.emailHref
                          ? "border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent)] hover:brightness-105"
                          : "cursor-not-allowed border-[var(--border)] bg-[var(--n-100)] text-[var(--n-300)]",
                      )}
                    >
                      <Mail className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (recipient.whatsappHref) {
                          window.open(recipient.whatsappHref, "_blank", "noopener,noreferrer");
                        }
                      }}
                      disabled={!recipient.whatsappHref}
                      aria-label={`Abrir WhatsApp de ${recipient.fullName}`}
                      className={cn(
                        "inline-flex size-11 items-center justify-center rounded-full border transition",
                        recipient.whatsappHref
                          ? "border-[#c9ead8] bg-[#eefbf3] text-[#1b8b56] hover:brightness-105"
                          : "cursor-not-allowed border-[var(--border)] bg-[var(--n-100)] text-[var(--n-300)]",
                      )}
                    >
                      <MessageCircleMore className="size-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--background-soft)] px-4 py-5 text-sm font-semibold text-[var(--n-500)]">
              Aún no hay personas asignadas a este partido. Primero carga el staff y luego
              vuelve a esta pantalla para notificar.
            </div>
          )}
        </Card>
      </div>

      <div className="space-y-4">
        <Card className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="inline-flex size-11 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
              <Send className="size-5" />
            </span>
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.24em] text-[var(--n-400)]">
                Resumen
              </p>
              <h3 className="text-lg font-black tracking-tight text-[var(--foreground)]">
                Estado de contactos
              </h3>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <div className="rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--background-soft)] p-4">
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[var(--n-400)]">
                Con correo
              </p>
              <p className="mt-3 text-3xl font-black tracking-tight text-[var(--foreground)]">
                {emailRecipients.length}
              </p>
            </div>
            <div className="rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--background-soft)] p-4">
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[var(--n-400)]">
                Con WhatsApp
              </p>
              <p className="mt-3 text-3xl font-black tracking-tight text-[var(--foreground)]">
                {whatsappRecipients.length}
              </p>
            </div>
            <div className="rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--background-soft)] p-4">
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[var(--n-400)]">
                Sin cubrir
              </p>
              <p className="mt-3 text-3xl font-black tracking-tight text-[var(--foreground)]">
                {unassignedRoles.length}
              </p>
            </div>
          </div>
        </Card>

        {unassignedRoles.length ? (
          <Card className="space-y-4 border-[#f2d8ae] bg-[#fffaf0]">
            <div className="flex items-center gap-3">
              <span className="inline-flex size-11 items-center justify-center rounded-2xl bg-[#fff0d8] text-[#b46b09]">
                <UsersRound className="size-5" />
              </span>
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.24em] text-[#b46b09]">
                  Pendiente
                </p>
                <h3 className="text-lg font-black tracking-tight text-[var(--foreground)]">
                  Roles sin asignar
                </h3>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {unassignedRoles.map((role) => (
                <Badge key={role} className="border-[#efd9b7] bg-white text-[#9a5a0f]">
                  {role}
                </Badge>
              ))}
            </div>
          </Card>
        ) : null}

        <Card className="space-y-3">
          <p className="text-[11px] font-black uppercase tracking-[0.24em] text-[var(--n-400)]">
            Nota
          </p>
          <p className="text-sm leading-6 text-[var(--n-600)]">
            El correo se abre con tu cliente predeterminado. El botón de WhatsApp a todos
            abre un chat por persona para que puedas enviar la convocatoria sin reescribir
            el mensaje.
          </p>
        </Card>
      </div>
    </div>
  );
}
