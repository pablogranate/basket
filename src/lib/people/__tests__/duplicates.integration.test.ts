import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { db } from "@/lib/db/client";
import {
  dismissDuplicatePair,
  getDuplicateReview,
  restoreDuplicatePair,
} from "@/lib/people/duplicates";
import { seedActor, testSql, truncateAll } from "@/test/integration/db";

describe("duplicate fichas review (integration)", () => {
  const sql = testSql();
  type Sql = typeof sql;

  beforeAll(async () => {
    await sql`SELECT 1`;
  });

  afterAll(async () => {
    await sql.end();
  });

  beforeEach(async () => {
    await truncateAll(sql);
  });

  async function seedPerson(
    exec: Sql,
    values: { full_name: string; profile_id?: string | null; deleted_at?: string | null },
  ) {
    const [row] = await exec`
      INSERT INTO people ${exec({
        full_name: values.full_name,
        profile_id: values.profile_id ?? null,
        deleted_at: values.deleted_at ?? null,
      })} RETURNING id`;
    return row.id as string;
  }

  async function seedAssignment(exec: Sql, personId: string) {
    const [role] = await exec`
      INSERT INTO roles ${exec({ name: "Camara 1", category: "Produccion", sort_order: 1 })} RETURNING id`;
    const [match] = await exec`
      INSERT INTO matches ${exec({
        home_team: "Local",
        away_team: "Visita",
        kickoff_at: "2026-09-10T20:00:00+00:00",
      })} RETURNING id`;
    await exec`INSERT INTO assignments ${exec({ match_id: match.id, role_id: role.id, person_id: personId })}`;
  }

  it("pairs a ficha with a cuenta with look-alike fichas without one, with their partidos", async () => {
    const { profileId: cuenta } = await seedActor(sql, { email: "contacto.heavens@gmail.com" });
    const linked = await seedPerson(sql, { full_name: "Nino Tolaba", profile_id: cuenta });
    const grilla = await seedPerson(sql, { full_name: "Rene Nino Tolaba" });
    await seedPerson(sql, { full_name: "Otra Persona" });
    await seedPerson(sql, { full_name: "Rene Tolaba Viejo", deleted_at: "2026-01-01T00:00:00+00:00" });
    await seedAssignment(sql, grilla);

    const review = await getDuplicateReview(db);

    expect(review.dismissed).toEqual([]);
    expect(review.pending).toHaveLength(1);
    expect(review.pending[0].survivor).toMatchObject({ id: linked, assignmentCount: 0 });
    expect(review.pending[0].duplicates).toEqual([
      expect.objectContaining({ id: grilla, assignmentCount: 1 }),
    ]);
  });

  it("moves a dismissed pair out of the review until it is restored", async () => {
    const { profileId: actor } = await seedActor(sql);
    const { profileId: cuenta } = await seedActor(sql, { email: "juan@basquetpass.tv" });
    const juan = await seedPerson(sql, { full_name: "Juan Perez", profile_id: cuenta });
    const otro = await seedPerson(sql, { full_name: "Juan Pablo Perez" });

    await dismissDuplicatePair(db, { personId: otro, otherPersonId: juan, actor: { profileId: actor } });
    await dismissDuplicatePair(db, { personId: juan, otherPersonId: otro, actor: { profileId: actor } });

    const dismissed = await getDuplicateReview(db);
    expect(dismissed.pending).toEqual([]);
    expect(dismissed.dismissed.map(({ person, other }) => [person.id, other.id].sort())).toEqual([
      [juan, otro].sort(),
    ]);

    await restoreDuplicatePair(db, { personId: otro, otherPersonId: juan });

    const restored = await getDuplicateReview(db);
    expect(restored.pending.map((row) => row.survivor.id)).toEqual([juan]);
    expect(restored.dismissed).toEqual([]);
  });
});
