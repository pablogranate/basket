import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { grantPortalRole } from "@/lib/acceso/portal";
import { seedAuthUser, testSql, truncateAll } from "@/test/integration/db";

// getUserContext against the real Domain and Auth DBs (basket#189): the portal
// Acceso decides access, the Cuenta supplies the domain actor id, and a super
// admin gets their Cuenta on the first visit.
const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));

vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("@/lib/auth/server", () => ({ auth: { api: { getSession } } }));

import { clearProfileCache, getUserContext } from "@/lib/auth";

describe("getUserContext (integration)", () => {
  const sql = testSql();

  afterAll(async () => {
    await sql.end();
  });

  beforeEach(async () => {
    await truncateAll(sql);
    clearProfileCache();
  });

  async function seedCuenta(email: string, authUserId: string | null = null) {
    const id = crypto.randomUUID();
    await sql`INSERT INTO profiles ${sql({ id, email, full_name: email, auth_user_id: authUserId })}`;
    return id;
  }

  function signIn(userId: string, email: string, name = "Ana") {
    getSession.mockResolvedValue({ user: { id: userId, email, name } });
  }

  it("links an unlinked Cuenta by email at first login and reads the role from the portal Acceso", async () => {
    const userId = await seedAuthUser(sql, { email: "ana@basquetpass.tv" });
    const profileId = await seedCuenta("Ana@basquetpass.tv");
    await grantPortalRole({ userId, role: "editor", grantedBy: null });
    signIn(userId, "ana@basquetpass.tv");

    const context = await getUserContext();

    expect(context).toMatchObject({ profileId, role: "editor", hasAccess: true, superAdmin: false });
    const [profile] = await sql`SELECT auth_user_id FROM profiles WHERE id = ${profileId}`;
    expect(profile.auth_user_id).toBe(userId);
  });

  it("denies a Cuenta whose identity holds no portal Acceso", async () => {
    const userId = await seedAuthUser(sql, { email: "ana@basquetpass.tv" });
    await seedCuenta("ana@basquetpass.tv", userId);
    signIn(userId, "ana@basquetpass.tv");

    expect(await getUserContext()).toMatchObject({ profileId: null, hasAccess: false });
  });

  it("keeps an identity with a portal Acceso but no Cuenta unprovisioned", async () => {
    const userId = await seedAuthUser(sql, { email: "ana@basquetpass.tv" });
    await grantPortalRole({ userId, role: "collaborator", grantedBy: null });
    signIn(userId, "ana@basquetpass.tv");

    expect(await getUserContext()).toMatchObject({ profileId: null, hasAccess: false });
    expect((await sql`SELECT count(*)::int AS n FROM profiles`)[0].n).toBe(0);
  });

  it("creates the Cuenta of a super admin on the first visit, once", async () => {
    const boss = await seedAuthUser(sql, { email: "Boss@basquetpass.tv" });
    await sql`UPDATE auth_user SET role = 'superadmin' WHERE id = ${boss}`;
    signIn(boss, "Boss@basquetpass.tv", "Boss");

    const first = await getUserContext();

    expect(first).toMatchObject({ role: "admin", superAdmin: true, hasAccess: true, canEdit: true });
    const [cuenta] = await sql`SELECT id, email, full_name, auth_user_id FROM profiles`;
    expect(cuenta).toMatchObject({ email: "boss@basquetpass.tv", full_name: "Boss", auth_user_id: boss });
    expect(first.profileId).toBe(cuenta.id);

    clearProfileCache();
    const second = await getUserContext();
    expect(second.profileId).toBe(cuenta.id);
    expect((await sql`SELECT count(*)::int AS n FROM profiles`)[0].n).toBe(1);
  });
});
