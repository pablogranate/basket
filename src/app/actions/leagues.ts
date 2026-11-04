"use server";

import { revalidatePath } from "next/cache";

import { failedActionResult } from "@/app/actions/helpers";
import { requireEditor } from "@/lib/auth";
import { createLeague, renameLeague, type LeagueResult } from "@/lib/leagues/leagues";

export type LeagueActionResult =
  | { ok: true; name: string }
  | { ok: false; error: string };

async function runLeagueWrite(
  write: () => Promise<LeagueResult>,
  failure: string,
  route: string,
): Promise<LeagueActionResult> {
  let userId: string | null = null;

  try {
    userId = (await requireEditor()).userId;
    const result = await write();

    if (!result.ok) {
      return result;
    }

    revalidatePath("/teams");
    return { ok: true, name: result.league.name };
  } catch (error) {
    return failedActionResult(`[leagues] ${failure}`, error, { route, userId });
  }
}

export async function createLeagueAction({
  name,
}: {
  name: string;
}): Promise<LeagueActionResult> {
  return runLeagueWrite(
    () => createLeague(name),
    "failed to create league",
    "createLeagueAction",
  );
}

export async function renameLeagueAction({
  currentName,
  name,
}: {
  currentName: string;
  name: string;
}): Promise<LeagueActionResult> {
  return runLeagueWrite(
    () => renameLeague({ currentName, name }),
    "failed to rename league",
    "renameLeagueAction",
  );
}
