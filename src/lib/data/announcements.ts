import type { UserContext } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AnnouncementRow } from "@/lib/database.types";

export type AnnouncementSummary = Pick<
  AnnouncementRow,
  "id" | "title" | "body" | "active" | "updated_at" | "created_at"
>;

// Cross-request memo: the dashboard layout reads the active announcement on
// every navigation, but announcements only change through
// saveAnnouncementAction (which calls clearAnnouncementCache). The TTL bounds
// staleness from out-of-band edits. Assumes a single Node process (pm2 fork
// mode), same as the profile cache in auth.ts.
const ANNOUNCEMENT_CACHE_TTL_MS = 60_000;
const announcementCache = new Map<
  string,
  { value: AnnouncementSummary | null; expiresAt: number }
>();

export function clearAnnouncementCache() {
  announcementCache.clear();
}

async function fetchLatestAnnouncementQuery(activeOnly: boolean) {
  const cacheKey = activeOnly ? "active" : "latest";
  const cached = announcementCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const value = await loadLatestAnnouncement(activeOnly);
  announcementCache.set(cacheKey, {
    value,
    expiresAt: Date.now() + ANNOUNCEMENT_CACHE_TTL_MS,
  });

  return value;
}

async function loadLatestAnnouncement(activeOnly: boolean) {
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

export async function getActiveAnnouncement(ctx: UserContext | null) {
  void ctx;
  return fetchLatestAnnouncementQuery(true);
}

export async function getLatestAnnouncement(ctx: UserContext) {
  void ctx;
  return fetchLatestAnnouncementQuery(false);
}
