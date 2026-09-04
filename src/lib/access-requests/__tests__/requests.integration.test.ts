import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  attachAccessRequestIdentity,
  claimAccessRequest,
  getOwnAccessRequest,
  listDecidedAccessRequests,
  listPendingAccessRequests,
  submitAccessRequest,
} from "@/lib/access-requests/requests";
import { db } from "@/lib/db/client";
import { seedActor, testSql, truncateAll } from "@/test/integration/db";

// The lifecycle rules (one pending per email/account, resolved never blocks,
// first decision wins) are enforced by partial unique indexes and a
// compare-and-set UPDATE. Only a real Postgres can prove them.
describe("access-request lifecycle (integration)", () => {
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

  const applicant = {
    authUserId: "auth-user-1",
    email: "Ana.Perez@Example.com",
    fullName: "Ana Pérez",
    phone: "+5491100000000",
    funcion: "Relator",
    ciudad: "Argentina · Buenos Aires",
    mensaje: null,
  };

  it("submits a pending request with the email lowercased", async () => {
    const { id, email } = await submitAccessRequest(db, applicant);

    expect(email).toBe("ana.perez@example.com");
    const [row] = await sql`SELECT email, status FROM access_requests WHERE id = ${id}`;
    expect(row).toMatchObject({ email: "ana.perez@example.com", status: "pendiente" });
  });

  it("refuses a second pending request for the same email, in any casing", async () => {
    await submitAccessRequest(db, applicant);

    await expect(
      submitAccessRequest(db, {
        ...applicant,
        authUserId: "auth-user-2",
        email: "ANA.PEREZ@example.com",
      }),
    ).rejects.toThrow("Ya tenés una solicitud pendiente.");
  });

  it("lets a resolved request be followed by a new one (never a lockout)", async () => {
    const { actor } = await seedApprover();
    const first = await submitAccessRequest(db, applicant);
    await claimAccessRequest(db, {
      id: first.id,
      outcome: "rechazada",
      actorProfileId: actor,
    });

    const second = await submitAccessRequest(db, applicant);
    expect(second.id).not.toBe(first.id);

    const own = await getOwnAccessRequest(db, { authUserId: applicant.authUserId });
    expect(own.pending).toBe(true);
    expect(own.request?.id).toBe(second.id);
  });

  it("reports a resolved request as not pending", async () => {
    const { actor } = await seedApprover();
    const { id } = await submitAccessRequest(db, applicant);
    await claimAccessRequest(db, { id, outcome: "aprobada", actorProfileId: actor });

    const own = await getOwnAccessRequest(db, { authUserId: applicant.authUserId });
    expect(own.pending).toBe(false);
    expect(own.request?.status).toBe("aprobada");

    const nobody = await getOwnAccessRequest(db, { authUserId: "unknown" });
    expect(nobody).toEqual({ request: null, pending: false });
  });

  it("claims once: the second decision is told the request is already resolved", async () => {
    const { actor } = await seedApprover();
    const { id } = await submitAccessRequest(db, applicant);

    const won = await claimAccessRequest(db, {
      id,
      outcome: "aprobada",
      actorProfileId: actor,
    });
    expect(won).toEqual({ id, email: "ana.perez@example.com" });

    await expect(
      claimAccessRequest(db, { id, outcome: "rechazada", actorProfileId: actor }),
    ).rejects.toThrow("Esta solicitud ya fue resuelta.");

    const [row] = await sql`SELECT status, decided_by FROM access_requests WHERE id = ${id}`;
    expect(row).toMatchObject({ status: "aprobada", decided_by: actor });
  });

  it("serializes two concurrent claims: exactly one wins (D-06)", async () => {
    const { actor } = await seedApprover();
    const { id } = await submitAccessRequest(db, applicant);

    const results = await Promise.allSettled([
      db.transaction((tx) =>
        claimAccessRequest(tx, { id, outcome: "aprobada", actorProfileId: actor }),
      ),
      db.transaction((tx) =>
        claimAccessRequest(tx, { id, outcome: "rechazada", actorProfileId: actor }),
      ),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason.message).toBe(
      "Esta solicitud ya fue resuelta.",
    );
  });

  it("throws for an unknown request id", async () => {
    await expect(
      claimAccessRequest(db, {
        id: "00000000-0000-0000-0000-000000000000",
        outcome: "aprobada",
        actorProfileId: null,
      }),
    ).rejects.toThrow("Esta solicitud ya fue resuelta.");
  });

  it("lists pending and decided separately, decided with the approver's name", async () => {
    const { actor } = await seedApprover();
    const a = await submitAccessRequest(db, applicant);
    const b = await submitAccessRequest(db, {
      ...applicant,
      authUserId: "auth-user-2",
      email: "b@example.com",
    });
    await claimAccessRequest(db, { id: a.id, outcome: "rechazada", actorProfileId: actor });

    const pending = await listPendingAccessRequests(db);
    const decided = await listDecidedAccessRequests(db);

    expect(pending.map((r) => r.id)).toEqual([b.id]);
    expect(decided).toHaveLength(1);
    expect(decided[0]).toMatchObject({
      id: a.id,
      status: "rechazada",
      decided_by_name: "Test Actor",
    });
  });

  it("attaches the settled identity to the request", async () => {
    const { actor } = await seedApprover();
    const { id } = await submitAccessRequest(db, applicant);
    const [person] = await sql`
      INSERT INTO people ${sql({ full_name: "Ana Pérez" })} RETURNING id`;

    await attachAccessRequestIdentity(db, {
      id,
      profileId: actor!,
      personId: person.id,
    });

    const [row] = await sql`SELECT profile_id, person_id FROM access_requests WHERE id = ${id}`;
    expect(row).toEqual({ profile_id: actor, person_id: person.id });
  });

  async function seedApprover() {
    const { profileId } = await seedActor(sql);
    return { actor: profileId as string | null };
  }
});
