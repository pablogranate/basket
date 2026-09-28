import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { grantRole } from "@/lib/acceso/accesos";
import {
  grantPortalRoleWithCuenta,
  revokePortalRoleWithCuenta,
} from "@/lib/acceso/portal-cuenta";
import { listUsuarios } from "@/lib/usuarios/matrix";
import {
  findActiveSuperAdmin,
  LAST_SUPER_ADMIN_MESSAGE,
  setSuperAdmin,
} from "@/lib/usuarios/super-admin";
import { seedAuthUser, testSql, truncateAll } from "@/test/integration/db";

// The apex users section's writes (basket#187, ADR 0010).
describe("usuarios (integration)", () => {
  const sql = testSql();

  afterAll(async () => {
    await sql.end();
  });

  beforeEach(async () => {
    await truncateAll(sql);
  });

  async function makeSuperAdmin(userId: string) {
    await sql`UPDATE auth_user SET role = 'superadmin' WHERE id = ${userId}`;
  }

  async function auditActions() {
    const rows = await sql<{ action: string; target_user_id: string }[]>`
      SELECT action, target_user_id FROM auth_audit_log ORDER BY id
    `;
    return rows.map((row) => ({ action: row.action, target: row.target_user_id }));
  }

  describe("setSuperAdmin", () => {
    it("promotes and demotes with an audit row each, restoring explicit rows", async () => {
      const actor = await seedAuthUser(sql, { email: "super@basquetpass.tv" });
      const ana = await seedAuthUser(sql, { email: "ana@basquetpass.tv" });
      await makeSuperAdmin(actor);
      await grantRole({ userId: ana, app: "facturacion", role: "periodista", grantedBy: actor });

      expect(
        await setSuperAdmin({ actorId: actor, targetUserId: ana, superAdmin: true, source: "usuarios" }),
      ).toBe(true);
      expect(await findActiveSuperAdmin(ana)).not.toBeNull();
      const [asSuper] = await sql`
        SELECT role FROM auth_effective_access WHERE user_id = ${ana} AND app = 'facturacion'`;
      expect(asSuper.role).toBe("admin");

      expect(
        await setSuperAdmin({ actorId: actor, targetUserId: ana, superAdmin: false, source: "usuarios" }),
      ).toBe(true);
      expect(await findActiveSuperAdmin(ana)).toBeNull();
      const [restored] = await sql`
        SELECT role FROM auth_effective_access WHERE user_id = ${ana} AND app = 'facturacion'`;
      expect(restored.role).toBe("periodista");

      expect(await auditActions()).toEqual([
        { action: "superadmin.set", target: ana },
        { action: "superadmin.unset", target: ana },
      ]);
    });

    it("is a no-op when nothing changes", async () => {
      const actor = await seedAuthUser(sql, { email: "super@basquetpass.tv" });
      await makeSuperAdmin(actor);

      expect(
        await setSuperAdmin({ actorId: actor, targetUserId: actor, superAdmin: true, source: "usuarios" }),
      ).toBe(false);
      expect(await auditActions()).toEqual([]);
    });

    it("refuses to demote the last super admin", async () => {
      const only = await seedAuthUser(sql, { email: "super@basquetpass.tv" });
      await makeSuperAdmin(only);

      await expect(
        setSuperAdmin({ actorId: only, targetUserId: only, superAdmin: false, source: "usuarios" }),
      ).rejects.toThrow(LAST_SUPER_ADMIN_MESSAGE);
      expect(await findActiveSuperAdmin(only)).not.toBeNull();
      expect(await auditActions()).toEqual([]);
    });

    it("does not count a banned super admin as the one left", async () => {
      const active = await seedAuthUser(sql, { email: "super@basquetpass.tv" });
      const banned = await seedAuthUser(sql, { email: "banned@basquetpass.tv" });
      await makeSuperAdmin(active);
      await makeSuperAdmin(banned);
      await sql`UPDATE auth_user SET banned = true WHERE id = ${banned}`;

      await expect(
        setSuperAdmin({ actorId: active, targetUserId: active, superAdmin: false, source: "usuarios" }),
      ).rejects.toThrow(LAST_SUPER_ADMIN_MESSAGE);
    });

    it("lets only one of two concurrent demotions through when two are left", async () => {
      const a = await seedAuthUser(sql, { email: "a@basquetpass.tv" });
      const b = await seedAuthUser(sql, { email: "b@basquetpass.tv" });
      await makeSuperAdmin(a);
      await makeSuperAdmin(b);

      const results = await Promise.allSettled([
        setSuperAdmin({ actorId: a, targetUserId: a, superAdmin: false, source: "usuarios" }),
        setSuperAdmin({ actorId: b, targetUserId: b, superAdmin: false, source: "usuarios" }),
      ]);

      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      const [{ count }] = await sql<{ count: number }[]>`
        SELECT count(*)::int AS count FROM auth_user WHERE role = 'superadmin'`;
      expect(count).toBe(1);
    });
  });

  describe("portal with its Cuenta", () => {
    async function cuenta(email: string) {
      const rows = await sql<{ role: string; auth_user_id: string | null }[]>`
        SELECT role, auth_user_id FROM profiles WHERE lower(email) = ${email}`;
      return rows[0] ?? null;
    }

    it("creates the Cuenta for an identity that has none, so the grant admits them", async () => {
      const actor = await seedAuthUser(sql, { email: "super@basquetpass.tv" });
      const viewer = await seedAuthUser(sql, { email: "viewer@gmail.com", name: "Viewer" });

      await grantPortalRoleWithCuenta({
        userId: viewer,
        email: "viewer@gmail.com",
        name: "Viewer",
        role: "collaborator",
        grantedBy: actor,
      });

      expect(await cuenta("viewer@gmail.com")).toEqual({
        role: "collaborator",
        auth_user_id: viewer,
      });
      const [row] = await sql`SELECT role, granted_by FROM auth_app_access WHERE user_id = ${viewer} AND app = 'portal'`;
      expect(row).toEqual({ role: "collaborator", granted_by: actor });
    });

    it("links and re-tiers an unlinked Cuenta with the same email", async () => {
      const ana = await seedAuthUser(sql, { email: "ana@basquetpass.tv" });
      await sql`INSERT INTO profiles ${sql({ id: crypto.randomUUID(), email: "Ana@basquetpass.tv", role: "collaborator", full_name: "Ana", auth_user_id: null })}`;

      await grantPortalRoleWithCuenta({
        userId: ana,
        email: "ana@basquetpass.tv",
        name: "Ana",
        role: "editor",
        grantedBy: null,
      });

      expect(await cuenta("ana@basquetpass.tv")).toEqual({ role: "editor", auth_user_id: ana });
    });

    it("revokes the row and removes the Cuenta, keeping the Ficha", async () => {
      const ana = await seedAuthUser(sql, { email: "ana@basquetpass.tv" });
      const profileId = crypto.randomUUID();
      await sql`INSERT INTO profiles ${sql({ id: profileId, email: "ana@basquetpass.tv", role: "editor", full_name: "Ana", auth_user_id: ana })}`;
      await sql`INSERT INTO people ${sql({ full_name: "Ana", email: "ana@basquetpass.tv", profile_id: profileId, active: true })}`;
      await grantRole({ userId: ana, app: "portal", role: "editor", grantedBy: null });

      const identity = { userId: ana, email: "ana@basquetpass.tv", name: "Ana" };
      expect(await revokePortalRoleWithCuenta(identity)).toBe(true);

      expect(await cuenta("ana@basquetpass.tv")).toBeNull();
      const accesos = await sql`SELECT 1 FROM auth_app_access WHERE user_id = ${ana}`;
      expect(accesos).toHaveLength(0);
      const [ficha] = await sql`SELECT profile_id FROM people WHERE email = 'ana@basquetpass.tv'`;
      expect(ficha.profile_id).toBeNull();

      expect(await revokePortalRoleWithCuenta(identity)).toBe(false);
    });
  });

  it("lists every identity with its explicit rows, super admin flag and Cuenta", async () => {
    const admin = await seedAuthUser(sql, { email: "admin@basquetpass.tv", name: "Admin" });
    const viewer = await seedAuthUser(sql, { email: "viewer@gmail.com", name: "Viewer" });
    await makeSuperAdmin(admin);
    const profileId = crypto.randomUUID();
    await sql`INSERT INTO profiles ${sql({ id: profileId, email: "admin@basquetpass.tv", role: "admin", full_name: "Admin", auth_user_id: admin })}`;
    await sql`INSERT INTO people ${sql({ full_name: "Ana Admin", email: "admin@basquetpass.tv", profile_id: profileId, active: true })}`;
    await grantRole({ userId: viewer, app: "ops", role: "read", grantedBy: admin });

    const rows = await listUsuarios();

    expect(rows.map((row) => row.email)).toEqual(["admin@basquetpass.tv", "viewer@gmail.com"]);
    expect(rows[0]).toMatchObject({
      superAdmin: true,
      banned: false,
      accesos: {},
      cuenta: { role: "admin", fichaName: "Ana Admin" },
    });
    expect(rows[1]).toMatchObject({ superAdmin: false, cuenta: null });
    expect(rows[1].accesos.ops).toMatchObject({ role: "read", grantedBy: admin });
  });
});
