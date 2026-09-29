import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

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

  afterAll(async () => {
    await sql.end();
  });

  beforeEach(async () => {
    await truncateAll(sql);
  });

  async function portalRow(userId: string) {
    const rows = await sql<{ role: string; granted_by: string | null }[]>`
      SELECT role, granted_by FROM auth_app_access
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

  it("grants, re-tiers and revokes a portal role", async () => {
    const admin = await seedAuthUser(sql, { email: "admin@basquetpass.tv" });
    const ana = await seedAuthUser(sql, { email: "ana@basquetpass.tv" });

    await grantPortalRole({ userId: ana, role: "collaborator", grantedBy: admin });
    expect(await portalRow(ana)).toEqual({ role: "collaborator", granted_by: admin });
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

  // Pre-drop seed: runs while profiles.role still exists, which the final
  // schema (migration 0043) no longer has, so each case puts it back.
  describe("seedPortalAccesosFromProfiles", () => {
    beforeEach(async () => {
      await sql`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role app_role`;
    });

    afterEach(async () => {
      await sql`ALTER TABLE profiles DROP COLUMN IF EXISTS role`;
    });

    async function seedLegacyCuenta(values: {
      email: string;
      role: AppRole;
      auth_user_id?: string | null;
    }) {
      const id = crypto.randomUUID();
      await sql`
        INSERT INTO profiles ${sql({
          id,
          email: values.email,
          role: values.role,
          full_name: values.email,
          auth_user_id: values.auth_user_id ?? null,
        })}`;
      return id;
    }

    async function linkOf(profileId: string) {
      const [row] = await sql<{ auth_user_id: string | null }[]>`
        SELECT auth_user_id FROM profiles WHERE id = ${profileId}`;
      return row.auth_user_id;
    }

    it("grants every Cuenta its profiles.role, linking or creating the identity of never-linked ones", async () => {
      const admin = await seedAuthUser(sql, { email: "admin@basquetpass.tv" });
      const editor = await seedAuthUser(sql, { email: "editor@basquetpass.tv" });
      // Signed in once since the cutover, never linked: same email, other case.
      const returning = await seedAuthUser(sql, { email: "Returning@basquetpass.tv" });
      await seedLegacyCuenta({ email: "admin@basquetpass.tv", role: "admin", auth_user_id: admin });
      await seedLegacyCuenta({ email: "Editor@basquetpass.tv", role: "editor", auth_user_id: editor });
      const returningCuenta = await seedLegacyCuenta({ email: "returning@basquetpass.tv", role: "collaborator" });
      const neverCuenta = await seedLegacyCuenta({ email: "never.logged@basquetpass.tv", role: "editor" });

      const report = await seedPortalAccesosFromProfiles();

      expect(report.granted.map((r) => [r.email, r.role]).sort()).toEqual([
        ["admin@basquetpass.tv", "admin"],
        ["editor@basquetpass.tv", "editor"],
        ["never.logged@basquetpass.tv", "editor"],
        ["returning@basquetpass.tv", "collaborator"],
      ]);
      expect(report.alreadyHad).toEqual([]);
      expect(report.createdIdentities).toEqual(["never.logged@basquetpass.tv"]);

      expect(await portalRow(admin)).toEqual({ role: "admin", granted_by: null });
      expect(await linkOf(returningCuenta)).toBe(returning);
      expect((await portalRow(returning))?.role).toBe("collaborator");

      const created = await linkOf(neverCuenta);
      expect(created).toBeTruthy();
      const [identity] = await sql`
        SELECT email, email_verified FROM auth_user WHERE id = ${created}`;
      expect(identity).toEqual({ email: "never.logged@basquetpass.tv", email_verified: true });
      expect((await portalRow(created as string))?.role).toBe("editor");
      // No login is minted: they sign in with a magic link when they need to.
      expect((await sql`SELECT count(*)::int AS n FROM auth_session`)[0].n).toBe(0);
    });

    it("is idempotent and never overrides a role already set", async () => {
      const editor = await seedAuthUser(sql, { email: "editor@basquetpass.tv" });
      const admin = await seedAuthUser(sql, { email: "admin@basquetpass.tv" });
      await seedLegacyCuenta({ email: "editor@basquetpass.tv", role: "editor", auth_user_id: editor });
      await seedLegacyCuenta({ email: "admin@basquetpass.tv", role: "admin", auth_user_id: admin });
      await seedLegacyCuenta({ email: "never.logged@basquetpass.tv", role: "collaborator" });
      // Re-tiered in the Auth DB since: the seed must not undo it.
      await grantPortalRole({ userId: editor, role: "collaborator", grantedBy: admin });

      const first = await seedPortalAccesosFromProfiles();
      expect(first.granted.map((r) => r.email)).toEqual([
        "admin@basquetpass.tv",
        "never.logged@basquetpass.tv",
      ]);
      expect(first.alreadyHad.map((r) => r.email)).toEqual(["editor@basquetpass.tv"]);
      expect((await portalRow(editor))?.role).toBe("collaborator");

      const second = await seedPortalAccesosFromProfiles();
      expect(second.granted).toEqual([]);
      expect(second.createdIdentities).toEqual([]);
      expect(second.alreadyHad).toHaveLength(3);
      expect((await sql`SELECT count(*)::int AS n FROM auth_user`)[0].n).toBe(3);
    });

    it("writes nothing in dry-run", async () => {
      const editor = await seedAuthUser(sql, { email: "editor@basquetpass.tv" });
      await seedLegacyCuenta({ email: "editor@basquetpass.tv", role: "editor", auth_user_id: editor });
      const neverCuenta = await seedLegacyCuenta({ email: "never.logged@basquetpass.tv", role: "admin" });

      const report = await seedPortalAccesosFromProfiles({ dryRun: true });

      expect(report.granted.map((r) => r.email)).toEqual([
        "editor@basquetpass.tv",
        "never.logged@basquetpass.tv",
      ]);
      expect(report.createdIdentities).toEqual(["never.logged@basquetpass.tv"]);
      expect(await portalRow(editor)).toBeNull();
      expect(await linkOf(neverCuenta)).toBeNull();
      expect((await sql`SELECT count(*)::int AS n FROM auth_user`)[0].n).toBe(1);
    });
  });
});
