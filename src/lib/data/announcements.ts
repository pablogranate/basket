import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AnnouncementRow } from "@/lib/database.types";

export type AnnouncementSummary = Pick<
  AnnouncementRow,
  "id" | "title" | "body" | "active" | "updated_at" | "created_at"
>;

async function fetchLatestAnnouncementQuery(activeOnly: boolean) {
  try {
    const supabase = await createSupabaseServerClient();
    let query = supabase
      .from("announcements")
      .select("id, title, body, active, updated_at, created_at")
      .order("updated_at", { ascending: false })
      .limit(1);

    if (activeOnly) {
      query = query.eq("active", true);
    }

    const result = await query.maybeSingle();

    // Announcements are optional for the dashboard shell. If the table,
    // policies, or feature wiring are not available yet, fail closed and
    // keep the rest of the app interactive without noisy overlays.
    if (result.error) {
      return null;
    }

    return (result.data as AnnouncementSummary | null) ?? null;
  } catch {
    return null;
  }
}

export async function getActiveAnnouncement() {
  return fetchLatestAnnouncementQuery(true);
}

export async function getLatestAnnouncement() {
  return fetchLatestAnnouncementQuery(false);
}
