import "server-only";

import { and, count, eq } from "drizzle-orm";

import type { UserContext } from "@/lib/auth";
import type { DbExecutor } from "@/lib/db/client";
import { auditLog as auditLogTable } from "@/lib/db/schema";
import { finishLeague, parseFinishedLeagueLabel } from "@/lib/fixtures/finished-leagues";

// TEMPORARY — delete this file and its call in the /fixtures page once Federico
// Juarez's folder is in the shared list. Ligas terminadas used to live in each
// browser's cookie; the shared list starts from his. Runs on his visits until
// he has a record on the table, so it imports once and never undoes a reopen.

export const LEGACY_FINISHED_LEAGUES_COOKIE = "fixtures-archived";
const SOURCE_EMAIL = "federico.juarez@basquetpass.tv";

export async function importLegacyFinishedLeagues(
  exec: DbExecutor,
  input: { actor: UserContext; cookie: string | undefined },
): Promise<void> {
  if (input.actor.email?.toLowerCase() !== SOURCE_EMAIL || !input.actor.profileId || !input.cookie) {
    return;
  }

  const labels = parseLegacyCookie(input.cookie);
  if (!labels.length || (await hasFinishedLeagueRecord(exec, input.actor.profileId))) {
    return;
  }

  for (const label of labels) {
    await finishLeague(exec, { label, actor: input.actor });
  }
  console.info("[fixtures] imported legacy finished leagues", { labels });
}

async function hasFinishedLeagueRecord(exec: DbExecutor, profileId: string) {
  const [row] = await exec
    .select({ value: count() })
    .from(auditLogTable)
    .where(and(eq(auditLogTable.tableName, "fixture_finished_leagues"), eq(auditLogTable.changedBy, profileId)));

  return (row?.value ?? 0) > 0;
}

function parseLegacyCookie(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(safeDecode(value));
    return Array.isArray(parsed)
      ? parsed.flatMap((item) => parseFinishedLeagueLabel(item) ?? [])
      : [];
  } catch {
    return [];
  }
}

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
