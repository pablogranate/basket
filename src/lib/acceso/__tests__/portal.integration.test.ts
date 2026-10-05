import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  getPortalAccess,
  grantPortalRole,
  revokePortalRole,
} from "@/lib/acceso/portal";
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

  it("resolves a super admin to admin without a portal row", async () => {
    const boss = await seedAuthUser(sql, { email: "boss@basquetpass.tv" });
    await sql`UPDATE auth_user SET role = 'superadmin' WHERE id = ${boss}`;

    expect(await getPortalAccess(boss)).toEqual({ role: "admin", superAdmin: true });
  });
});
