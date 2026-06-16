import "server-only";

import type { UserContext } from "@/lib/auth";
import { getDayRange } from "@/lib/date";
import {
  EMPTY_NOTIFICATION_LOG_FILTERS,
  resolveTriggerValues,
  type NotificationLogFilters,
} from "@/lib/notifications/log-filters";
import type { NotificationLogEntry } from "@/lib/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const ARG_TZ = "America/Argentina/Buenos_Aires";

export const NOTIFICATION_LOGS_PAGE_SIZE = 50;

export type NotificationLogsPage = {
  rows: NotificationLogEntry[];
  total: number;
  page: number;
  pageCount: number;
};

function escapeIlike(value: string) {
  return value.replace(/[%_]/g, (char) => `\\${char}`);
}

// Reads through the service-role client (notification_logs has no RLS), so
// authorization is enforced here: the log is admin-only. ctx-first per D-07.
export async function getNotificationLogs(
  ctx: UserContext,
  {
    page = 1,
    filters = EMPTY_NOTIFICATION_LOG_FILTERS,
  }: { page?: number; filters?: NotificationLogFilters } = {},
): Promise<NotificationLogsPage> {
  if (ctx.role !== "admin") {
    throw new Error("Solo un admin puede ver el registro de notificaciones.");
  }

  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const from = (safePage - 1) * NOTIFICATION_LOGS_PAGE_SIZE;
  const to = from + NOTIFICATION_LOGS_PAGE_SIZE - 1;

  const supabase = createSupabaseAdminClient();
  let query = supabase
    .from("notification_logs")
    .select("*", { count: "exact" });

  if (filters.status) {
    query = query.eq("status", filters.status);
  }

  if (filters.channel) {
    query = query.eq("channel", filters.channel);
  }

  const triggerValues = resolveTriggerValues(filters.trigger);
  if (triggerValues) {
    query = query.in("trigger", triggerValues);
  }

  if (filters.dateFrom) {
    query = query.gte("created_at", getDayRange(filters.dateFrom, ARG_TZ).startUtc);
  }

  if (filters.dateTo) {
    query = query.lte("created_at", getDayRange(filters.dateTo, ARG_TZ).endUtc);
  }

  if (filters.recipient) {
    query = query.ilike("recipient_name", `%${escapeIlike(filters.recipient)}%`);
  }

  if (filters.match) {
    query = query.ilike("match_label", `%${escapeIlike(filters.match)}%`);
  }

  const result = await query
    .order("created_at", { ascending: false })
    .range(from, to);

  if (result.error) {
    console.error("[notifications] failed to load delivery log", result.error);
    return { rows: [], total: 0, page: safePage, pageCount: 0 };
  }

  const total = result.count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / NOTIFICATION_LOGS_PAGE_SIZE));

  return {
    rows: (result.data ?? []) as NotificationLogEntry[],
    total,
    page: safePage,
    pageCount,
  };
}
