"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { SyncLogFilters } from "@/lib/sync/log-filters";
import { cn } from "@/lib/utils";

const SYNCS_PATH = "/notifications/syncs";

const STATUS_OPTIONS = [
  { value: "", label: "Todos" },
  { value: "success", label: "Éxito" },
  { value: "error", label: "Error" },
  { value: "skipped", label: "Omitido" },
];

const TRIGGER_OPTIONS = [
  { value: "", label: "Todos" },
  { value: "cron", label: "Programado" },
  { value: "manual", label: "Manual" },
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

export function SyncLogsFilters({ filters }: { filters: SyncLogFilters }) {
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
      router.push(search ? `${SYNCS_PATH}?${search}` : SYNCS_PATH);
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

      <Field label="Origen">
        <Select name="trigger" defaultValue={filters.trigger}>
          {TRIGGER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>
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
          href={SYNCS_PATH}
          className="inline-flex items-center rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--muted)] transition hover:bg-[var(--background-soft)]"
        >
          Limpiar
        </Link>
      </div>
    </form>
  );
}
