"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { NotificationLogFilters } from "@/lib/notifications/log-filters";
import { cn } from "@/lib/utils";

const LOGS_PATH = "/notifications/logs";

const STATUS_OPTIONS = [
  { value: "", label: "Todos" },
  { value: "sent", label: "Enviado" },
  { value: "failed", label: "Falló" },
  { value: "skipped", label: "Omitido" },
  { value: "no_contact", label: "Sin contacto" },
];

const CHANNEL_OPTIONS = [
  { value: "", label: "Todos" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "email", label: "Email" },
  { value: "none", label: "Sin contacto" },
];

const TRIGGER_OPTIONS = [
  { value: "", label: "Todos" },
  { value: "manual", label: "Manual" },
  { value: "automatic", label: "Automático" },
  { value: "cron", label: "Programado" },
  { value: "catchup", label: "Recuperación" },
  { value: "boot", label: "Arranque" },
];

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-xs font-bold uppercase tracking-[0.16em] text-[var(--muted)]">
      {label}
      {children}
    </label>
  );
}

export function NotificationLogsFilters({
  filters,
}: {
  filters: NotificationLogFilters;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const params = new URLSearchParams();
    for (const [key, value] of new FormData(event.currentTarget).entries()) {
      if (typeof value === "string" && value) {
        params.set(key, value);
      }
    }

    const search = params.toString();
    startTransition(() => {
      router.push(search ? `${LOGS_PATH}?${search}` : LOGS_PATH);
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={cn(
        "grid gap-4 rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--surface)] p-5 transition-opacity lg:grid-cols-4",
        isPending && "opacity-60",
      )}
      aria-busy={isPending}
    >
      <Field label="Estado">
        <Select name="status" defaultValue={filters.status}>
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Canal">
        <Select name="channel" defaultValue={filters.channel}>
          {CHANNEL_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Origen">
        <Select name="trigger" defaultValue={filters.trigger}>
          {TRIGGER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Destinatario">
        <Input
          name="recipient"
          defaultValue={filters.recipient}
          placeholder="Nombre…"
        />
      </Field>

      <Field label="Partido">
        <Input name="match" defaultValue={filters.match} placeholder="Equipos…" />
      </Field>

      <Field label="Desde">
        <Input type="date" name="dateFrom" defaultValue={filters.dateFrom} />
      </Field>

      <Field label="Hasta">
        <Input type="date" name="dateTo" defaultValue={filters.dateTo} />
      </Field>

      <div className="flex items-end gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Filtrando…" : "Filtrar"}
        </Button>
        <Link
          href={LOGS_PATH}
          className="inline-flex items-center rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--muted)] transition hover:bg-[var(--background-soft)]"
        >
          Limpiar
        </Link>
      </div>
    </form>
  );
}
