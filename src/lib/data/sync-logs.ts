import "server-only";

import { and, count, desc, eq, gte, lte, type SQL } from "drizzle-orm";

import type { UserContext } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { gridSyncRunColumns } from "@/lib/db/rows";
import { gridSyncRuns } from "@/lib/db/schema";
import { getDayRange } from "@/lib/date";
import {
  EMPTY_SYNC_LOG_FILTERS,
  type SyncLogFilters,
} from "@/lib/sync/log-filters";
import type { SyncLogEntry } from "@/lib/types";

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

  const conditions: SQL[] = [];

  if (filters.status) {
    conditions.push(eq(gridSyncRuns.status, filters.status));
  }

  if (filters.trigger) {
    conditions.push(eq(gridSyncRuns.trigger, filters.trigger));
  }

  if (filters.dateFrom) {
    conditions.push(
      gte(gridSyncRuns.startedAt, getDayRange(filters.dateFrom, ARG_TZ).startUtc),
    );
  }

  if (filters.dateTo) {
    conditions.push(
      lte(gridSyncRuns.startedAt, getDayRange(filters.dateTo, ARG_TZ).endUtc),
    );
  }

  const where = conditions.length ? and(...conditions) : undefined;

  try {
    const [totalRow] = await db
      .select({ value: count() })
      .from(gridSyncRuns)
      .where(where);
    const total = totalRow?.value ?? 0;

    const rows = await db
      .select(gridSyncRunColumns)
      .from(gridSyncRuns)
      .where(where)
      .orderBy(desc(gridSyncRuns.startedAt))
      .limit(SYNC_LOGS_PAGE_SIZE)
      .offset(from);

    const pageCount = Math.max(1, Math.ceil(total / SYNC_LOGS_PAGE_SIZE));

    return {
      rows: rows as SyncLogEntry[],
      total,
      page: safePage,
      pageCount,
    };
  } catch (error) {
    console.error("[grid-sync] failed to load sync log", error);
    return { rows: [], total: 0, page: safePage, pageCount: 0 };
  }
}
