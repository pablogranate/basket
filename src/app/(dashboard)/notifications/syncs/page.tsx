import { Suspense } from "react";

import { SectionPageHeader } from "@/components/layout/section-page-header";
import { SetupPanel } from "@/components/layout/setup-panel";
import { LogsSectionTabs } from "@/components/notifications/logs-section-tabs";
import { SyncLogsFilters } from "@/components/notifications/sync-logs-filters";
import { SyncLogsWorkspace } from "@/components/notifications/sync-logs-workspace";
import { requireAdmin } from "@/lib/auth-access";
import { getSyncLogs } from "@/lib/data/sync-logs";
import { isSupabaseConfigured } from "@/lib/env";
import { parseSyncLogFilters, type SyncLogFilters } from "@/lib/sync/log-filters";
import type { UserContext } from "@/lib/auth";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function parsePage(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
}

export default async function SyncLogsPage({ searchParams }: PageProps) {
  if (!isSupabaseConfigured) {
    return <SetupPanel />;
  }

  const ctx = await requireAdmin();

  const resolvedSearchParams = await searchParams;
  const page = parsePage(resolvedSearchParams.page);
  const filters = parseSyncLogFilters(resolvedSearchParams);

  return (
    <div className="space-y-8">
      <SectionPageHeader
        title="Registros"
        description="Historial de sincronizaciones de la grilla — manuales y programadas — con los partidos creados, actualizados y eliminados en cada ejecución."
      />
      <LogsSectionTabs active="syncs" />
      <SyncLogsFilters filters={filters} />
      <Suspense fallback={<SyncLogsSkeleton />}>
        <SyncLogsRegion ctx={ctx} page={page} filters={filters} />
      </Suspense>
    </div>
  );
}

async function SyncLogsRegion({
  ctx,
  page,
  filters,
}: {
  ctx: UserContext;
  page: number;
  filters: SyncLogFilters;
}) {
  const data = await getSyncLogs(ctx, { page, filters });

  return <SyncLogsWorkspace data={data} filters={filters} />;
}

function SyncLogsSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-live="polite">
      {Array.from({ length: 8 }).map((_, index) => (
        <div
          key={index}
          className="h-14 animate-pulse rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--surface)]"
        />
      ))}
    </div>
  );
}
