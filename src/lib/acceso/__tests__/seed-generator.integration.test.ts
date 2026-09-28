import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { grantRole } from "@/lib/acceso/accesos";
import { seedGeneratorAccesoForFullAccessRoles } from "@/lib/acceso/seed-generator";
import { accessRow, seedAuthUser, testSql, truncateAll } from "@/test/integration/db";

// Deploy-day seed (basket#173): every portal admin and editor keeps the
// generator, now as a `generator` Acceso instead of the dashboard.full
// capability. Reads portal Accesos, writes generator ones, both in the Auth DB.
describe("seed generator Acceso for full-access roles (integration)", () => {
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

  async function portalUser(email: string, role: string) {
    const userId = await seedAuthUser(sql, { email });
    await grantRole({ userId, app: "portal", role, grantedBy: null });
    return userId;
  }

  it("grants generator/write to portal admins and editors and skips the rest", async () => {
    const admin = await portalUser("admin@basquetpass.tv", "admin");
    const editor = await portalUser("Editor@basquetpass.tv", "editor");
    const collaborator = await portalUser("colab@basquetpass.tv", "collaborator");
    const noPortal = await seedAuthUser(sql, { email: "ops.only@gmail.com" });
    await grantRole({ userId: noPortal, app: "ops", role: "admin", grantedBy: null });

    const report = await seedGeneratorAccesoForFullAccessRoles();

    expect(report.granted.map((r) => [r.email, r.role])).toEqual([
      ["admin@basquetpass.tv", "admin"],
      ["editor@basquetpass.tv", "editor"],
    ]);
    expect(report.alreadyHad).toEqual([]);

    for (const userId of [admin, editor]) {
      expect(await accessRow(sql, userId, "generator")).toEqual({
        role: "write",
        grantedBy: null,
      });
    }
    expect(await accessRow(sql, collaborator, "generator")).toBeNull();
    expect(await accessRow(sql, noPortal, "generator")).toBeNull();
    // Seed only touches the generator column.
    expect(await accessRow(sql, admin, "ops")).toBeNull();
  });

  it("is idempotent and never overrides a role an admin already set", async () => {
    const admin = await portalUser("admin@basquetpass.tv", "admin");
    const editor = await portalUser("editor@basquetpass.tv", "editor");
    await grantRole({ userId: editor, app: "generator", role: "read", grantedBy: admin });

    const first = await seedGeneratorAccesoForFullAccessRoles();
    expect(first.granted.map((r) => r.email)).toEqual(["admin@basquetpass.tv"]);
    expect(first.alreadyHad.map((r) => r.email)).toEqual(["editor@basquetpass.tv"]);

    const second = await seedGeneratorAccesoForFullAccessRoles();
    expect(second.granted).toEqual([]);
    expect(second.alreadyHad).toHaveLength(2);

    expect(await accessRow(sql, editor, "generator")).toEqual({
      role: "read",
      grantedBy: admin,
    });
  });

  it("dry run reports the plan and writes nothing", async () => {
    const admin = await portalUser("admin@basquetpass.tv", "admin");

    const report = await seedGeneratorAccesoForFullAccessRoles({ dryRun: true });

    expect(report.granted.map((r) => r.email)).toEqual(["admin@basquetpass.tv"]);
    expect(await accessRow(sql, admin, "generator")).toBeNull();
  });
});
