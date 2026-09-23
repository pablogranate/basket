import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  getAcceso,
  grantAcceso,
  listUsersWithAccesos,
  revokeAcceso,
} from "@/lib/acceso/accesos";
import { seedAuthUser, testSql, truncateAll } from "@/test/integration/db";

// Acceso rows in the Auth DB: what a portal admin grants and what every App
// gate reads (ADR 0009). Observed through the module's public surface only.
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

  it("grants an Acceso and answers the lookup with its Nivel", async () => {
    const admin = await seedAuthUser(sql, { email: "admin@basquetpass.tv" });
    const operator = await seedAuthUser(sql, { email: "op@basquetpass.tv" });

    await grantAcceso({
      userId: operator,
      app: "incidencias",
      level: "write",
      grantedBy: admin,
    });

    const acceso = await getAcceso(operator, "incidencias");
    expect(acceso).toMatchObject({
      userId: operator,
      app: "incidencias",
      level: "write",
      grantedBy: admin,
    });
    expect(acceso?.grantedAt).toBeInstanceOf(Date);

    // An Acceso admits to one app only.
    expect(await getAcceso(operator, "ops")).toBeNull();
    expect(await getAcceso(admin, "incidencias")).toBeNull();
  });

  it("grants facturacion coordinador and admin as the plain write/admin Niveles facturacion-bp reads", async () => {
    const admin = await seedAuthUser(sql, { email: "admin@basquetpass.tv" });
    const coordinador = await seedAuthUser(sql, { email: "coord@basquetpass.tv" });

    await grantAcceso({ userId: coordinador, app: "facturacion", level: "write", grantedBy: admin });
    await grantAcceso({ userId: admin, app: "facturacion", level: "admin", grantedBy: admin });

    expect(await getAcceso(coordinador, "facturacion")).toMatchObject({
      app: "facturacion",
      level: "write",
    });
    expect(await getAcceso(admin, "facturacion")).toMatchObject({
      app: "facturacion",
      level: "admin",
    });
  });

  it("re-granting changes the Nivel and keeps a single row per identity and app", async () => {
    const admin = await seedAuthUser(sql, { email: "admin@basquetpass.tv" });
    const other = await seedAuthUser(sql, { email: "other@basquetpass.tv" });
    const operator = await seedAuthUser(sql, { email: "op@basquetpass.tv" });

    await grantAcceso({ userId: operator, app: "ops", level: "read", grantedBy: admin });
    await grantAcceso({ userId: operator, app: "ops", level: "write", grantedBy: other });

    const acceso = await getAcceso(operator, "ops");
    expect(acceso).toMatchObject({ level: "write", grantedBy: other });

    const [{ count }] = await sql`
      SELECT count(*)::int AS count FROM auth_app_access
      WHERE user_id = ${operator} AND app = 'ops'`;
    expect(count).toBe(1);
  });

  it("revoking removes the Acceso so the next lookup answers null; revoking again is a no-op", async () => {
    const admin = await seedAuthUser(sql, { email: "admin@basquetpass.tv" });
    const operator = await seedAuthUser(sql, { email: "op@basquetpass.tv" });
    await grantAcceso({ userId: operator, app: "analytics", level: "read", grantedBy: admin });
    await grantAcceso({ userId: operator, app: "ops", level: "read", grantedBy: admin });

    await expect(revokeAcceso({ userId: operator, app: "analytics" })).resolves.toBe(true);

    expect(await getAcceso(operator, "analytics")).toBeNull();
    // Other apps untouched.
    expect(await getAcceso(operator, "ops")).toMatchObject({ level: "read" });

    await expect(revokeAcceso({ userId: operator, app: "analytics" })).resolves.toBe(false);
  });

  it("deleting the identity cascades to its Accesos and nulls it as grantor elsewhere", async () => {
    const admin = await seedAuthUser(sql, { email: "admin@basquetpass.tv" });
    const operator = await seedAuthUser(sql, { email: "op@basquetpass.tv" });
    await grantAcceso({ userId: operator, app: "ops", level: "write", grantedBy: admin });
    await grantAcceso({ userId: admin, app: "ops", level: "admin", grantedBy: admin });

    await sql`DELETE FROM auth_user WHERE id = ${admin}`;

    expect(await getAcceso(admin, "ops")).toBeNull();
    expect(await getAcceso(operator, "ops")).toMatchObject({ level: "write", grantedBy: null });
  });

  it("lists every identity, including those without any Acceso, with their Accesos keyed by app", async () => {
    const admin = await seedAuthUser(sql, { email: "admin@basquetpass.tv", name: "Admin" });
    const operator = await seedAuthUser(sql, { email: "op@basquetpass.tv", name: "Operador" });
    const viewer = await seedAuthUser(sql, { email: "viewer@gmail.com", name: "Viewer" });
    await grantAcceso({ userId: operator, app: "incidencias", level: "write", grantedBy: admin });
    await grantAcceso({ userId: operator, app: "generator", level: "write", grantedBy: admin });
    await grantAcceso({ userId: viewer, app: "ops", level: "read", grantedBy: admin });

    const list = await listUsersWithAccesos();

    // Sorted by email so the page is stable.
    expect(list.map((u) => u.email)).toEqual([
      "admin@basquetpass.tv",
      "op@basquetpass.tv",
      "viewer@gmail.com",
    ]);
    expect(list[0]).toMatchObject({ userId: admin, name: "Admin", accesos: {} });
    expect(list[1].accesos).toMatchObject({
      incidencias: { level: "write", grantedBy: admin },
      generator: { level: "write", grantedBy: admin },
    });
    expect(list[1].accesos.ops).toBeUndefined();
    expect(list[2].accesos).toMatchObject({ ops: { level: "read" } });
  });
});
