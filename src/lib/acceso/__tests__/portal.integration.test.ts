import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  getPortalAccess,
  grantPortalRole,
  grantPortalRoleIfAbsent,
  revokePortalRole,
} from "@/lib/acceso/portal";
import { seedPortalAccesosFromProfiles } from "@/lib/acceso/seed-portal";
import type { AppRole } from "@/lib/database.types";
import { PORTAL_ADMIN_ROLE, PORTAL_ROLE_RANK } from "@/lib/roles";
import { seedAuthUser, testSql, truncateAll } from "@/test/integration/db";

// The portal on the central Acceso table (basket#186, ADR 0010).
describe("portal Acceso (integration)", () => {
  const sql = testSql();
  type Sql = typeof sql;

  afterAll(async () => {
    await sql.end();
  });

  beforeEach(async () => {
    await truncateAll(sql);
  });

  async function seedProfile(
    exec: Sql,
    values: { email: string; role: AppRole; auth_user_id?: string | null },
  ) {
    const id = crypto.randomUUID();
    await exec`
      INSERT INTO profiles ${exec({
        id,
        email: values.email,
        role: values.role,
        full_name: values.email,
        auth_user_id: values.auth_user_id ?? null,
      })}`;
    return id;
  }

  async function portalRow(userId: string) {
    const rows = await sql<{ role: string; level: string | null; granted_by: string | null }[]>`
      SELECT role, level::text, granted_by FROM auth_app_access
      WHERE user_id = ${userId} AND app = 'portal'
    `;
    return rows[0] ?? null;
  }

  it("mirrors the portal catalog ranks and admin role in roles.ts", async () => {
    const rows = await sql<{ key: string; rank: number; is_admin: boolean }[]>`
      SELECT key, rank, is_admin FROM auth_app_role WHERE app = 'portal'
    `;

    expect(Object.fromEntries(rows.map((row) => [row.key, row.rank]))).toEqual(
      PORTAL_ROLE_RANK,
    );
    expect(rows.filter((row) => row.is_admin).map((row) => row.key)).toEqual([
      PORTAL_ADMIN_ROLE,
    ]);
  });

  it("grants, re-tiers and revokes a portal role with no Nivel", async () => {
    const admin = await seedAuthUser(sql, { email: "admin@basquetpass.tv" });
    const ana = await seedAuthUser(sql, { email: "ana@basquetpass.tv" });

    await grantPortalRole({ userId: ana, role: "collaborator", grantedBy: admin });
    expect(await portalRow(ana)).toEqual({ role: "collaborator", level: null, granted_by: admin });
    expect(await getPortalAccess(ana)).toEqual({ role: "collaborator", superAdmin: false });

    await grantPortalRole({ userId: ana, role: "editor", grantedBy: admin });
    expect(await getPortalAccess(ana)).toEqual({ role: "editor", superAdmin: false });

    expect(await revokePortalRole(ana)).toBe(true);
    expect(await getPortalAccess(ana)).toBeNull();
    expect(await revokePortalRole(ana)).toBe(false);
  });

  it("never overrides an existing row when granting if absent", async () => {
    const ana = await seedAuthUser(sql, { email: "ana@basquetpass.tv" });
    await grantPortalRole({ userId: ana, role: "editor", grantedBy: null });

    expect(await grantPortalRoleIfAbsent({ userId: ana, role: "collaborator", grantedBy: null })).toBe(false);
    expect((await portalRow(ana))?.role).toBe("editor");
  });

  it("resolves a super admin to admin without a portal row", async () => {
    const boss = await seedAuthUser(sql, { email: "boss@basquetpass.tv" });
    await sql`UPDATE auth_user SET role = 'superadmin' WHERE id = ${boss}`;

    expect(await getPortalAccess(boss)).toEqual({ role: "admin", superAdmin: true });
  });

  describe("seedPortalAccesosFromProfiles", () => {
    it("grants linked Cuentas their profiles.role and reports unlinked ones", async () => {
      const admin = await seedAuthUser(sql, { email: "admin@basquetpass.tv" });
      const editor = await seedAuthUser(sql, { email: "editor@basquetpass.tv" });
      const colab = await seedAuthUser(sql, { email: "colab@basquetpass.tv" });
      await seedProfile(sql, { email: "admin@basquetpass.tv", role: "admin", auth_user_id: admin });
      await seedProfile(sql, { email: "Editor@basquetpass.tv", role: "editor", auth_user_id: editor });
      await seedProfile(sql, { email: "colab@basquetpass.tv", role: "collaborator", auth_user_id: colab });
      await seedProfile(sql, { email: "never.logged@basquetpass.tv", role: "editor" });

      const report = await seedPortalAccesosFromProfiles();

      expect(report.granted.map((r) => [r.email, r.role]).sort()).toEqual([
        ["admin@basquetpass.tv", "admin"],
        ["colab@basquetpass.tv", "collaborator"],
        ["editor@basquetpass.tv", "editor"],
      ]);
      expect(report.alreadyHad).toEqual([]);
      expect(report.unlinked).toEqual([{ email: "never.logged@basquetpass.tv", role: "editor" }]);

      expect(await portalRow(admin)).toEqual({ role: "admin", level: null, granted_by: null });
      expect((await portalRow(editor))?.role).toBe("editor");
      expect((await portalRow(colab))?.role).toBe("collaborator");
    });

    it("is idempotent and never overrides a role already set", async () => {
      const editor = await seedAuthUser(sql, { email: "editor@basquetpass.tv" });
      const admin = await seedAuthUser(sql, { email: "admin@basquetpass.tv" });
      await seedProfile(sql, { email: "editor@basquetpass.tv", role: "editor", auth_user_id: editor });
      await seedProfile(sql, { email: "admin@basquetpass.tv", role: "admin", auth_user_id: admin });
      // Re-tiered in the Auth DB since: the seed must not undo it.
      await grantPortalRole({ userId: editor, role: "collaborator", grantedBy: admin });

      const first = await seedPortalAccesosFromProfiles();
      expect(first.granted.map((r) => r.email)).toEqual(["admin@basquetpass.tv"]);
      expect(first.alreadyHad.map((r) => r.email)).toEqual(["editor@basquetpass.tv"]);
      expect((await portalRow(editor))?.role).toBe("collaborator");

      const second = await seedPortalAccesosFromProfiles();
      expect(second.granted).toEqual([]);
      expect(second.alreadyHad.map((r) => r.email).sort()).toEqual([
        "admin@basquetpass.tv",
        "editor@basquetpass.tv",
      ]);
    });

    it("writes nothing in dry-run", async () => {
      const editor = await seedAuthUser(sql, { email: "editor@basquetpass.tv" });
      await seedProfile(sql, { email: "editor@basquetpass.tv", role: "editor", auth_user_id: editor });

      const report = await seedPortalAccesosFromProfiles({ dryRun: true });

      expect(report.granted.map((r) => r.email)).toEqual(["editor@basquetpass.tv"]);
      expect(await portalRow(editor)).toBeNull();
    });
  });
});
