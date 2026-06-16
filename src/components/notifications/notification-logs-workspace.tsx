import Link from "next/link";
import { formatInTimeZone } from "date-fns-tz";
import { es } from "date-fns/locale";

import { EmptyState } from "@/components/ui/empty-state";
import type { NotificationLogsPage } from "@/lib/data/notification-logs";
import type { NotificationLogFilters } from "@/lib/notifications/log-filters";
import type { NotificationLogEntry } from "@/lib/types";
import { cn } from "@/lib/utils";

function buildPageHref(filters: NotificationLogFilters, page: number) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) {
      params.set(key, value);
    }
  }
  params.set("page", String(page));
  return `/notifications/logs?${params.toString()}`;
}

const ARG_TZ = "America/Argentina/Buenos_Aires";

const STATUS_LABELS: Record<string, string> = {
  sent: "Enviado",
  failed: "Falló",
  skipped: "Omitido",
  no_contact: "Sin contacto",
};

const CHANNEL_LABELS: Record<string, string> = {
  whatsapp: "WhatsApp",
  email: "Email",
  none: "—",
};

const TRIGGER_LABELS: Record<string, string> = {
  cron: "Programado",
  catchup: "Recuperación",
  boot: "Arranque",
  manual: "Manual",
};

function label(map: Record<string, string>, key: string) {
  return map[key] ?? key;
}

function formatTimestamp(value: string) {
  return formatInTimeZone(value, ARG_TZ, "d MMM yyyy · HH:mm", { locale: es });
}

function RecipientCell({ row }: { row: NotificationLogEntry }) {
  if (row.person_id) {
    return (
      <Link
        href={`/people/${row.person_id}`}
        className="font-semibold text-[var(--accent)] hover:underline"
      >
        {row.recipient_name}
      </Link>
    );
  }

  return <span>{row.recipient_name}</span>;
}

function MatchCell({ row }: { row: NotificationLogEntry }) {
  if (row.match_id) {
    return (
      <Link
        href={`/match/${row.match_id}`}
        className="font-semibold text-[var(--accent)] hover:underline"
      >
        {row.match_label}
      </Link>
    );
  }

  return <span>{row.match_label}</span>;
}

export function NotificationLogsWorkspace({
  data,
  filters,
}: {
  data: NotificationLogsPage;
  filters: NotificationLogFilters;
}) {
  if (!data.total) {
    return (
      <EmptyState
        title="No hay notificaciones registradas"
        description="Ajustá los filtros o esperá a que se envíe una convocatoria; cada destinatario quedará registrado aquí."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--surface)]">
        <table className="w-full min-w-[64rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-xs font-bold uppercase tracking-[0.16em] text-[var(--muted)]">
              <th className="px-4 py-3">Fecha/hora</th>
              <th className="px-4 py-3">Partido</th>
              <th className="px-4 py-3">Destinatario</th>
              <th className="px-4 py-3">Rol(es)</th>
              <th className="px-4 py-3">Canal</th>
              <th className="px-4 py-3">Destino</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3">Origen</th>
              <th className="px-4 py-3">Error</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => {
              const failed = row.status === "failed";

              return (
                <tr
                  key={row.id}
                  className={cn(
                    "border-b border-[var(--border)] align-top",
                    failed && "bg-[#fff4f6]",
                  )}
                >
                  <td className="whitespace-nowrap px-4 py-3 text-[var(--muted)]">
                    {formatTimestamp(row.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <MatchCell row={row} />
                  </td>
                  <td className="px-4 py-3">
                    <RecipientCell row={row} />
                  </td>
                  <td className="px-4 py-3 text-[var(--muted)]">
                    {row.role_names.length ? row.role_names.join(", ") : "—"}
                  </td>
                  <td className="px-4 py-3">{label(CHANNEL_LABELS, row.channel)}</td>
                  <td className="px-4 py-3 text-[var(--muted)]">
                    {row.destination ?? "—"}
                  </td>
                  <td
                    className={cn(
                      "whitespace-nowrap px-4 py-3 font-semibold",
                      failed && "text-[#ad1d39]",
                    )}
                  >
                    {label(STATUS_LABELS, row.status)}
                  </td>
                  <td className="px-4 py-3 text-[var(--muted)]">
                    {label(TRIGGER_LABELS, row.trigger)}
                  </td>
                  <td className="px-4 py-3 text-[#ad1d39]">
                    {failed ? row.error ?? "—" : ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Pagination data={data} filters={filters} />
    </div>
  );
}

function Pagination({
  data,
  filters,
}: {
  data: NotificationLogsPage;
  filters: NotificationLogFilters;
}) {
  if (data.pageCount <= 1) {
    return null;
  }

  const hasPrev = data.page > 1;
  const hasNext = data.page < data.pageCount;

  return (
    <div className="flex items-center justify-between text-sm text-[var(--muted)]">
      <span>
        Página {data.page} de {data.pageCount} · {data.total} registro(s)
      </span>
      <div className="flex gap-2">
        <PageLink
          href={buildPageHref(filters, data.page - 1)}
          disabled={!hasPrev}
        >
          Anterior
        </PageLink>
        <PageLink
          href={buildPageHref(filters, data.page + 1)}
          disabled={!hasNext}
        >
          Siguiente
        </PageLink>
      </div>
    </div>
  );
}

function PageLink({
  href,
  disabled,
  children,
}: {
  href: string;
  disabled: boolean;
  children: React.ReactNode;
}) {
  const className =
    "inline-flex items-center rounded-xl border border-[var(--border)] px-4 py-2 font-semibold transition";

  if (disabled) {
    return (
      <span className={cn(className, "cursor-not-allowed opacity-50")}>
        {children}
      </span>
    );
  }

  return (
    <Link
      href={href}
      className={cn(className, "hover:bg-[var(--background-soft)]")}
    >
      {children}
    </Link>
  );
}
