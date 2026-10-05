import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  getEffectiveAccess,
  grantRole,
  listEffectiveAccessForUser,
  revokeRole,
} from "@/lib/acceso/accesos";
import { seedAuthUser, testSql, truncateAll } from "@/test/integration/db";

// Acceso rows in the Auth DB: what a portal admin grants and what every App
// gate reads through auth_effective_access (ADR 0010).
describe("accesos (integration)", () => {
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

  async function grantRow(userId: string, app: string) {
    const [row] = await sql<{ role: string; granted_by: string | null }[]>`
      SELECT role, granted_by FROM auth_app_access
      WHERE user_id = ${userId} AND app = ${app}`;
    return row ?? null;
  }

  it("grants a role and answers the lookup with it", async () => {
    const admin = await seedAuthUser(sql, { email: "admin@basquetpass.tv" });
    const operator = await seedAuthUser(sql, { email: "op@basquetpass.tv" });

    await grantRole({ userId: operator, app: "incidencias", role: "write", grantedBy: admin });

    expect(await getEffectiveAccess(operator, "incidencias")).toMatchObject({
      userId: operator,
      app: "incidencias",
      role: "write",
      viaSuperadmin: false,
    });
    expect(await grantRow(operator, "incidencias")).toEqual({ role: "write", granted_by: admin });

    // An Acceso admits to one app only.
    expect(await getEffectiveAccess(operator, "ops")).toBeNull();
    expect(await getEffectiveAccess(admin, "incidencias")).toBeNull();
  });

  it("lists only the asking identity's apps, for the apex launcher", async () => {
    const operator = await seedAuthUser(sql, { email: "op@basquetpass.tv" });
    const other = await seedAuthUser(sql, { email: "other@basquetpass.tv" });

    await grantRole({ userId: operator, app: "ops", role: "read", grantedBy: null });
    await grantRole({ userId: operator, app: "facturacion", role: "coordinador", grantedBy: null });
    await grantRole({ userId: other, app: "analytics", role: "admin", grantedBy: null });

    const rows = await listEffectiveAccessForUser(operator);
    expect(rows.map((row) => `${row.app}/${row.role}`).sort()).toEqual([
      "facturacion/coordinador",
      "ops/read",
    ]);

    const nobody = await seedAuthUser(sql, { email: "none@basquetpass.tv" });
    expect(await listEffectiveAccessForUser(nobody)).toEqual([]);
  });

  it("rejects a role the app's catalog does not declare", async () => {
    const operator = await seedAuthUser(sql, { email: "op@basquetpass.tv" });

    await expect(
      grantRole({ userId: operator, app: "facturacion", role: "write", grantedBy: null }),
    ).rejects.toThrow();
    expect(await grantRow(operator, "facturacion")).toBeNull();
  });

  it("re-granting changes the role and keeps a single row per identity and app", async () => {
    const admin = await seedAuthUser(sql, { email: "admin@basquetpass.tv" });
    const other = await seedAuthUser(sql, { email: "other@basquetpass.tv" });
    const operator = await seedAuthUser(sql, { email: "op@basquetpass.tv" });

    await grantRole({ userId: operator, app: "ops", role: "read", grantedBy: admin });
    await grantRole({ userId: operator, app: "ops", role: "write", grantedBy: other });

    expect(await grantRow(operator, "ops")).toEqual({ role: "write", granted_by: other });

    const [{ count }] = await sql`
      SELECT count(*)::int AS count FROM auth_app_access
      WHERE user_id = ${operator} AND app = 'ops'`;
    expect(count).toBe(1);
  });

  it("revoking removes the row so the next lookup answers null; revoking again is a no-op", async () => {
    const admin = await seedAuthUser(sql, { email: "admin@basquetpass.tv" });
    const operator = await seedAuthUser(sql, { email: "op@basquetpass.tv" });
    await grantRole({ userId: operator, app: "analytics", role: "read", grantedBy: admin });
    await grantRole({ userId: operator, app: "ops", role: "read", grantedBy: admin });

    await expect(revokeRole({ userId: operator, app: "analytics" })).resolves.toBe(true);

    expect(await getEffectiveAccess(operator, "analytics")).toBeNull();
    // Other apps untouched.
    expect(await getEffectiveAccess(operator, "ops")).toMatchObject({ role: "read" });

    await expect(revokeRole({ userId: operator, app: "analytics" })).resolves.toBe(false);
  });

  it("deleting the identity cascades to its rows and nulls it as grantor elsewhere", async () => {
    const admin = await seedAuthUser(sql, { email: "admin@basquetpass.tv" });
    const operator = await seedAuthUser(sql, { email: "op@basquetpass.tv" });
    await grantRole({ userId: operator, app: "ops", role: "write", grantedBy: admin });
    await grantRole({ userId: admin, app: "ops", role: "admin", grantedBy: admin });

    await sql`DELETE FROM auth_user WHERE id = ${admin}`;

    expect(await grantRow(admin, "ops")).toBeNull();
    expect(await grantRow(operator, "ops")).toEqual({ role: "write", granted_by: null });
  });
});
