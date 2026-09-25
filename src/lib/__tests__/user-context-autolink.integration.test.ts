import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { grantPortalRole } from "@/lib/acceso/portal";
import { seedAuthUser, testSql, truncateAll } from "@/test/integration/db";

// First-login auto-link (basket#186): the unlinked Cuenta's profiles.role
// becomes the identity's portal Acceso, against the real Domain and Auth DBs.
const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));

vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("@/lib/auth/server", () => ({ auth: { api: { getSession } } }));

import { clearProfileCache, getUserContext } from "@/lib/auth";

describe("getUserContext first-login auto-link (integration)", () => {
  const sql = testSql();

  afterAll(async () => {
    await sql.end();
  });

  beforeEach(async () => {
    await truncateAll(sql);
    clearProfileCache();
  });

  async function seedUnlinkedProfile(email: string, role: string) {
    const id = crypto.randomUUID();
    await sql`INSERT INTO profiles ${sql({ id, email, role, full_name: email })}`;
    return id;
  }

  async function portalRole(userId: string) {
    const rows = await sql<{ role: string }[]>`
      SELECT role FROM auth_app_access WHERE user_id = ${userId} AND app = 'portal'
    `;
    return rows[0]?.role ?? null;
  }

  it("stamps the link and creates the portal Acceso from profiles.role", async () => {
    const userId = await seedAuthUser(sql, { email: "ana@basquetpass.tv" });
    const profileId = await seedUnlinkedProfile("Ana@basquetpass.tv", "editor");
    getSession.mockResolvedValue({ user: { id: userId, email: "ana@basquetpass.tv" } });

    const context = await getUserContext();

    expect(context).toMatchObject({ profileId, role: "editor", hasAccess: true });
    expect(await portalRole(userId)).toBe("editor");
    const [profile] = await sql`SELECT auth_user_id FROM profiles WHERE id = ${profileId}`;
    expect(profile.auth_user_id).toBe(userId);
  });

  it("keeps a portal Acceso granted before the first login", async () => {
    const userId = await seedAuthUser(sql, { email: "ana@basquetpass.tv" });
    await seedUnlinkedProfile("ana@basquetpass.tv", "editor");
    await grantPortalRole({ userId, role: "collaborator", grantedBy: null });
    getSession.mockResolvedValue({ user: { id: userId, email: "ana@basquetpass.tv" } });

    const context = await getUserContext();

    expect(context).toMatchObject({ role: "collaborator", hasAccess: true });
    expect(await portalRole(userId)).toBe("collaborator");
  });
});
