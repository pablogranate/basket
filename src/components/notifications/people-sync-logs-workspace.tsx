import Link from "next/link";
import { formatInTimeZone } from "date-fns-tz";
import { es } from "date-fns/locale";

import { EmptyState } from "@/components/ui/empty-state";
import type { PeopleSyncLogsPage } from "@/lib/data/people-sync-logs";
import type { SyncLogFilters } from "@/lib/sync/log-filters";
import type { PeopleSyncLogEntry } from "@/lib/types";
import { cn } from "@/lib/utils";

function buildPageHref(filters: SyncLogFilters, page: number) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) {
      params.set(key, value);
    }
  }
  params.set("page", String(page));
  return `/notifications/sync-people?${params.toString()}`;
}

const ARG_TZ = "America/Argentina/Buenos_Aires";

const STATUS_LABELS: Record<string, string> = {
  success: "Éxito",
  error: "Error",
};

function formatTimestamp(value: string) {
  return formatInTimeZone(value, ARG_TZ, "d MMM yyyy · HH:mm", { locale: es });
}

function formatCount(value: number) {
  return value > 0 ? String(value) : "—";
}

export function PeopleSyncLogsWorkspace({
  data,
  filters,
}: {
  data: PeopleSyncLogsPage;
  filters: SyncLogFilters;
}) {
  if (!data.total) {
    return (
      <EmptyState
        title="No hay sincronizaciones de contactos"
        description="Ajustá los filtros o corré una sincronización desde la sección Personal — cada ejecución quedará registrada aquí."
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
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3">Creados</th>
              <th className="px-4 py-3">Actualizados</th>
              <th className="px-4 py-3">Restaurados</th>
              <th className="px-4 py-3">Eliminados</th>
              <th className="px-4 py-3">Omitidos</th>
              <th className="px-4 py-3">Avisos</th>
              <th className="px-4 py-3">Error</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row: PeopleSyncLogEntry) => {
              const failed = row.status === "error";
              const warnings = Array.isArray(row.warnings) ? row.warnings : [];

              return (
                <tr
                  key={row.id}
                  className={cn(
                    "border-b border-[var(--border)] align-top",
                    failed && "bg-[var(--accent-soft)]",
                  )}
                >
                  <td className="whitespace-nowrap px-4 py-3 text-[var(--muted)]">
                    {formatTimestamp(row.started_at)}
                  </td>
                  <td
                    className={cn(
                      "whitespace-nowrap px-4 py-3 font-semibold",
                      failed && "text-[var(--accent-strong)]",
                    )}
                  >
                    {STATUS_LABELS[row.status] ?? row.status}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {formatCount(row.created_count)}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {formatCount(row.updated_count)}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {formatCount(row.restored_count)}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {formatCount(row.deleted_count)}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-[var(--muted)]">
                    {formatCount(row.skipped_count)}
                  </td>
                  <td className="px-4 py-3 text-[var(--muted)]">
                    {warnings.length ? (
                      <details>
                        <summary className="cursor-pointer font-semibold">
                          {warnings.length} aviso(s)
                        </summary>
                        <ul className="mt-2 list-disc space-y-1 pl-4">
                          {warnings.map((warning, index) => (
                            <li key={index}>{warning}</li>
                          ))}
                        </ul>
                      </details>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3 text-[var(--accent-strong)]">
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
  data: PeopleSyncLogsPage;
  filters: SyncLogFilters;
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
