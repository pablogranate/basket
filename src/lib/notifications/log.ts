import "server-only";

import type { NotificationLogRow } from "@/lib/notifications/log-rows";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// Observability only: a logging failure must NEVER break a send or block the
// day_notified_at stamp. Insert is best-effort and isolated — errors are logged
// and swallowed.
export async function insertNotificationLogs(rows: NotificationLogRow[]) {
  if (!rows.length) {
    return;
  }

  try {
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase.from("notification_logs").insert(rows);

    if (error) {
      console.error("[notifications] failed to write delivery log", error);
    }
  } catch (error) {
    console.error("[notifications] failed to write delivery log", error);
  }
}
