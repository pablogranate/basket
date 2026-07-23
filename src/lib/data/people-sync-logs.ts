import "server-only";

import { and, count, desc, eq, gte, lte, type SQL } from "drizzle-orm";

import type { UserContext } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { peopleSyncRunColumns } from "@/lib/db/rows";
import { peopleSyncRuns } from "@/lib/db/schema";
import { getDayRange } from "@/lib/date";
import {
  EMPTY_SYNC_LOG_FILTERS,
  type SyncLogFilters,
} from "@/lib/sync/log-filters";
import type { PeopleSyncLogEntry } from "@/lib/types";

const ARG_TZ = "America/Argentina/Buenos_Aires";

export const PEOPLE_SYNC_LOGS_PAGE_SIZE = 50;

export type PeopleSyncLogsPage = {
  rows: PeopleSyncLogEntry[];
  total: number;
  page: number;
  pageCount: number;
};

// Admin-only, enforced here (people_sync_runs has no RLS). ctx-first per D-07.
export async function getPeopleSyncLogs(
  ctx: UserContext,
  {
    page = 1,
    filters = EMPTY_SYNC_LOG_FILTERS,
  }: { page?: number; filters?: SyncLogFilters } = {},
): Promise<PeopleSyncLogsPage> {
  if (ctx.role !== "admin") {
    throw new Error(
      "Solo un admin puede ver el registro de sincronizaciones de contactos.",
    );
  }

  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const from = (safePage - 1) * PEOPLE_SYNC_LOGS_PAGE_SIZE;

  const conditions: SQL[] = [];

  if (filters.status) {
    conditions.push(eq(peopleSyncRuns.status, filters.status));
  }

  if (filters.dateFrom) {
    conditions.push(
      gte(peopleSyncRuns.startedAt, getDayRange(filters.dateFrom, ARG_TZ).startUtc),
    );
  }

  if (filters.dateTo) {
    conditions.push(
      lte(peopleSyncRuns.startedAt, getDayRange(filters.dateTo, ARG_TZ).endUtc),
    );
  }

  const where = conditions.length ? and(...conditions) : undefined;

  try {
    const [totalRow] = await db
      .select({ value: count() })
      .from(peopleSyncRuns)
      .where(where);
    const total = totalRow?.value ?? 0;

    const rows = await db
      .select(peopleSyncRunColumns)
      .from(peopleSyncRuns)
      .where(where)
      .orderBy(desc(peopleSyncRuns.startedAt))
      .limit(PEOPLE_SYNC_LOGS_PAGE_SIZE)
      .offset(from);

    const pageCount = Math.max(1, Math.ceil(total / PEOPLE_SYNC_LOGS_PAGE_SIZE));

    return {
      rows: rows as PeopleSyncLogEntry[],
      total,
      page: safePage,
      pageCount,
    };
  } catch (error) {
    console.error("[people-sync] failed to load sync log", error);
    return { rows: [], total: 0, page: safePage, pageCount: 0 };
  }
}
