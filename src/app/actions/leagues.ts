"use server";

import { revalidatePath } from "next/cache";

import { requireEditor } from "@/lib/auth";
import { createLeague, renameLeague, type LeagueResult } from "@/lib/leagues/leagues";
import { ensureErrorMessage } from "@/lib/utils";

export type LeagueActionResult =
  | { ok: true; name: string }
  | { ok: false; error: string };

async function runLeagueWrite(
  write: () => Promise<LeagueResult>,
  failure: string,
): Promise<LeagueActionResult> {
  try {
    await requireEditor();
    const result = await write();

    if (!result.ok) {
      return result;
    }

    revalidatePath("/teams");
    return { ok: true, name: result.league.name };
  } catch (error) {
    console.error(`[leagues] ${failure}`, error);
    return { ok: false, error: ensureErrorMessage(error) };
  }
}

export async function createLeagueAction({
  name,
}: {
  name: string;
}): Promise<LeagueActionResult> {
  return runLeagueWrite(() => createLeague(name), "failed to create league");
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
  );
}
