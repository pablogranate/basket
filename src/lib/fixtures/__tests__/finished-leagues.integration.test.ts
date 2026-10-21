import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { db } from "@/lib/db/client";
import {
  finishLeague,
  listFinishedLeagues,
  parseFinishedLeagueLabel,
  reopenLeague,
} from "@/lib/fixtures/finished-leagues";
import { seedActor, testSql, truncateAll } from "@/test/integration/db";

describe("ligas terminadas (integration)", () => {
  const sql = testSql();

  beforeAll(async () => {
    await sql`SELECT 1`;
  });

  afterAll(async () => {
    await sql.end();
  });

  beforeEach(async () => {
    await truncateAll(sql);
  });

  async function auditRows() {
    return sql<{ action: string; changedBy: string | null; before: unknown; after: unknown }[]>`
      SELECT action, changed_by AS "changedBy", before, after FROM audit_log
      WHERE table_name = 'fixture_finished_leagues' ORDER BY id`;
  }

  it("shares one list across viewers, in the order leagues finished", async () => {
    const { ctx: first } = await seedActor(sql);
    const { ctx: second } = await seedActor(sql, { role: "editor" });

    await finishLeague(db, { label: "Copa del Rey", actor: first });
    const finished = await finishLeague(db, { label: "LUB", actor: second });

    expect(finished).toEqual(["Copa del Rey", "LUB"]);
    expect(await listFinishedLeagues(db)).toEqual(["Copa del Rey", "LUB"]);
  });

  it("records who finished and who reopened a league", async () => {
    const { profileId: finisher, ctx: finisherCtx } = await seedActor(sql);
    const { profileId: reopener, ctx: reopenerCtx } = await seedActor(sql, { role: "editor" });

    await finishLeague(db, { label: "Endesa", actor: finisherCtx });
    const finished = await reopenLeague(db, { label: "Endesa", actor: reopenerCtx });

    expect(finished).toEqual([]);
    const rows = await auditRows();
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ action: "INSERT", changedBy: finisher, before: null, after: { label: "Endesa" } });
    expect(rows[1]).toMatchObject({
      action: "DELETE",
      changedBy: reopener,
      before: { label: "Endesa", created_by: finisher },
      after: null,
    });
  });

  it("leaves no second record for a league already finished or already reopened", async () => {
    const { ctx } = await seedActor(sql);

    await finishLeague(db, { label: "LBA", actor: ctx });
    await finishLeague(db, { label: "LBA", actor: ctx });
    await reopenLeague(db, { label: "LBA", actor: ctx });
    await reopenLeague(db, { label: "LBA", actor: ctx });

    expect((await auditRows()).map((row) => row.action)).toEqual(["INSERT", "DELETE"]);
  });

  it("takes a trimmed, non-empty, bounded label", () => {
    expect(parseFinishedLeagueLabel("  Nacional ")).toBe("Nacional");
    expect(parseFinishedLeagueLabel("   ")).toBeNull();
    expect(parseFinishedLeagueLabel(3)).toBeNull();
    expect(parseFinishedLeagueLabel("x".repeat(81))).toBeNull();
  });
});
