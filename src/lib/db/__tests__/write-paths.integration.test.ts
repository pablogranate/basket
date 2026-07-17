import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { stampInsert, stampUpdate, writeAudit } from "@/lib/audit";
import { db } from "@/lib/db/client";
import { appSettings, assignments, matches, people } from "@/lib/db/schema";
import { seedActor, testSql, truncateAll } from "@/test/integration/db";

// Exercises the REAL Drizzle client + stamp/audit helpers against a live
// Postgres. Covers the write paths the read-parity harness cannot (PRD §8 risk:
// "No parity for writes") — actor stamping, updated_at ownership post-trigger,
// audit rows, secret redaction, and the timestamptz ISO codec.
describe("data-layer write paths (integration)", () => {
  const sql = testSql();

  beforeAll(async () => {
    // Prove the connection is live before any assertion runs.
    await sql`SELECT 1`;
  });

  afterAll(async () => {
    await sql.end();
  });

  beforeEach(async () => {
    await truncateAll(sql);
  });

  describe("writeAudit", () => {
    it("writes a matches audit row with match_id = record id and changed_by = actor", async () => {
      const { ctx, profileId } = await seedActor(sql);
      // audit_log.match_id FKs matches.id (constraint survives the trigger drop),
      // so the audited record must be a real match — mirrors the real write flow.
      const [match] = await sql`
        INSERT INTO matches ${sql({ home_team: "Local", away_team: "Visita", kickoff_at: "2026-05-01T18:45:00+00:00" })}
        RETURNING id`;

      await writeAudit(ctx, {
        table: "matches",
        recordId: match.id,
        action: "INSERT",
        before: null,
        after: { home_team: "Local", away_team: "Visita" },
      });

      const [row] = await sql`SELECT * FROM audit_log WHERE record_id = ${match.id}`;
      expect(row.table_name).toBe("matches");
      expect(row.action).toBe("INSERT");
      expect(row.changed_by).toBe(profileId);
      expect(row.match_id).toBe(match.id); // matches rule: match_id = the record
      expect(row.after).toEqual({ home_team: "Local", away_team: "Visita" });
    });

    it("derives assignments match_id from the row when not passed explicitly", async () => {
      const { ctx } = await seedActor(sql);
      const [match] = await sql`
        INSERT INTO matches ${sql({ home_team: "H", away_team: "A", kickoff_at: "2026-05-01T18:45:00+00:00" })}
        RETURNING id`;
      const recordId = crypto.randomUUID(); // the assignment id (record_id has no FK)

      await writeAudit(ctx, {
        table: "assignments",
        recordId,
        action: "UPDATE",
        before: { person_id: null },
        after: { match_id: match.id, person_id: crypto.randomUUID() },
      });

      const [row] = await sql`SELECT match_id FROM audit_log WHERE record_id = ${recordId}`;
      expect(row.match_id).toBe(match.id);
    });

    it("redacts secret_value in app_settings audit payloads", async () => {
      const { ctx } = await seedActor(sql);
      const recordId = crypto.randomUUID();

      await writeAudit(ctx, {
        table: "app_settings",
        recordId,
        action: "UPDATE",
        before: { setting_key: "gemini", secret_value: "old-key" },
        after: { setting_key: "gemini", secret_value: "new-key" },
      });

      const [row] = await sql`SELECT before, after FROM audit_log WHERE record_id = ${recordId}`;
      expect(row.before.secret_value).toBe("[redacted]");
      expect(row.after.secret_value).toBe("[redacted]");
      expect(row.after.setting_key).toBe("gemini");
    });
  });

  describe("stampInsert / stampUpdate", () => {
    it("stamps actor + timestamps on insert (created_at == updated_at)", async () => {
      const { ctx, profileId } = await seedActor(sql);

      const values = stampInsert(ctx, { full_name: "Persona Uno", active: true });
      const [row] = await db
        .insert(people)
        .values({
          fullName: values.full_name as string,
          active: values.active as boolean,
          createdBy: values.created_by,
          updatedBy: values.updated_by,
          createdAt: values.created_at,
          updatedAt: values.updated_at,
        })
        .returning();

      expect(row.createdBy).toBe(profileId);
      expect(row.updatedBy).toBe(profileId);
      expect(row.createdAt).toBe(row.updatedAt);
    });

    it("refreshes updated_by/updated_at on update, preserving created_by/created_at", async () => {
      const author = await seedActor(sql);
      const editor = await seedActor(sql);

      const inserted = stampInsert(author.ctx, { full_name: "Persona Dos", active: true });
      const [created] = await db
        .insert(people)
        .values({
          fullName: inserted.full_name as string,
          active: inserted.active as boolean,
          createdBy: inserted.created_by,
          updatedBy: inserted.updated_by,
          createdAt: inserted.created_at,
          updatedAt: inserted.updated_at,
        })
        .returning();

      const patch = stampUpdate(editor.ctx, { phone: "+541100000000" });
      await db
        .update(people)
        .set({
          phone: patch.phone as string,
          updatedBy: patch.updated_by,
          updatedAt: patch.updated_at,
        })
        .where(eq(people.id, created.id));

      const [after] = await db.select().from(people).where(eq(people.id, created.id));
      expect(after.createdBy).toBe(author.profileId); // preserved
      expect(after.createdAt).toBe(created.createdAt); // preserved
      expect(after.updatedBy).toBe(editor.profileId); // refreshed
      expect(Date.parse(after.updatedAt)).toBeGreaterThanOrEqual(Date.parse(created.createdAt));
    });
  });

  describe("timestamptz codec", () => {
    it("round-trips ISO 8601 through the custom column type", async () => {
      const { ctx } = await seedActor(sql);
      const stamped = stampInsert(ctx, {
        home_team: "H",
        away_team: "A",
        kickoff_at: "2026-05-01T18:45:00+00:00",
      });

      const [row] = await db
        .insert(matches)
        .values({
          homeTeam: stamped.home_team as string,
          awayTeam: stamped.away_team as string,
          kickoffAt: stamped.kickoff_at as string,
          createdBy: stamped.created_by,
          updatedBy: stamped.updated_by,
          createdAt: stamped.created_at,
          updatedAt: stamped.updated_at,
        })
        .returning();

      // Not "2026-05-01 18:45:00+00" (raw driver form) — the codec normalizes.
      expect(row.kickoffAt).toBe("2026-05-01T18:45:00+00:00");
    });
  });

  describe("assignment upsert (grid-sync conflict path)", () => {
    it("DO UPDATE swaps person and app-owns the updated_at bump", async () => {
      const { ctx } = await seedActor(sql);
      const [role] = await sql`INSERT INTO roles ${sql({ name: "Camara 1" })} RETURNING id`;
      const [p1] = await sql`INSERT INTO people ${sql({ full_name: "P1", active: true })} RETURNING id`;
      const [p2] = await sql`INSERT INTO people ${sql({ full_name: "P2", active: true })} RETURNING id`;
      const stampedMatch = stampInsert(ctx, {
        home_team: "H",
        away_team: "A",
        kickoff_at: "2026-06-01T20:00:00+00:00",
      });
      const [match] = await db
        .insert(matches)
        .values({
          homeTeam: stampedMatch.home_team as string,
          awayTeam: stampedMatch.away_team as string,
          kickoffAt: stampedMatch.kickoff_at as string,
        })
        .returning();

      await db
        .insert(assignments)
        .values({ matchId: match.id, roleId: role.id, personId: p1.id, confirmed: false });

      const bumpedAt = "2026-06-02T10:00:00+00:00";
      await db
        .insert(assignments)
        .values({ matchId: match.id, roleId: role.id, personId: p2.id, confirmed: false })
        .onConflictDoUpdate({
          target: [assignments.matchId, assignments.roleId],
          set: { personId: p2.id, updatedAt: bumpedAt },
        });

      const rows = await db.select().from(assignments).where(eq(assignments.matchId, match.id));
      expect(rows).toHaveLength(1); // upsert, not a second row
      expect(rows[0].personId).toBe(p2.id);
      expect(rows[0].updatedAt).toBe(bumpedAt);
    });
  });

  describe("guardrails", () => {
    it("uses the app db and the raw test sql against the same database", async () => {
      const { ctx, profileId } = await seedActor(sql);
      const stamped = stampInsert(ctx, { setting_key: "probe", public_value: "v" });
      await db.insert(appSettings).values({
        settingKey: stamped.setting_key as string,
        publicValue: stamped.public_value as string,
        createdBy: stamped.created_by,
        updatedBy: stamped.updated_by,
        createdAt: stamped.created_at,
        updatedAt: stamped.updated_at,
      });
      const [row] = await sql`SELECT public_value, created_by FROM app_settings WHERE setting_key = 'probe'`;
      expect(row.public_value).toBe("v");
      expect(row.created_by).toBe(profileId); // app db write visible to raw test sql
    });
  });
});
