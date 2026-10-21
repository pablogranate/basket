import "server-only";

import { asc, eq } from "drizzle-orm";

import type { UserContext } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import type { DbExecutor } from "@/lib/db/client";
import { fixtureFinishedLeagues as finishedLeaguesTable } from "@/lib/db/schema";

// Ligas terminadas on /fixtures: one list every viewer shares, keyed by the
// competition chip label. A finished league only leaves the chip row and the
// "Todas" rows; nothing else reads it. Every change writes an audit_log row.

const TABLE = "fixture_finished_leagues";
const MAX_LABEL_LENGTH = 80;

export function parseFinishedLeagueLabel(value: unknown): string | null {
  const label = typeof value === "string" ? value.trim() : "";

  return label && label.length <= MAX_LABEL_LENGTH ? label : null;
}

export async function listFinishedLeagues(exec: DbExecutor): Promise<string[]> {
  const rows = await exec
    .select({ label: finishedLeaguesTable.label })
    .from(finishedLeaguesTable)
    .orderBy(asc(finishedLeaguesTable.createdAt), asc(finishedLeaguesTable.label));

  return rows.map((row) => row.label);
}

// Idempotent: a league someone else already finished stays as it was and
// leaves no second record.
export async function finishLeague(
  exec: DbExecutor,
  input: { label: string; actor: UserContext },
): Promise<string[]> {
  const [inserted] = await exec
    .insert(finishedLeaguesTable)
    .values({ label: input.label, createdBy: input.actor.profileId })
    .onConflictDoNothing()
    .returning({ id: finishedLeaguesTable.id });

  if (inserted) {
    await writeAudit(input.actor, {
      table: TABLE,
      recordId: inserted.id,
      action: "INSERT",
      before: null,
      after: { label: input.label },
    });
  }

  return listFinishedLeagues(exec);
}

export async function reopenLeague(
  exec: DbExecutor,
  input: { label: string; actor: UserContext },
): Promise<string[]> {
  const [deleted] = await exec
    .delete(finishedLeaguesTable)
    .where(eq(finishedLeaguesTable.label, input.label))
    .returning({
      id: finishedLeaguesTable.id,
      createdAt: finishedLeaguesTable.createdAt,
      createdBy: finishedLeaguesTable.createdBy,
    });

  if (deleted) {
    await writeAudit(input.actor, {
      table: TABLE,
      recordId: deleted.id,
      action: "DELETE",
      before: { label: input.label, created_at: deleted.createdAt, created_by: deleted.createdBy },
      after: null,
    });
  }

  return listFinishedLeagues(exec);
}
