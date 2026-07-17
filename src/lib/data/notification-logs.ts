import "server-only";

import { and, count, desc, eq, gte, ilike, inArray, lte, type SQL } from "drizzle-orm";

import type { UserContext } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { notificationLogColumns } from "@/lib/db/rows";
import { notificationLogs } from "@/lib/db/schema";
import { getDayRange } from "@/lib/date";
import {
  EMPTY_NOTIFICATION_LOG_FILTERS,
  resolveTriggerValues,
  type NotificationLogFilters,
} from "@/lib/notifications/log-filters";
import type { NotificationLogEntry } from "@/lib/types";

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

  const conditions: SQL[] = [];

  if (filters.status) {
    conditions.push(eq(notificationLogs.status, filters.status));
  }

  if (filters.channel) {
    conditions.push(eq(notificationLogs.channel, filters.channel));
  }

  const triggerValues = resolveTriggerValues(filters.trigger);
  if (triggerValues) {
    conditions.push(inArray(notificationLogs.trigger, triggerValues));
  }

  if (filters.dateFrom) {
    conditions.push(
      gte(notificationLogs.createdAt, getDayRange(filters.dateFrom, ARG_TZ).startUtc),
    );
  }

  if (filters.dateTo) {
    conditions.push(
      lte(notificationLogs.createdAt, getDayRange(filters.dateTo, ARG_TZ).endUtc),
    );
  }

  if (filters.recipient) {
    conditions.push(
      ilike(notificationLogs.recipientName, `%${escapeIlike(filters.recipient)}%`),
    );
  }

  if (filters.match) {
    conditions.push(
      ilike(notificationLogs.matchLabel, `%${escapeIlike(filters.match)}%`),
    );
  }

  const where = conditions.length ? and(...conditions) : undefined;

  try {
    const [totalRow] = await db
      .select({ value: count() })
      .from(notificationLogs)
      .where(where);
    const total = totalRow?.value ?? 0;

    const rows = await db
      .select(notificationLogColumns)
      .from(notificationLogs)
      .where(where)
      .orderBy(desc(notificationLogs.createdAt))
      .limit(NOTIFICATION_LOGS_PAGE_SIZE)
      .offset(from);

    const pageCount = Math.max(1, Math.ceil(total / NOTIFICATION_LOGS_PAGE_SIZE));

    return {
      rows: rows as NotificationLogEntry[],
      total,
      page: safePage,
      pageCount,
    };
  } catch (error) {
    console.error("[notifications] failed to load delivery log", error);
    return { rows: [], total: 0, page: safePage, pageCount: 0 };
  }
}
