import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { copyDomainAccessRequests } from "@/lib/access-requests/copy-domain";
import { seedAuthUser, testSql, truncateAll } from "@/test/integration/db";

// The one-off copy of the Domain DB access_requests into the Auth DB
// (basket#198): portal rows, decided_by mapped from Cuenta to identity,
// idempotent, dry run writes nothing.
describe("copyDomainAccessRequests (integration)", () => {
  const sql = testSql();

  afterAll(async () => {
    await sql.end();
  });

  beforeEach(async () => {
    await truncateAll(sql);
  });

  async function seedProfile(authUserId: string | null) {
    const id = crypto.randomUUID();
    await sql`INSERT INTO profiles ${sql({
      id,
      email: `cuenta-${id}@basquetpass.tv`,
      full_name: "Decider",
      auth_user_id: authUserId,
    })}`;
    return id;
  }

  async function seedDomainRequest(values: {
    authUserId: string;
    email: string;
    status?: string;
    decidedBy?: string | null;
  }) {
    const [row] = await sql<{ id: string }[]>`
      INSERT INTO access_requests ${sql({
        auth_user_id: values.authUserId,
        email: values.email,
        full_name: "Ana Pérez",
        phone: "+5491100000000",
        funcion: "Relator",
        ciudad: "Argentina · Buenos Aires",
        status: values.status ?? "pendiente",
        decided_at: values.status && values.status !== "pendiente" ? new Date() : null,
        decided_by: values.decidedBy ?? null,
      })} RETURNING id`;
    return row!.id;
  }

  async function seedScenario() {
    const ana = await seedAuthUser(sql, { email: "ana@example.com" });
    const beto = await seedAuthUser(sql, { email: "beto@example.com" });
    const decider = await seedAuthUser(sql, { email: "decider@basquetpass.tv" });
    const linkedCuenta = await seedProfile(decider);
    const unlinkedCuenta = await seedProfile(null);

    return {
      ana,
      decider,
      pending: await seedDomainRequest({ authUserId: ana, email: "Ana@Example.com" }),
      approved: await seedDomainRequest({
        authUserId: beto,
        email: "beto@example.com",
        status: "aprobada",
        decidedBy: linkedCuenta,
      }),
      rejected: await seedDomainRequest({
        authUserId: beto,
        email: "beto@example.com",
        status: "rechazada",
        decidedBy: unlinkedCuenta,
      }),
      orphan: await seedDomainRequest({ authUserId: "gone", email: "gone@example.com" }),
    };
  }

  it("copies every row as a portal Solicitud, mapping the decider to an identity", async () => {
    const seeded = await seedScenario();

    const report = await copyDomainAccessRequests();

    expect(report.copied.sort()).toEqual(
      [seeded.pending, seeded.approved, seeded.rejected].sort(),
    );
    expect(report.missingIdentity).toEqual([{ id: seeded.orphan, email: "gone@example.com" }]);
    expect(report.deciderUnmapped).toEqual([seeded.rejected]);

    const rows = await sql<{ id: string; app: string; status: string; email: string; decided_by: string | null }[]>`
      SELECT id, app, status, email, decided_by FROM auth_access_request`;
    const byId = new Map(rows.map((row) => [row.id, row]));
    expect(rows.every((row) => row.app === "portal")).toBe(true);
    expect(byId.get(seeded.pending)).toMatchObject({ status: "pendiente", email: "ana@example.com" });
    expect(byId.get(seeded.approved)).toMatchObject({ status: "aprobada", decided_by: seeded.decider });
    expect(byId.get(seeded.rejected)).toMatchObject({ status: "rechazada", decided_by: null });
  });

  it("is idempotent: a second run copies nothing", async () => {
    await seedScenario();
    await copyDomainAccessRequests();

    const again = await copyDomainAccessRequests();

    expect(again.copied).toEqual([]);
    expect(again.alreadyCopied).toHaveLength(3);
    const [{ count }] = await sql`SELECT count(*)::int AS count FROM auth_access_request`;
    expect(count).toBe(3);
  });

  it("writes nothing in a dry run", async () => {
    await seedScenario();

    const report = await copyDomainAccessRequests({ dryRun: true });

    expect(report.copied).toHaveLength(3);
    const [{ count }] = await sql`SELECT count(*)::int AS count FROM auth_access_request`;
    expect(count).toBe(0);
  });

  it("leaves a pending row alone when the Auth DB already has one for that applicant", async () => {
    const seeded = await seedScenario();
    await sql`
      INSERT INTO auth_access_request (user_id, app, email, full_name, phone)
      VALUES (${seeded.ana}, 'portal', 'ana@example.com', 'Ana', '+1')`;

    const report = await copyDomainAccessRequests();

    expect(report.pendingConflict).toEqual([{ id: seeded.pending, email: "Ana@Example.com" }]);
  });

  it("carries over a decision the old build made after the first run", async () => {
    const seeded = await seedScenario();
    await copyDomainAccessRequests();
    await sql`
      UPDATE access_requests SET status = 'rechazada', decided_at = now()
      WHERE id = ${seeded.pending}`;

    const again = await copyDomainAccessRequests();

    expect(again.resynced).toEqual([seeded.pending]);
    const [row] = await sql`SELECT status FROM auth_access_request WHERE id = ${seeded.pending}`;
    expect(row!.status).toBe("rechazada");
  });
});
