import Link from "next/link";

import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import type { NotificationLogFilters } from "@/lib/notifications/log-filters";

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
  return (
    <form
      method="get"
      action="/notifications/logs"
      className="grid gap-4 rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--surface)] p-5 lg:grid-cols-4"
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
        <SubmitButton pendingLabel="Filtrando…">Filtrar</SubmitButton>
        <Link
          href="/notifications/logs"
          className="inline-flex items-center rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--muted)] transition hover:bg-[var(--background-soft)]"
        >
          Limpiar
        </Link>
      </div>
    </form>
  );
}
