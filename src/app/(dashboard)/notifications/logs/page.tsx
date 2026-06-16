import { SectionPageHeader } from "@/components/layout/section-page-header";
import { SetupPanel } from "@/components/layout/setup-panel";
import { NotificationLogsFilters } from "@/components/notifications/notification-logs-filters";
import { NotificationLogsWorkspace } from "@/components/notifications/notification-logs-workspace";
import { requireAdmin } from "@/lib/auth-access";
import { getNotificationLogs } from "@/lib/data/notification-logs";
import { isSupabaseConfigured } from "@/lib/env";
import { parseNotificationLogFilters } from "@/lib/notifications/log-filters";

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
  const data = await getNotificationLogs(ctx, { page, filters });

  return (
    <div className="space-y-8">
      <SectionPageHeader
        title="Notificaciones"
        description="Registro de convocatorias enviadas por WhatsApp y email — automáticas y manuales — con el resultado por destinatario."
      />
      <NotificationLogsFilters filters={filters} />
      <NotificationLogsWorkspace data={data} filters={filters} />
    </div>
  );
}
