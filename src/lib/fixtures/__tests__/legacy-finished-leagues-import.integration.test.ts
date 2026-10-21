import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { db } from "@/lib/db/client";
import { listFinishedLeagues, reopenLeague } from "@/lib/fixtures/finished-leagues";
import { importLegacyFinishedLeagues } from "@/lib/fixtures/legacy-finished-leagues-import";
import { seedActor, testSql, truncateAll } from "@/test/integration/db";

// TEMPORARY — deleted with legacy-finished-leagues-import.ts.
describe("legacy finished leagues import (integration)", () => {
  const sql = testSql();
  const cookie = encodeURIComponent(JSON.stringify(["Copa del Rey", "LUB"]));

  beforeAll(async () => {
    await sql`SELECT 1`;
  });

  afterAll(async () => {
    await sql.end();
  });

  beforeEach(async () => {
    await truncateAll(sql);
  });

  it("imports Federico's folder once, under his name", async () => {
    const { profileId, ctx } = await seedActor(sql, { email: "federico.juarez@basquetpass.tv" });

    await importLegacyFinishedLeagues(db, { actor: ctx, cookie });
    expect(await listFinishedLeagues(db)).toEqual(["Copa del Rey", "LUB"]);

    await reopenLeague(db, { label: "LUB", actor: ctx });
    await importLegacyFinishedLeagues(db, { actor: ctx, cookie });
    expect(await listFinishedLeagues(db)).toEqual(["Copa del Rey"]);

    const rows = await sql`SELECT changed_by FROM audit_log WHERE table_name = 'fixture_finished_leagues'`;
    expect(rows.every((row) => row.changed_by === profileId)).toBe(true);
  });

  it("ignores anyone else's cookie", async () => {
    const { ctx } = await seedActor(sql);

    await importLegacyFinishedLeagues(db, { actor: ctx, cookie });
    expect(await listFinishedLeagues(db)).toEqual([]);
  });
});
