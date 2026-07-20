import "server-only";

import { db } from "@/lib/db/client";
import { notificationLogs as notificationLogsTable } from "@/lib/db/schema";
import type { NotificationLogRow } from "@/lib/notifications/log-rows";

// Observability only: a logging failure must NEVER break a send or block the
// day_notified_at stamp. Insert is best-effort and isolated — errors are logged
// and swallowed.
export async function insertNotificationLogs(rows: NotificationLogRow[]) {
  if (!rows.length) {
    return;
  }

  try {
    await db.insert(notificationLogsTable).values(
      rows.map((row) => ({
        matchId: row.match_id,
        personId: row.person_id,
        matchLabel: row.match_label,
        recipientName: row.recipient_name,
        roleNames: row.role_names,
        channel: row.channel,
        destination: row.destination,
        status: row.status,
        error: row.error,
        trigger: row.trigger,
      })),
    );
  } catch (error) {
    console.error("[notifications] failed to write delivery log", error);
  }
}
