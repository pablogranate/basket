import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { getAcceso, grantAcceso } from "@/lib/acceso/accesos";
import { seedGeneratorAccesoForFullAccessRoles } from "@/lib/acceso/seed-generator";
import { seedAuthUser, testSql, truncateAll } from "@/test/integration/db";

// Deploy-day seed (basket#173): every portal admin and editor keeps the
// generator, now as a `generator` Acceso instead of the dashboard.full
// capability. Reads Cuentas from the Domain DB, writes Accesos to the Auth DB.
describe("seed generator Acceso for full-access roles (integration)", () => {
  const sql = testSql();
  type Sql = typeof sql;

  beforeAll(async () => {
    await sql`SELECT 1`;
  });

  afterAll(async () => {
    await sql.end();
  });

  beforeEach(async () => {
    await truncateAll(sql);
  });

  async function seedProfile(
    exec: Sql,
    values: { email: string; role: string; auth_user_id?: string | null },
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

  it("grants generator/write to linked admins and editors, matches unlinked ones by email, skips the rest", async () => {
    const admin = await seedAuthUser(sql, { email: "admin@basquetpass.tv" });
    const editor = await seedAuthUser(sql, { email: "editor@basquetpass.tv" });
    const unlinkedEditor = await seedAuthUser(sql, { email: "Unlinked.Editor@basquetpass.tv" });
    const collaborator = await seedAuthUser(sql, { email: "colab@basquetpass.tv" });
    await seedProfile(sql, { email: "admin@basquetpass.tv", role: "admin", auth_user_id: admin });
    await seedProfile(sql, { email: "editor@basquetpass.tv", role: "editor", auth_user_id: editor });
    // Never logged in since the Better Auth cutover: no auth_user_id yet, same email.
    await seedProfile(sql, { email: "unlinked.editor@basquetpass.tv", role: "editor" });
    await seedProfile(sql, { email: "colab@basquetpass.tv", role: "collaborator", auth_user_id: collaborator });
    // Full-access Cuenta with no identity at all: nothing to grant to yet.
    await seedProfile(sql, { email: "ghost@basquetpass.tv", role: "admin" });

    const report = await seedGeneratorAccesoForFullAccessRoles();

    expect(report.granted.map((r) => r.email).sort()).toEqual([
      "admin@basquetpass.tv",
      "editor@basquetpass.tv",
      "unlinked.editor@basquetpass.tv",
    ]);
    expect(report.alreadyHad).toEqual([]);
    expect(report.noIdentity.map((r) => r.email)).toEqual(["ghost@basquetpass.tv"]);

    for (const userId of [admin, editor, unlinkedEditor]) {
      expect(await getAcceso(userId, "generator")).toMatchObject({
        level: "write",
        grantedBy: null,
      });
    }
    expect(await getAcceso(collaborator, "generator")).toBeNull();
    // Seed only touches the generator column.
    expect(await getAcceso(admin, "ops")).toBeNull();
  });

  it("is idempotent and never overrides a Nivel an admin already set", async () => {
    const admin = await seedAuthUser(sql, { email: "admin@basquetpass.tv" });
    const editor = await seedAuthUser(sql, { email: "editor@basquetpass.tv" });
    await seedProfile(sql, { email: "admin@basquetpass.tv", role: "admin", auth_user_id: admin });
    await seedProfile(sql, { email: "editor@basquetpass.tv", role: "editor", auth_user_id: editor });
    await grantAcceso({ userId: editor, app: "generator", level: "read", grantedBy: admin });

    const first = await seedGeneratorAccesoForFullAccessRoles();
    expect(first.granted.map((r) => r.email)).toEqual(["admin@basquetpass.tv"]);
    expect(first.alreadyHad.map((r) => r.email)).toEqual(["editor@basquetpass.tv"]);

    const second = await seedGeneratorAccesoForFullAccessRoles();
    expect(second.granted).toEqual([]);
    expect(second.alreadyHad).toHaveLength(2);

    expect(await getAcceso(editor, "generator")).toMatchObject({
      level: "read",
      grantedBy: admin,
    });
  });

  it("dry run reports the plan and writes nothing", async () => {
    const admin = await seedAuthUser(sql, { email: "admin@basquetpass.tv" });
    await seedProfile(sql, { email: "admin@basquetpass.tv", role: "admin", auth_user_id: admin });

    const report = await seedGeneratorAccesoForFullAccessRoles({ dryRun: true });

    expect(report.granted.map((r) => r.email)).toEqual(["admin@basquetpass.tv"]);
    expect(await getAcceso(admin, "generator")).toBeNull();
  });
});
