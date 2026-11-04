"use server";

import { withActionLog } from "basket-tv-telemetry/next";
import { revalidatePath } from "next/cache";

import { failedActionResult } from "@/app/actions/helpers";
import { requireEditor } from "@/lib/auth";
import { createLeague, renameLeague, type LeagueResult } from "@/lib/leagues/leagues";

export type LeagueActionResult =
  | { ok: true; name: string }
  | { ok: false; error: string };

async function runLeagueWrite(
  write: () => Promise<LeagueResult>,
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
    return failedActionResult(error);
  }
}

export const createLeagueAction = withActionLog("createLeagueAction", async ({
  name,
}: {
  name: string;
}): Promise<LeagueActionResult> => {
  return runLeagueWrite(() => createLeague(name));
});

export const renameLeagueAction = withActionLog("renameLeagueAction", async ({
  currentName,
  name,
}: {
  currentName: string;
  name: string;
}): Promise<LeagueActionResult> => {
  return runLeagueWrite(() => renameLeague({ currentName, name }));
});
