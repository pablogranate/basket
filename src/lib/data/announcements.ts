import { desc, eq } from "drizzle-orm";

import type { UserContext } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { announcements } from "@/lib/db/schema";
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
    const rows = await db
      .select({
        id: announcements.id,
        title: announcements.title,
        body: announcements.body,
        active: announcements.active,
        updated_at: announcements.updatedAt,
        created_at: announcements.createdAt,
      })
      .from(announcements)
      .where(activeOnly ? eq(announcements.active, true) : undefined)
      .orderBy(desc(announcements.updatedAt))
      .limit(1);

    // Announcements are optional for the dashboard shell. If the table,
    // policies, or feature wiring are not available yet, fail closed and
    // keep the rest of the app interactive without noisy overlays.
    return (rows[0] as AnnouncementSummary | undefined) ?? null;
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
