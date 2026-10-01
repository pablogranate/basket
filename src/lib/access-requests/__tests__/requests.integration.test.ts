import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  attachAccessRequestPerson,
  claimAccessRequest,
  getOwnAccessRequest,
  listDecidedAccessRequests,
  listPendingAccessRequests,
  submitAccessRequest,
} from "@/lib/access-requests/requests";
import { authDb } from "@/lib/db/auth-client";
import { seedAuthUser, testSql, truncateAll } from "@/test/integration/db";

// The lifecycle rules (one pending per app and email/identity, resolved never
// blocks, first decision wins) are enforced by partial unique indexes and a
// compare-and-set UPDATE on auth_access_request. Only a real Postgres can
// prove them.
describe("access-request lifecycle (integration)", () => {
  const sql = testSql();
  let applicantId: string;
  let deciderId: string;

  beforeAll(async () => {
    await sql`SELECT 1`;
  });

  afterAll(async () => {
    await sql.end();
  });

  beforeEach(async () => {
    await truncateAll(sql);
    applicantId = await seedAuthUser(sql, { email: "ana.perez@example.com" });
    deciderId = await seedAuthUser(sql, {
      email: "decider@basquetpass.tv",
      name: "Test Decider",
    });
  });

  function applicant(overrides: Partial<Parameters<typeof submitAccessRequest>[1]> = {}) {
    return {
      userId: applicantId,
      app: "portal",
      email: "Ana.Perez@Example.com",
      fullName: "Ana Pérez",
      phone: "+5491100000000",
      funcion: "Relator",
      ciudad: "Argentina · Buenos Aires",
      mensaje: null,
      ...overrides,
    };
  }

  it("submits a pending request for its app, with the email lowercased", async () => {
    const { id, email } = await submitAccessRequest(authDb, applicant());

    expect(email).toBe("ana.perez@example.com");
    const [row] = await sql`
      SELECT email, status, app FROM auth_access_request WHERE id = ${id}`;
    expect(row).toMatchObject({
      email: "ana.perez@example.com",
      status: "pendiente",
      app: "portal",
    });
  });

  it("refuses a second pending request for the same app, by identity or by email in any casing", async () => {
    await submitAccessRequest(authDb, applicant());
    const other = await seedAuthUser(sql, { email: "other@example.com" });

    await expect(submitAccessRequest(authDb, applicant())).rejects.toThrow(
      "Ya tenés una solicitud pendiente.",
    );
    await expect(
      submitAccessRequest(authDb, applicant({ userId: other, email: "ANA.PEREZ@example.com" })),
    ).rejects.toThrow("Ya tenés una solicitud pendiente.");
  });

  it("lets the same identity be pending in two apps at once", async () => {
    const portal = await submitAccessRequest(authDb, applicant());
    const facturacion = await submitAccessRequest(
      authDb,
      applicant({ app: "facturacion", funcion: null }),
    );

    expect(facturacion.id).not.toBe(portal.id);
    const inPortal = await getOwnAccessRequest(authDb, { userId: applicantId, app: "portal" });
    const inFacturacion = await getOwnAccessRequest(authDb, {
      userId: applicantId,
      app: "facturacion",
    });
    expect(inPortal).toMatchObject({ pending: true, request: { id: portal.id } });
    expect(inFacturacion).toMatchObject({
      pending: true,
      request: { id: facturacion.id, funcion: null },
    });
  });

  it("lets a resolved request be followed by a new one (never a lockout)", async () => {
    const first = await submitAccessRequest(authDb, applicant());
    await claimAccessRequest(authDb, {
      id: first.id,
      app: "portal",
      outcome: "rechazada",
      deciderId,
    });

    const second = await submitAccessRequest(authDb, applicant());
    expect(second.id).not.toBe(first.id);

    const own = await getOwnAccessRequest(authDb, { userId: applicantId, app: "portal" });
    expect(own.pending).toBe(true);
    expect(own.request?.id).toBe(second.id);
  });

  it("reports a resolved request as not pending, and nothing for another app", async () => {
    const { id } = await submitAccessRequest(authDb, applicant());
    await claimAccessRequest(authDb, { id, app: "portal", outcome: "aprobada", deciderId });

    const own = await getOwnAccessRequest(authDb, { userId: applicantId, app: "portal" });
    expect(own.pending).toBe(false);
    expect(own.request?.status).toBe("aprobada");

    const elsewhere = await getOwnAccessRequest(authDb, {
      userId: applicantId,
      app: "incidencias",
    });
    expect(elsewhere).toEqual({ request: null, pending: false });
  });

  it("claims once: the second decision is told the request is already resolved", async () => {
    const { id } = await submitAccessRequest(authDb, applicant());

    const won = await claimAccessRequest(authDb, {
      id,
      app: "portal",
      outcome: "aprobada",
      deciderId,
      grantedRole: "collaborator",
    });
    expect(won).toEqual({ id, email: "ana.perez@example.com", userId: applicantId });

    await expect(
      claimAccessRequest(authDb, { id, app: "portal", outcome: "rechazada", deciderId }),
    ).rejects.toThrow("Esta solicitud ya fue resuelta.");

    const [row] = await sql`
      SELECT status, decided_by, granted_role FROM auth_access_request WHERE id = ${id}`;
    expect(row).toMatchObject({
      status: "aprobada",
      decided_by: deciderId,
      granted_role: "collaborator",
    });
  });

  it("refuses a claim scoped to another app", async () => {
    const { id } = await submitAccessRequest(
      authDb,
      applicant({ app: "facturacion", funcion: null }),
    );

    await expect(
      claimAccessRequest(authDb, { id, app: "portal", outcome: "aprobada", deciderId }),
    ).rejects.toThrow("Esta solicitud ya fue resuelta.");
    const [row] = await sql`SELECT status FROM auth_access_request WHERE id = ${id}`;
    expect(row.status).toBe("pendiente");
  });

  it("serializes two concurrent claims: exactly one wins (D-06)", async () => {
    const { id } = await submitAccessRequest(authDb, applicant());

    const results = await Promise.allSettled([
      authDb.transaction((tx) =>
        claimAccessRequest(tx, { id, app: "portal", outcome: "aprobada", deciderId }),
      ),
      authDb.transaction((tx) =>
        claimAccessRequest(tx, { id, app: "portal", outcome: "rechazada", deciderId }),
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
      claimAccessRequest(authDb, {
        id: "00000000-0000-0000-0000-000000000000",
        app: "portal",
        outcome: "aprobada",
        deciderId: null,
      }),
    ).rejects.toThrow("Esta solicitud ya fue resuelta.");
  });

  it("lists one app's pending and decided separately, decided with the decider's name", async () => {
    const other = await seedAuthUser(sql, { email: "b@example.com" });
    const a = await submitAccessRequest(authDb, applicant());
    const b = await submitAccessRequest(
      authDb,
      applicant({ userId: other, email: "b@example.com" }),
    );
    await submitAccessRequest(authDb, applicant({ app: "facturacion", funcion: null }));
    await claimAccessRequest(authDb, { id: a.id, app: "portal", outcome: "rechazada", deciderId });

    const pending = await listPendingAccessRequests(authDb, { app: "portal" });
    const decided = await listDecidedAccessRequests(authDb, { app: "portal" });

    expect(pending.map((r) => r.id)).toEqual([b.id]);
    expect(decided).toHaveLength(1);
    expect(decided[0]).toMatchObject({
      id: a.id,
      app: "portal",
      status: "rechazada",
      decided_by_name: "Test Decider",
    });
    expect(typeof decided[0]!.decided_at).toBe("string");
    expect(
      (await listPendingAccessRequests(authDb, { app: "facturacion" })).map((r) => r.app),
    ).toEqual(["facturacion"]);
  });

  it("attaches the settled ficha to the request", async () => {
    const { id } = await submitAccessRequest(authDb, applicant());
    const personId = crypto.randomUUID();

    await attachAccessRequestPerson(authDb, { id, personId });

    const [row] = await sql`SELECT person_id FROM auth_access_request WHERE id = ${id}`;
    expect(row).toEqual({ person_id: personId });
  });

  it("rejects a status outside the vocabulary and an app outside the catalog", async () => {
    await expect(
      sql`INSERT INTO auth_access_request (user_id, app, email, full_name, phone, status)
          VALUES (${applicantId}, 'portal', 'x@example.com', 'X', '+1', 'otra')`,
    ).rejects.toThrow(/auth_access_request_status_check/);
    await expect(
      submitAccessRequest(authDb, applicant({ app: "nope" })),
    ).rejects.toThrow();
  });
});
