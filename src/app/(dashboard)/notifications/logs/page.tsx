import { Suspense } from "react";

import { SectionPageHeader } from "@/components/layout/section-page-header";
import { SetupPanel } from "@/components/layout/setup-panel";
import { NotificationLogsFilters } from "@/components/notifications/notification-logs-filters";
import { NotificationLogsWorkspace } from "@/components/notifications/notification-logs-workspace";
import { requireAdmin } from "@/lib/auth-access";
import { getNotificationLogs } from "@/lib/data/notification-logs";
import { isSupabaseConfigured } from "@/lib/env";
import {
  parseNotificationLogFilters,
  type NotificationLogFilters,
} from "@/lib/notifications/log-filters";
import type { UserContext } from "@/lib/auth";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function parsePage(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
}

export default async function NotificationLogsPage({ searchParams }: PageProps) {
  if (!isSupabaseConfigured) {
    return <SetupPanel />;
  }

  const ctx = await requireAdmin();

  const resolvedSearchParams = await searchParams;
  const page = parsePage(resolvedSearchParams.page);
  const filters = parseNotificationLogFilters(resolvedSearchParams);

  return (
    <div className="space-y-8">
      <SectionPageHeader
        title="Notificaciones"
        description="Registro de convocatorias enviadas por WhatsApp y email — automáticas y manuales — con el resultado por destinatario."
      />
      <NotificationLogsFilters filters={filters} />
      <Suspense fallback={<NotificationLogsSkeleton />}>
        <NotificationLogsRegion ctx={ctx} page={page} filters={filters} />
      </Suspense>
    </div>
  );
}

async function NotificationLogsRegion({
  ctx,
  page,
  filters,
}: {
  ctx: UserContext;
  page: number;
  filters: NotificationLogFilters;
}) {
  const data = await getNotificationLogs(ctx, { page, filters });

  return <NotificationLogsWorkspace data={data} filters={filters} />;
}

function NotificationLogsSkeleton() {
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
