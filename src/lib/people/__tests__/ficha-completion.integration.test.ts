import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { db } from "@/lib/db/client";
import { completeOwnFicha } from "@/lib/people/identity";
import { testSql, truncateAll } from "@/test/integration/db";

// The portal user completes their own ficha (basket#202): exact email links,
// no match creates, a name-only match writes nothing (D-08).
describe("completeOwnFicha (integration)", () => {
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

  async function seedProfile(exec: Sql, email: string, fullName: string) {
    const id = globalThis.crypto.randomUUID();
    await exec`
      INSERT INTO profiles ${exec({ id, email, full_name: fullName, auth_user_id: `identity-${id}` })}`;
    return id;
  }

  async function seedPerson(
    exec: Sql,
    values: { full_name: string; email?: string | null; notes?: string | null; profile_id?: string | null },
  ) {
    const [row] = await exec`
      INSERT INTO people ${exec({
        full_name: values.full_name,
        email: values.email ?? null,
        notes: values.notes ?? null,
        profile_id: values.profile_id ?? null,
        active: false,
      })} RETURNING id`;
    return row.id as string;
  }

  function input(profileId: string, overrides: Partial<Parameters<typeof completeOwnFicha>[1]> = {}) {
    return {
      profileId,
      email: "ana.perez@example.com",
      fullName: "Ana Pérez",
      phone: "+5491122334455",
      roleId: null,
      ciudad: "Rosario, Argentina",
      actor: { profileId },
      ...overrides,
    };
  }

  it("creates a ficha linked to the Cuenta when nothing matches", async () => {
    const profileId = await seedProfile(sql, "ana.perez@example.com", "Ana Pérez");

    const result = await db.transaction((tx) => completeOwnFicha(tx, input(profileId)));

    expect(result.kind).toBe("created");
    const [person] = await sql`
      SELECT full_name, email, phone, notes, active, profile_id FROM people WHERE profile_id = ${profileId}`;
    expect(person).toEqual({
      full_name: "Ana Pérez",
      email: "ana.perez@example.com",
      phone: "+5491122334455",
      notes: "Ciudad: Rosario, Argentina",
      active: true,
      profile_id: profileId,
    });
  });

  it("links the unlinked ficha with the exact email, keeping its name and notes", async () => {
    const profileId = await seedProfile(sql, "ana.perez@example.com", "Ana Pérez");
    const personId = await seedPerson(sql, {
      full_name: "Ana P.",
      email: "Ana.Perez@Example.com",
      notes: "Ciudad: Córdoba\n\nCubre la Liga",
    });

    const result = await db.transaction((tx) => completeOwnFicha(tx, input(profileId)));

    expect(result).toEqual({ kind: "linked", personId });
    const [person] = await sql`
      SELECT full_name, phone, notes, active, profile_id FROM people WHERE id = ${personId}`;
    expect(person).toEqual({
      full_name: "Ana P.",
      phone: "+5491122334455",
      notes: "Ciudad: Rosario, Argentina\n\nCubre la Liga",
      active: true,
      profile_id: profileId,
    });
  });

  it("writes nothing on a name-only match: the Cuenta waits for an admin", async () => {
    const profileId = await seedProfile(sql, "ana.perez@example.com", "Ana Pérez");
    await seedPerson(sql, { full_name: "Ana Pérez", email: "otra@example.com" });

    const result = await db.transaction((tx) => completeOwnFicha(tx, input(profileId)));

    expect(result).toEqual({ kind: "review" });
    const linked = await sql`SELECT id FROM people WHERE profile_id = ${profileId}`;
    expect(linked).toHaveLength(0);
    const all = await sql`SELECT id FROM people`;
    expect(all).toHaveLength(1);
  });

  it("refuses a second ficha for a Cuenta that already has one", async () => {
    const profileId = await seedProfile(sql, "ana.perez@example.com", "Ana Pérez");
    await db.transaction((tx) => completeOwnFicha(tx, input(profileId)));

    await expect(
      db.transaction((tx) => completeOwnFicha(tx, input(profileId))),
    ).rejects.toThrow("Tu ficha ya está completa.");
    const rows = await sql`SELECT id FROM people WHERE profile_id = ${profileId}`;
    expect(rows).toHaveLength(1);
  });

  it("never takes over a ficha another Cuenta already holds", async () => {
    const owner = await seedProfile(sql, "owner@example.com", "Dueño");
    const profileId = await seedProfile(sql, "ana.perez@example.com", "Ana Pérez");
    await seedPerson(sql, { full_name: "Ana", email: "ana.perez@example.com", profile_id: owner });

    await expect(
      db.transaction((tx) => completeOwnFicha(tx, input(profileId))),
    ).rejects.toThrow("La ficha con tu correo ya está vinculada a otra cuenta.");
  });
});
