import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { getEffectiveAccess, grantRole } from "@/lib/acceso/accesos";
import { seedAuthUser, testSql, truncateAll } from "@/test/integration/db";

// The role catalog and auth_effective_access (ADR 0010): what every gate
// reads. Super admins are admin in every app.
describe("effective access (integration)", () => {
  const sql = testSql();

  afterAll(async () => {
    await sql.end();
  });

  beforeEach(async () => {
    await truncateAll(sql);
  });

  async function setSuperadmin(userId: string, banned = false) {
    await sql`UPDATE auth_user SET role = 'superadmin', banned = ${banned} WHERE id = ${userId}`;
  }

  async function appKeys() {
    const rows = await sql<{ key: string }[]>`SELECT key FROM auth_app ORDER BY key`;
    return rows.map((row) => row.key);
  }

  async function effectiveRows(userId: string) {
    return sql`
      SELECT app, role, via_superadmin FROM auth_effective_access
      WHERE user_id = ${userId} ORDER BY app
    `;
  }

  it("re-granting a role moves the effective role with it", async () => {
    const coord = await seedAuthUser(sql, { email: "coord@basquetpass.tv" });

    await grantRole({ userId: coord, app: "facturacion", role: "coordinador", grantedBy: null });
    expect(await getEffectiveAccess(coord, "facturacion")).toMatchObject({
      role: "coordinador",
      isAdmin: false,
    });

    await grantRole({ userId: coord, app: "facturacion", role: "admin", grantedBy: null });
    expect(await getEffectiveAccess(coord, "facturacion")).toMatchObject({
      role: "admin",
      isAdmin: true,
      viaSuperadmin: false,
    });
  });

  it("answers an explicit Acceso with its role and rank, and nothing for other apps", async () => {
    const operator = await seedAuthUser(sql, { email: "op@basquetpass.tv" });
    await grantRole({ userId: operator, app: "incidencias", role: "write", grantedBy: null });

    expect(await getEffectiveAccess(operator, "incidencias")).toEqual({
      userId: operator,
      app: "incidencias",
      role: "write",
      rank: 20,
      isAdmin: false,
      viaSuperadmin: false,
    });
    expect(await getEffectiveAccess(operator, "ops")).toBeNull();
    expect(await getEffectiveAccess(operator, "portal")).toBeNull();
  });

  it("resolves a super admin to the admin role of every app, over their explicit rows", async () => {
    const boss = await seedAuthUser(sql, { email: "boss@basquetpass.tv" });
    await grantRole({ userId: boss, app: "ops", role: "read", grantedBy: null });
    await setSuperadmin(boss);

    const rows = await effectiveRows(boss);
    expect(rows.map((row) => row.app)).toEqual(await appKeys());
    expect(rows.every((row) => row.role === "admin" && row.via_superadmin)).toBe(true);
    expect(await getEffectiveAccess(boss, "portal")).toMatchObject({
      role: "admin",
      isAdmin: true,
      viaSuperadmin: true,
    });
  });

  it("restores a demoted super admin's explicit rows", async () => {
    const boss = await seedAuthUser(sql, { email: "boss@basquetpass.tv" });
    await grantRole({ userId: boss, app: "ops", role: "read", grantedBy: null });
    await setSuperadmin(boss);

    await sql`UPDATE auth_user SET role = 'user' WHERE id = ${boss}`;

    expect(await effectiveRows(boss)).toEqual([
      { app: "ops", role: "read", via_superadmin: false },
    ]);
  });

  it("gives a banned super admin only their explicit rows", async () => {
    const boss = await seedAuthUser(sql, { email: "boss@basquetpass.tv" });
    await grantRole({ userId: boss, app: "generator", role: "write", grantedBy: null });
    await setSuperadmin(boss, true);

    expect(await effectiveRows(boss)).toEqual([
      { app: "generator", role: "write", via_superadmin: false },
    ]);
  });

  it("covers an app added to the catalog without touching super admins", async () => {
    const boss = await seedAuthUser(sql, { email: "boss@basquetpass.tv" });
    await setSuperadmin(boss);

    await sql`INSERT INTO auth_app (key, label, sort_order) VALUES ('test-app', 'Test', 999)`;
    try {
      await sql`
        INSERT INTO auth_app_role (app, key, label, rank, is_admin)
        VALUES ('test-app', 'jefe', 'Jefe', 10, true)
      `;

      expect(await getEffectiveAccess(boss, "test-app")).toMatchObject({
        role: "jefe",
        viaSuperadmin: true,
      });
    } finally {
      await sql`DELETE FROM auth_app WHERE key = 'test-app'`;
    }
  });

  it("refuses an Acceso for an unknown app or a role its app does not declare", async () => {
    const user = await seedAuthUser(sql, { email: "u@basquetpass.tv" });

    await expect(
      sql`INSERT INTO auth_app_access (user_id, app, role) VALUES (${user}, 'nope', 'admin')`,
    ).rejects.toThrow(/foreign key/);
    await expect(
      sql`INSERT INTO auth_app_access (user_id, app, role) VALUES (${user}, 'facturacion', 'write')`,
    ).rejects.toThrow(/foreign key/);
  });

  it("allows only one admin role per app", async () => {
    await expect(
      sql`
        INSERT INTO auth_app_role (app, key, label, rank, is_admin)
        VALUES ('ops', 'owner', 'Owner', 40, true)
      `,
    ).rejects.toThrow(/auth_app_role_one_admin_per_app/);
  });
});
