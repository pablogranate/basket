"use server";

import { failedActionResult } from "@/app/actions/helpers";
import { requireCapability } from "@/lib/auth-access";
import { db } from "@/lib/db/client";
import {
  finishLeague,
  parseFinishedLeagueLabel,
  reopenLeague,
} from "@/lib/fixtures/finished-leagues";

export type FinishedLeaguesResult =
  | { ok: true; finished: string[] }
  | { ok: false; error: string };

// Called from the /fixtures chip drag, which keeps its own optimistic state:
// these answer with the shared list instead of redirecting with a notice.
export async function finishLeagueAction(label: string): Promise<FinishedLeaguesResult> {
  return changeFinishedLeagues(label, finishLeague, "finishLeagueAction");
}

export async function reopenLeagueAction(label: string): Promise<FinishedLeaguesResult> {
  return changeFinishedLeagues(label, reopenLeague, "reopenLeagueAction");
}

async function changeFinishedLeagues(
  value: unknown,
  change: typeof finishLeague,
  route: string,
): Promise<FinishedLeaguesResult> {
  let userId: string | null = null;

  try {
    const actor = await requireCapability("dashboard.full");
    userId = actor.userId;
    const label = parseFinishedLeagueLabel(value);

    if (!label) {
      return { ok: false, error: "Elegí una liga." };
    }

    return { ok: true, finished: await change(db, { label, actor }) };
  } catch (error) {
    return failedActionResult("[fixtures] failed to change finished leagues", error, {
      route,
      userId,
    });
  }
}
