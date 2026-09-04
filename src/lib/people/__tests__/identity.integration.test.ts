import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { db } from "@/lib/db/client";
import {
  linkProfileToPerson,
  listApprovalCandidates,
  listProfileLinkReview,
  settleApplicant,
} from "@/lib/people/identity";
import { seedActor, testSql, truncateAll } from "@/test/integration/db";

// Ficha ↔ cuenta writes: profile upsert by email, ficha create/reactivate,
// fusión de fichas (repoint + soft-delete, D-14), and the link that never steals.
describe("people identity (integration)", () => {
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

  const base = {
    email: "Nico.Gomez@Example.com",
    fullName: "Nico Gómez",
    phone: "+5491100000001",
    roleId: null,
    accessRole: "collaborator" as const,
    personId: null,
    mergePersonId: null,
  };

  async function seedPerson(
    exec: Sql,
    values: {
      full_name: string;
      email?: string | null;
      profile_id?: string | null;
      active?: boolean;
      deleted_at?: string | null;
    },
  ) {
    const [row] = await exec`
      INSERT INTO people ${exec({
        full_name: values.full_name,
        email: values.email ?? null,
        profile_id: values.profile_id ?? null,
        active: values.active ?? true,
        deleted_at: values.deleted_at ?? null,
      })} RETURNING id`;
    return row.id as string;
  }

  async function seedRole(exec: Sql, name: string) {
    const [row] = await exec`
      INSERT INTO roles ${exec({ name, category: "Produccion", sort_order: 1 })} RETURNING id`;
    return row.id as string;
  }

  async function seedMatch(exec: Sql, ownerId: string | null) {
    const [row] = await exec`
      INSERT INTO matches ${exec({
        home_team: "Local",
        away_team: "Visita",
        kickoff_at: "2026-09-10T20:00:00+00:00",
        owner_id: ownerId,
      })} RETURNING id`;
    return row.id as string;
  }

  it("creates cuenta and ficha for a new applicant, stamped by the actor", async () => {
    const { profileId: actor } = await seedActor(sql);

    const settled = await settleApplicant(db, { ...base, actor: { profileId: actor } });

    const [profile] = await sql`SELECT email, full_name, role, auth_user_id FROM profiles WHERE id = ${settled.profileId}`;
    expect(profile).toEqual({
      email: "nico.gomez@example.com",
      full_name: "Nico Gómez",
      role: "collaborator",
      auth_user_id: null,
    });

    const [person] = await sql`SELECT email, phone, active, profile_id, created_by, updated_by FROM people WHERE id = ${settled.personId}`;
    expect(person).toEqual({
      email: "nico.gomez@example.com",
      phone: "+5491100000001",
      active: true,
      profile_id: settled.profileId,
      created_by: actor,
      updated_by: actor,
    });
  });

  it("reuses an existing cuenta found by email case-insensitively and updates its role", async () => {
    const { profileId: actor } = await seedActor(sql);
    const [existing] = await sql`
      INSERT INTO profiles ${sql({
        id: crypto.randomUUID(),
        email: "nico.gomez@example.com",
        role: "collaborator",
        full_name: "Old Name",
      })} RETURNING id`;

    const settled = await settleApplicant(db, {
      ...base,
      accessRole: "editor",
      actor: { profileId: actor },
    });

    expect(settled.profileId).toBe(existing.id);
    const [profile] = await sql`SELECT role, full_name FROM profiles WHERE id = ${existing.id}`;
    expect(profile).toEqual({ role: "editor", full_name: "Nico Gómez" });
    const [{ count }] = await sql`SELECT count(*)::int AS count FROM profiles`;
    expect(count).toBe(2);
  });

  it("reactivates the ficha the approver picked instead of creating one", async () => {
    const { profileId: actor } = await seedActor(sql);
    const role = await seedRole(sql, "Relator");
    const picked = await seedPerson(sql, {
      full_name: "N. Gomez",
      active: false,
      deleted_at: "2026-01-01T00:00:00+00:00",
    });

    const settled = await settleApplicant(db, {
      ...base,
      roleId: role,
      personId: picked,
      actor: { profileId: actor },
    });

    expect(settled.personId).toBe(picked);
    const [person] = await sql`SELECT full_name, active, deleted_at, role_id, profile_id FROM people WHERE id = ${picked}`;
    expect(person).toEqual({
      full_name: "Nico Gómez",
      active: true,
      deleted_at: null,
      role_id: role,
      profile_id: settled.profileId,
    });
    const [{ count }] = await sql`SELECT count(*)::int AS count FROM people`;
    expect(count).toBe(1);
  });

  it("merges a duplicate ficha: repoints history, keeps unique pairs, soft-deletes (D-14)", async () => {
    const { profileId: actor } = await seedActor(sql);
    const role = await seedRole(sql, "Relator");
    const survivor = await seedPerson(sql, { full_name: "Nico Gómez" });
    const duplicate = await seedPerson(sql, { full_name: "Nicolas Gomez" });

    const ownedMatch = await seedMatch(sql, duplicate);
    const otherMatch = await seedMatch(sql, null);
    await sql`INSERT INTO assignments ${sql({ match_id: otherMatch, role_id: role, person_id: duplicate })}`;
    await sql`INSERT INTO notification_logs ${sql({ match_id: otherMatch, person_id: duplicate, channel: "whatsapp", status: "sent", trigger: "manual" })}`;
    await sql`INSERT INTO person_functions ${sql([
      { person_id: survivor, function_key: "Relator" },
      { person_id: duplicate, function_key: "Relator" },
      { person_id: duplicate, function_key: "Camara" },
    ])}`;

    const settled = await settleApplicant(db, {
      ...base,
      personId: survivor,
      mergePersonId: duplicate,
      actor: { profileId: actor },
    });

    expect(settled.personId).toBe(survivor);

    const [match] = await sql`SELECT owner_id FROM matches WHERE id = ${ownedMatch}`;
    expect(match.owner_id).toBe(survivor);
    const [assignment] = await sql`SELECT person_id FROM assignments WHERE match_id = ${otherMatch}`;
    expect(assignment.person_id).toBe(survivor);
    const [log] = await sql`SELECT person_id FROM notification_logs WHERE match_id = ${otherMatch}`;
    expect(log.person_id).toBe(survivor);

    const functions = await sql`SELECT function_key FROM person_functions WHERE person_id = ${survivor} ORDER BY function_key`;
    expect(functions.map((f) => f.function_key)).toEqual(["Camara", "Relator"]);
    const [{ count: leftovers }] = await sql`SELECT count(*)::int AS count FROM person_functions WHERE person_id = ${duplicate}`;
    expect(leftovers).toBe(0);

    const [old] = await sql`SELECT deleted_at, active, profile_id, updated_by FROM people WHERE id = ${duplicate}`;
    expect(old.deleted_at).not.toBeNull();
    expect(old).toMatchObject({ active: false, profile_id: null, updated_by: actor });
  });

  it("ignores a merge onto itself", async () => {
    const { profileId: actor } = await seedActor(sql);
    const person = await seedPerson(sql, { full_name: "Nico Gómez" });

    await settleApplicant(db, {
      ...base,
      personId: person,
      mergePersonId: person,
      actor: { profileId: actor },
    });

    const [row] = await sql`SELECT deleted_at, active FROM people WHERE id = ${person}`;
    expect(row).toEqual({ deleted_at: null, active: true });
  });

  it("links a cuenta only to an unlinked ficha", async () => {
    const { profileId: actor } = await seedActor(sql);
    const { profileId: other } = await seedActor(sql, { email: "other@basquetpass.tv" });
    const free = await seedPerson(sql, { full_name: "Libre" });
    const taken = await seedPerson(sql, { full_name: "Tomada", profile_id: other });

    await linkProfileToPerson(db, { profileId: actor, personId: free, actor: { profileId: actor } });
    const [row] = await sql`SELECT profile_id, updated_by FROM people WHERE id = ${free}`;
    expect(row).toEqual({ profile_id: actor, updated_by: actor });

    await expect(
      linkProfileToPerson(db, { profileId: actor, personId: taken, actor: { profileId: actor } }),
    ).rejects.toThrow("Esa ficha ya está vinculada a otra cuenta.");
    const [still] = await sql`SELECT profile_id FROM people WHERE id = ${taken}`;
    expect(still.profile_id).toBe(other);
  });

  it("lists approval candidates without soft-deleted fichas", async () => {
    const alive = await seedPerson(sql, { full_name: "Viva", active: false });
    await seedPerson(sql, { full_name: "Borrada", deleted_at: "2026-01-01T00:00:00+00:00" });

    const rows = await listApprovalCandidates(db);
    expect(rows.map((r) => r.id)).toEqual([alive]);
  });

  it("pairs unclaimed cuentas with look-alike unlinked fichas for the link review", async () => {
    const { profileId: linked } = await seedActor(sql, { email: "linked@basquetpass.tv" });
    await seedPerson(sql, { full_name: "Ya Vinculada", profile_id: linked });
    await sql`INSERT INTO profiles ${sql({
      id: crypto.randomUUID(),
      email: "maria.lopez@basquetpass.tv",
      role: "collaborator",
      full_name: "María López",
    })}`;
    await sql`INSERT INTO profiles ${sql({
      id: crypto.randomUUID(),
      email: "solo.admin@basquetpass.tv",
      role: "admin",
      full_name: "Solo Admin",
    })}`;
    const maria = await seedPerson(sql, { full_name: "Maria Lopez" });
    await seedPerson(sql, { full_name: "Otra Persona" });

    const review = await listProfileLinkReview(db);

    expect(review).toHaveLength(1);
    expect(review[0].profile.email).toBe("maria.lopez@basquetpass.tv");
    expect(review[0].candidates.map((c) => c.id)).toEqual([maria]);
  });
});
