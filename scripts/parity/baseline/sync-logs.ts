import "server-only";

import type { UserContext } from "@/lib/auth";
import { getDayRange } from "@/lib/date";
import {
  EMPTY_SYNC_LOG_FILTERS,
  type SyncLogFilters,
} from "@/lib/sync/log-filters";
import type { SyncLogEntry } from "@/lib/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const ARG_TZ = "America/Argentina/Buenos_Aires";

export const SYNC_LOGS_PAGE_SIZE = 50;

export type SyncLogsPage = {
  rows: SyncLogEntry[];
  total: number;
  page: number;
  pageCount: number;
};

// Reads through the service-role client (grid_sync_runs has no RLS), so
// authorization is enforced here: the log is admin-only. ctx-first per D-07.
export async function getSyncLogs(
  ctx: UserContext,
  {
    page = 1,
    filters = EMPTY_SYNC_LOG_FILTERS,
  }: { page?: number; filters?: SyncLogFilters } = {},
): Promise<SyncLogsPage> {
  if (ctx.role !== "admin") {
    throw new Error("Solo un admin puede ver el registro de sincronizaciones.");
  }

  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const from = (safePage - 1) * SYNC_LOGS_PAGE_SIZE;
  const to = from + SYNC_LOGS_PAGE_SIZE - 1;

  const supabase = createSupabaseAdminClient();
  let query = supabase.from("grid_sync_runs").select("*", { count: "exact" });

  if (filters.status) {
    query = query.eq("status", filters.status);
  }

  if (filters.trigger) {
    query = query.eq("trigger", filters.trigger);
  }

  if (filters.dateFrom) {
    query = query.gte("started_at", getDayRange(filters.dateFrom, ARG_TZ).startUtc);
  }

  if (filters.dateTo) {
    query = query.lte("started_at", getDayRange(filters.dateTo, ARG_TZ).endUtc);
  }

  const result = await query
    .order("started_at", { ascending: false })
    .range(from, to);

  if (result.error) {
    console.error("[grid-sync] failed to load sync log", result.error);
    return { rows: [], total: 0, page: safePage, pageCount: 0 };
  }

  const total = result.count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / SYNC_LOGS_PAGE_SIZE));

  return {
    rows: (result.data ?? []) as SyncLogEntry[],
    total,
    page: safePage,
    pageCount,
  };
}
