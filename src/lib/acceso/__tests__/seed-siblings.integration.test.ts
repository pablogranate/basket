import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { getAcceso, grantAcceso } from "@/lib/acceso/accesos";
import { applySiblingAccesoPlan } from "@/lib/acceso/seed-siblings";
import { seedAuthUser, testSql, truncateAll } from "@/test/integration/db";

// Cutover seed for incidencias, ops hub and analytics users: creates missing
// identities by email (verified, no email sent) and grants their Accesos.
describe("apply sibling Acceso plan (integration)", () => {
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

  const plan = [
    { email: "existing@basquetpass.tv", app: "incidencias", level: "write" },
    { email: "existing@basquetpass.tv", app: "ops", level: "write" },
    { email: "newcomer@gmail.com", app: "ops", level: "read" },
  ] as const;

  it("creates missing identities as verified users and grants every planned Acceso", async () => {
    const existing = await seedAuthUser(sql, { email: "Existing@basquetpass.tv" });

    const report = await applySiblingAccesoPlan([...plan]);

    expect(report.createdIdentities.map((u) => u.email)).toEqual(["newcomer@gmail.com"]);
    expect(report.granted).toHaveLength(3);
    expect(report.alreadyHad).toEqual([]);

    const [newcomer] = await sql`
      SELECT id, email_verified, name FROM auth_user WHERE email = 'newcomer@gmail.com'`;
    expect(newcomer.email_verified).toBe(true);
    expect(newcomer.name).toBe("newcomer");
    // No verification token or session was minted for the new identity.
    expect((await sql`SELECT count(*)::int AS n FROM auth_verification`)[0].n).toBe(0);

    expect(await getAcceso(existing, "incidencias")).toMatchObject({ level: "write", grantedBy: null });
    expect(await getAcceso(existing, "ops")).toMatchObject({ level: "write" });
    expect(await getAcceso(newcomer.id as string, "ops")).toMatchObject({ level: "read" });
  });

  it("is idempotent: a second run creates nothing and never overrides an admin's Nivel", async () => {
    const admin = await seedAuthUser(sql, { email: "admin@basquetpass.tv" });
    const existing = await seedAuthUser(sql, { email: "existing@basquetpass.tv" });
    await grantAcceso({ userId: existing, app: "ops", level: "read", grantedBy: admin });

    const first = await applySiblingAccesoPlan([...plan]);
    expect(first.alreadyHad.map((r) => `${r.email}/${r.app}`)).toEqual(["existing@basquetpass.tv/ops"]);

    const second = await applySiblingAccesoPlan([...plan]);
    expect(second.createdIdentities).toEqual([]);
    expect(second.granted).toEqual([]);
    expect(second.alreadyHad).toHaveLength(3);

    expect(await getAcceso(existing, "ops")).toMatchObject({ level: "read", grantedBy: admin });
    expect((await sql`SELECT count(*)::int AS n FROM auth_user`)[0].n).toBe(3);
  });

  it("dry run reports the plan and writes nothing", async () => {
    const report = await applySiblingAccesoPlan([...plan], { dryRun: true });

    expect(report.createdIdentities.map((u) => u.email)).toEqual([
      "existing@basquetpass.tv",
      "newcomer@gmail.com",
    ]);
    expect(report.granted).toHaveLength(3);
    expect((await sql`SELECT count(*)::int AS n FROM auth_user`)[0].n).toBe(0);
    expect((await sql`SELECT count(*)::int AS n FROM auth_app_access`)[0].n).toBe(0);
  });
});
